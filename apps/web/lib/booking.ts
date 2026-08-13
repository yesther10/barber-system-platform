/**
 * Booking service (booking spec, tasks 4.4-4.5).
 *
 * Booking creation requires an authenticated client, snapshots the service
 * price at booking time, and writes the appointment + its confirmation
 * outbox row in ONE transaction. Slot conflict prevention is application
 * level (design Decision 4 — MySQL has no exclusion constraints): inside the
 * transaction we `SELECT ... FOR UPDATE` the barber row (serializing
 * concurrent bookings for the same barber), re-check overlap against
 * appointments in [startsAt, endsAt), then INSERT; an overlap → conflict
 * (409). Reschedule moves the appointment atomically (freeing the old slot,
 * taking the new one under the same lock) and enqueues a RESCHEDULE
 * notification; cancellation respects the tenant's cancellation window and
 * enqueues a CANCELLATION notification. Lifecycle follows the spec:
 * pending → confirmed → completed and pending|confirmed → cancelled; any
 * other transition is rejected.
 */
import type { Appointment, Prisma, PrismaClient } from "@barber/db";
import { AppointmentStatus, NotificationStatus, NotificationType, PaymentStatus } from "@barber/db";
import { CancelInput, CreateBookingInput, RescheduleInput } from "@barber/contracts";
import type {
  AppointmentView,
  PaymentStatus as ContractPaymentStatus,
} from "@barber/contracts";
import { BarberNotFoundError, ServiceNotFoundError } from "./catalog";
import { confirmsImmediately, requireOnboarded, TenantNotFoundError } from "./onboarding";
import { dateKeyInTz, PastDateError, weekdayOfDateKey, zonedToUtc } from "./slots";

/** Thrown when a booking payload fails the contract. */
export class BookingInvalidInputError extends Error {
  readonly code = "INVALID_INPUT" as const;
}

/** Thrown when booking a deactivated service (unbookable by spec). */
export class ServiceInactiveError extends Error {
  readonly code = "SERVICE_INACTIVE" as const;
}

/** Thrown when booking a deactivated barber. */
export class BarberInactiveError extends Error {
  readonly code = "BARBER_INACTIVE" as const;
}

/** Thrown when the barber does not offer the service (assignment list). */
export class ServiceNotAssignedError extends Error {
  readonly code = "SERVICE_NOT_ASSIGNED" as const;
}

/** Thrown when the requested slot overlaps an existing appointment. */
export class BookingSlotConflictError extends Error {
  readonly code = "SLOT_CONFLICT" as const;
}

/** Thrown when the requested window falls outside the barber's schedule. */
export class SlotOutsideScheduleError extends Error {
  readonly code = "SLOT_OUTSIDE_SCHEDULE" as const;
}

/** Thrown when the appointment is not found for this client+tenant. */
export class AppointmentNotFoundError extends Error {
  readonly code = "APPOINTMENT_NOT_FOUND" as const;
}

/** Thrown when a lifecycle operation violates the status lifecycle. */
export class InvalidTransitionError extends Error {
  readonly code = "INVALID_TRANSITION" as const;

  constructor(message = "Invalid appointment status transition") {
    super(message);
    this.name = "InvalidTransitionError";
  }
}

/** Thrown when cancelling inside the free-cancel window under policy reject. */
export class LateCancelRejectedError extends Error {
  readonly code = "LATE_CANCEL_REJECTED" as const;
}

/** Thrown when rescheduling an appointment inside the reschedule window. */
export class RescheduleWindowRejectedError extends Error {
  readonly code = "RESCHEDULE_WINDOW" as const;
}

const HOUR_MS = 3_600_000;

const CONTRACT_STATUS: Record<AppointmentStatus, "pending" | "confirmed" | "completed" | "cancelled"> = {
  PENDING: "pending",
  CONFIRMED: "confirmed",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
};

/** Maps the DB appointment status enum to the lowercase contract value. */
export function mapAppointmentStatusToContract(
  status: AppointmentStatus,
): "pending" | "confirmed" | "completed" | "cancelled" {
  return CONTRACT_STATUS[status];
}

const CONTRACT_PAYMENT: Record<PaymentStatus, ContractPaymentStatus> = {
  PENDING: "pending",
  PAID: "paid",
  EXPIRED: "expired",
  REFUNDED: "refunded",
};

/** Maps the DB payment status enum to the lowercase contract value. */
export function mapPaymentStatusToContract(status: PaymentStatus): ContractPaymentStatus {
  return CONTRACT_PAYMENT[status];
}

/** The only allowed status transitions (booking spec lifecycle). */
const TRANSITIONS: Record<string, string[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

/** Rejects any status transition outside the spec lifecycle. */
export function assertTransition(from: "pending" | "confirmed" | "completed" | "cancelled", to: string): void {
  if (!TRANSITIONS[from]?.includes(to)) {
    throw new InvalidTransitionError(`${from} → ${to} is not a valid appointment transition`);
  }
}

/** True when the appointment starts inside the tenant's free-cancel window. */
export function isLateCancel(startsAt: Date, now: Date, freeCancelWindowHours: number): boolean {
  return startsAt.getTime() - now.getTime() < freeCancelWindowHours * HOUR_MS;
}

/** True when the appointment is far enough out to be rescheduled. */
export function isRescheduleAllowed(startsAt: Date, now: Date, rescheduleWindowHours: number): boolean {
  return startsAt.getTime() - now.getTime() >= rescheduleWindowHours * HOUR_MS;
}

/** True when the start time is not in the past. */
export function isFuture(startsAt: Date, now: Date): boolean {
  return startsAt.getTime() >= now.getTime();
}

/** Maps a Prisma appointment row (Decimal, Date, enums) to the contract view. */
export function toAppointmentView(appointment: Appointment): AppointmentView {
  return {
    id: appointment.id,
    barbershopId: appointment.barbershopId,
    barberId: appointment.barberId,
    clientId: appointment.clientId,
    serviceId: appointment.serviceId,
    startsAt: appointment.startsAt.toISOString(),
    endsAt: appointment.endsAt.toISOString(),
    status: mapAppointmentStatusToContract(appointment.status),
    priceSnapshot: Number(appointment.priceSnapshot),
    paymentStatus: mapPaymentStatusToContract(appointment.paymentStatus),
    noShowAt: appointment.noShowAt ? appointment.noShowAt.toISOString() : null,
    cancelReason: appointment.cancelReason,
  };
}

export interface BookingContext {
  clientId: string;
  /** Injectable clock for deterministic window/past-date behavior. */
  now?: Date;
}

/**
 * Serializes concurrent bookings for the same barber: the lock is taken
 * BEFORE the overlap re-check, so the second transaction waits for the first
 * to commit and then sees its appointment (MySQL REPEATABLE READ snapshots
 * are established by the first consistent read, which happens after the
 * locking read acquires the row).
 */
async function lockBarber(tx: Prisma.TransactionClient, barberId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM Barber WHERE id = ${barberId} FOR UPDATE`;
}

/** Appointments of the barber overlapping [startsAt, endsAt), minus cancelled. */
async function conflictingAppointments(
  tx: Prisma.TransactionClient,
  barberId: string,
  startsAt: Date,
  endsAt: Date,
  excludeId?: string,
): Promise<{ id: string }[]> {
  return tx.appointment.findMany({
    where: {
      barberId,
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
      status: { not: AppointmentStatus.CANCELLED },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
}

/**
 * Re-validates that [startsAt, endsAt) fits inside the barber's weekly
 * schedule minus one-off exceptions for that date (booking a time the grid
 * never offered is rejected).
 */
async function assertFitsSchedule(
  db: PrismaClient,
  barberId: string,
  startsAt: Date,
  endsAt: Date,
  timezone: string,
): Promise<void> {
  const dateKey = dateKeyInTz(startsAt, timezone);
  const weekday = weekdayOfDateKey(dateKey);
  const [schedules, exceptions] = await Promise.all([
    db.schedule.findMany({
      where: { barberId, dayOfWeek: weekday },
      select: { startTime: true, endTime: true },
    }),
    db.scheduleException.findMany({
      where: { barberId, date: new Date(`${dateKey}T00:00:00.000Z`) },
      select: { startTime: true, endTime: true },
    }),
  ]);

  let windows = schedules.map((w) => ({
    start: zonedToUtc(dateKey, w.startTime, timezone).getTime(),
    end: zonedToUtc(dateKey, w.endTime, timezone).getTime(),
  }));
  for (const exception of exceptions) {
    const ex = {
      start: zonedToUtc(dateKey, exception.startTime, timezone).getTime(),
      end: zonedToUtc(dateKey, exception.endTime, timezone).getTime(),
    };
    const next: typeof windows = [];
    for (const window of windows) {
      if (ex.end <= window.start || ex.start >= window.end) {
        next.push(window);
        continue;
      }
      if (ex.start > window.start) next.push({ start: window.start, end: ex.start });
      if (ex.end < window.end) next.push({ start: ex.end, end: window.end });
    }
    windows = next;
  }

  const start = startsAt.getTime();
  const end = endsAt.getTime();
  const fits = windows.some((w) => w.start <= start && end <= w.end);
  if (!fits) throw new SlotOutsideScheduleError();
}

interface OutboxEntry {
  appointmentId: string;
  type: keyof typeof NotificationType;
  now: Date;
  payload?: unknown;
}

/** Transactional outbox: writes the notification row with the event. */
async function queueNotification(tx: Prisma.TransactionClient, entry: OutboxEntry): Promise<void> {
  await tx.emailNotification.create({
    data: {
      appointmentId: entry.appointmentId,
      type: NotificationType[entry.type],
      status: NotificationStatus.QUEUED,
      nextAttemptAt: entry.now,
      payload: entry.payload ?? { appointmentId: entry.appointmentId },
    },
  });
}

/**
 * POST /api/bookings — creates an appointment + confirmation outbox row in
 * one transaction. The barbershop is resolved from the requested service; the
 * tenant must be onboarded; the slot is re-validated under the barber lock.
 */
export async function createBooking(
  db: PrismaClient,
  ctx: BookingContext,
  input: unknown,
): Promise<AppointmentView> {
  const now = ctx.now ?? new Date();
  const parsed = CreateBookingInput.safeParse(input);
  if (!parsed.success) throw new BookingInvalidInputError();
  const { serviceId, barberId, startsAt: startsAtIso } = parsed.data;
  const startsAt = new Date(startsAtIso);
  if (!isFuture(startsAt, now)) throw new PastDateError(startsAtIso);

  const service = await db.service.findUnique({ where: { id: serviceId } });
  if (!service) throw new ServiceNotFoundError();
  const barbershopId = service.barbershopId;
  await requireOnboarded(db, barbershopId);

  const [shop, barber, client] = await Promise.all([
    db.barbershop.findUnique({ where: { id: barbershopId } }),
    db.barber.findFirst({
      where: { id: barberId, barbershopId },
      include: { user: { select: { name: true, email: true } } },
    }),
    db.user.findUnique({ where: { id: ctx.clientId }, select: { email: true } }),
  ]);
  if (!shop) throw new TenantNotFoundError();
  if (!barber) throw new BarberNotFoundError();
  if (!service.active) throw new ServiceInactiveError();
  if (!barber.active) throw new BarberInactiveError();

  const assigned = await db.barberService.findUnique({
    where: { barberId_serviceId: { barberId, serviceId } },
  });
  if (!assigned) throw new ServiceNotAssignedError();

  const durationMinutes = service.durationMinutes;
  const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);
  await assertFitsSchedule(db, barberId, startsAt, endsAt, shop.timezone);

  const status = confirmsImmediately(shop.confirmationMode)
    ? AppointmentStatus.CONFIRMED
    : AppointmentStatus.PENDING;

  const appointment = await db.$transaction(async (tx) => {
    await lockBarber(tx, barberId);
    const conflicts = await conflictingAppointments(tx, barberId, startsAt, endsAt);
    if (conflicts.length > 0) throw new BookingSlotConflictError();

    const row = await tx.appointment.create({
      data: {
        barbershopId,
        barberId,
        clientId: ctx.clientId,
        serviceId,
        startsAt,
        endsAt,
        status,
        priceSnapshot: service.priceBRL,
        paymentStatus: PaymentStatus.PENDING,
      },
    });
    await queueNotification(tx, {
      appointmentId: row.id,
      type: "CONFIRMATION",
      now,
      payload: {
        appointmentId: row.id,
        clientEmail: client?.email ?? null,
        serviceName: service.name,
        barberName: barber.user.name ?? null,
        startsAt: row.startsAt.toISOString(),
        endsAt: row.endsAt.toISOString(),
        priceBRL: Number(service.priceBRL),
        status: mapAppointmentStatusToContract(row.status),
      },
    });
    return row;
  });

  return toAppointmentView(appointment);
}

interface LifecycleContext extends BookingContext {
  appointmentId: string;
  /** Tenant scope for defense-in-depth; the clientId already narrows to one shop. */
  barbershopId?: string;
}

/**
 * PUT /api/bookings/:id — reschedules an appointment: frees the old slot and
 * takes the new one in a single transaction (barber lock + re-validation),
 * respecting the tenant reschedule window, and enqueues a RESCHEDULE outbox
 * row. Only pending|confirmed appointments may move.
 */
export async function rescheduleAppointment(
  db: PrismaClient,
  ctx: LifecycleContext,
  input: unknown,
): Promise<AppointmentView> {
  const now = ctx.now ?? new Date();
  const parsed = RescheduleInput.safeParse(input);
  if (!parsed.success) throw new BookingInvalidInputError();
  const newStartsAt = new Date(parsed.data.startsAt);
  if (!isFuture(newStartsAt, now)) throw new PastDateError(parsed.data.startsAt);

  const appointment = await db.appointment.findFirst({
    where: { id: ctx.appointmentId, barbershopId: ctx.barbershopId, clientId: ctx.clientId },
    include: { barbershop: true, service: true, barber: true },
  });
  if (!appointment) throw new AppointmentNotFoundError();

  const status = mapAppointmentStatusToContract(appointment.status);
  if (status !== "pending" && status !== "confirmed") {
    throw new InvalidTransitionError(`cannot reschedule a ${status} appointment`);
  }
  if (!isRescheduleAllowed(appointment.startsAt, now, appointment.barbershop.rescheduleWindowHours)) {
    throw new RescheduleWindowRejectedError();
  }

  const durationMinutes = appointment.service.durationMinutes;
  const endsAt = new Date(newStartsAt.getTime() + durationMinutes * 60_000);
  await assertFitsSchedule(db, appointment.barberId, newStartsAt, endsAt, appointment.barbershop.timezone);

  const updated = await db.$transaction(async (tx) => {
    await lockBarber(tx, appointment.barberId);
    const conflicts = await conflictingAppointments(tx, appointment.barberId, newStartsAt, endsAt, appointment.id);
    if (conflicts.length > 0) throw new BookingSlotConflictError();

    const row = await tx.appointment.update({
      where: { id: appointment.id },
      data: { startsAt: newStartsAt, endsAt },
    });
    await queueNotification(tx, {
      appointmentId: row.id,
      type: "RESCHEDULE",
      now,
      payload: {
        appointmentId: row.id,
        previousStartsAt: appointment.startsAt.toISOString(),
        startsAt: row.startsAt.toISOString(),
        endsAt: row.endsAt.toISOString(),
      },
    });
    return row;
  });

  return toAppointmentView(updated);
}

/**
 * POST /api/bookings/:id/cancel — cancels a pending|confirmed appointment
 * respecting the tenant's cancellation window (late + policy reject → 409),
 * frees the slot and enqueues a CANCELLATION outbox row. Completed or
 * cancelled appointments cannot be cancelled again (invalid transition).
 */
export async function cancelAppointment(
  db: PrismaClient,
  ctx: LifecycleContext,
  input: unknown,
): Promise<AppointmentView> {
  const now = ctx.now ?? new Date();
  const parsed = CancelInput.safeParse(input);
  if (!parsed.success) throw new BookingInvalidInputError();

  const appointment = await db.appointment.findFirst({
    where: { id: ctx.appointmentId, barbershopId: ctx.barbershopId, clientId: ctx.clientId },
    include: { barbershop: true },
  });
  if (!appointment) throw new AppointmentNotFoundError();

  const status = mapAppointmentStatusToContract(appointment.status);
  assertTransition(status, "cancelled");

  if (isLateCancel(appointment.startsAt, now, appointment.barbershop.freeCancelWindowHours)) {
    if (appointment.barbershop.lateCancelPolicy === "REJECT") {
      throw new LateCancelRejectedError();
    }
  }

  const updated = await db.$transaction(async (tx) => {
    const row = await tx.appointment.update({
      where: { id: appointment.id },
      data: { status: AppointmentStatus.CANCELLED, cancelReason: parsed.data.reason ?? null },
    });
    await queueNotification(tx, {
      appointmentId: row.id,
      type: "CANCELLATION",
      now,
      payload: {
        appointmentId: row.id,
        reason: parsed.data.reason ?? null,
        startsAt: appointment.startsAt.toISOString(),
      },
    });
    return row;
  });

  return toAppointmentView(updated);
}
