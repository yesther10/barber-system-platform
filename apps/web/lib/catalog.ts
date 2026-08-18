/**
 * Catalog services (catalog spec, task 4.1).
 *
 * Tenant-scoped CRUD for services, barber profiles, weekly schedules and
 * one-off exceptions, consumed by the /api/admin/* routes. Deactivating a
 * service makes it unbookable (the public catalog only lists active
 * services) without altering existing appointments. Every read/write is
 * scoped to the caller's `barbershopId`; a resource owned by another tenant
 * resolves to NotFound (404) so cross-tenant access never leaks data.
 */
import type { Barber, PrismaClient, Schedule, ScheduleException, Service } from "@barber/db";
import {
  BarberUpdate,
  CreateBarberInput,
  CreateScheduleExceptionInput,
  CreateScheduleInput,
  ScheduleInput,
  ServiceInput,
  ServiceUpdate,
} from "@barber/contracts";
import type {
  BarberView,
  PublicBarberView,
  PublicBarbershopView,
  ScheduleExceptionView,
  ScheduleView,
  ServiceView,
} from "@barber/contracts";
import { TenantNotFoundError } from "./onboarding";

/** Thrown when a service payload/update fails the contract or domain rules. */
export class InvalidInputError extends Error {
  readonly code = "INVALID_INPUT" as const;

  constructor(message = "Invalid catalog input") {
    super(message);
    this.name = "InvalidInputError";
  }
}

/** Thrown when a service does not exist in the caller's tenant. */
export class ServiceNotFoundError extends Error {
  readonly code = "SERVICE_NOT_FOUND" as const;
}

/** Thrown when deleting a service that still has appointments (would orphan rows). */
export class ServiceHasAppointmentsError extends Error {
  readonly code = "SERVICE_IN_USE" as const;
}

/** Thrown when a barber profile does not exist in the caller's tenant. */
export class BarberNotFoundError extends Error {
  readonly code = "BARBER_NOT_FOUND" as const;
}

/** Thrown when the profile's user is missing, not a BARBER, or not in the tenant. */
export class BarberUserError extends Error {
  readonly code = "BARBER_USER_INVALID" as const;
}

/** Thrown when a schedule entry does not exist in the caller's tenant. */
export class ScheduleNotFoundError extends Error {
  readonly code = "SCHEDULE_NOT_FOUND" as const;
}

/** Thrown when an exception does not exist in the caller's tenant. */
export class ExceptionNotFoundError extends Error {
  readonly code = "EXCEPTION_NOT_FOUND" as const;
}

/** Thrown when a window's end is not strictly after its start. */
export class WindowOrderError extends Error {
  readonly code = "WINDOW_ORDER" as const;

  constructor(message = "Window endTime must be after startTime") {
    super(message);
    this.name = "WindowOrderError";
  }
}

/**
 * Domain rule for every availability window (schedule + exception): the end
 * must be strictly after the start. HH:MM strings compare lexically because
 * they are zero-padded 24h.
 */
export function assertWindowOrder(startTime: string, endTime: string): void {
  if (startTime >= endTime) throw new WindowOrderError();
}

/** Formats a Date as the YYYY-MM-DD calendar date it represents (UTC). */
export function dateKeyOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Maps a Prisma service row (Decimal price) to the contract view (number). */
export function toServiceView(service: Service): ServiceView {
  return {
    id: service.id,
    name: service.name,
    description: service.description ?? undefined,
    priceBRL: Number(service.priceBRL),
    durationMinutes: service.durationMinutes,
    active: service.active,
    createdAt: service.createdAt.toISOString(),
    updatedAt: service.updatedAt.toISOString(),
  };
}

/** Maps a Prisma barber row to the contract view. */
export function toBarberView(barber: Barber): BarberView {
  return {
    id: barber.id,
    userId: barber.userId,
    specialties: barber.specialties as string[],
    bio: barber.bio ?? undefined,
    active: barber.active,
    createdAt: barber.createdAt.toISOString(),
    updatedAt: barber.updatedAt.toISOString(),
  };
}

/** Maps a Prisma barber row to the public catalog view (deliberately no userId). */
export function toPublicBarberView(barber: Barber): PublicBarberView {
  return {
    id: barber.id,
    specialties: barber.specialties as string[],
    bio: barber.bio ?? undefined,
    active: barber.active,
  };
}

/** Maps a Prisma schedule row to the contract view. */
export function toScheduleView(schedule: Schedule): ScheduleView {
  return {
    id: schedule.id,
    dayOfWeek: schedule.dayOfWeek,
    startTime: schedule.startTime,
    endTime: schedule.endTime,
  };
}

/** Maps a Prisma exception row (Date column) to the contract view. */
export function toExceptionView(exception: ScheduleException): ScheduleExceptionView {
  return {
    id: exception.id,
    date: dateKeyOf(exception.date),
    startTime: exception.startTime,
    endTime: exception.endTime,
    reason: exception.reason ?? undefined,
  };
}

async function scopedService(db: PrismaClient, barbershopId: string, id: string): Promise<Service> {
  const row = await db.service.findFirst({ where: { id, barbershopId } });
  if (!row) throw new ServiceNotFoundError();
  return row;
}

async function scopedBarber(db: PrismaClient, barbershopId: string, id: string): Promise<Barber> {
  const row = await db.barber.findFirst({ where: { id, barbershopId } });
  if (!row) throw new BarberNotFoundError();
  return row;
}

/** All services of the tenant; only active ones unless `includeInactive`. */
export async function listServices(
  db: PrismaClient,
  barbershopId: string,
  opts: { includeInactive?: boolean } = {},
): Promise<ServiceView[]> {
  const rows = await db.service.findMany({
    where: { barbershopId, ...(opts.includeInactive ? {} : { active: true }) },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(toServiceView);
}

/** Creates a tenant-scoped service from the contract payload. */
export async function createService(db: PrismaClient, barbershopId: string, input: unknown): Promise<ServiceView> {
  const parsed = ServiceInput.safeParse(input);
  if (!parsed.success) throw new InvalidInputError();
  const row = await db.service.create({ data: { barbershopId, ...parsed.data } });
  return toServiceView(row);
}

/** Updates a service (including deactivation → unbookable). */
export async function updateService(
  db: PrismaClient,
  barbershopId: string,
  id: string,
  patch: unknown,
): Promise<ServiceView> {
  const parsed = ServiceUpdate.safeParse(patch);
  if (!parsed.success) throw new InvalidInputError();
  await scopedService(db, barbershopId, id);
  const row = await db.service.update({ where: { id }, data: parsed.data });
  return toServiceView(row);
}

/** Deletes a service only when no appointment references it. */
export async function deleteService(db: PrismaClient, barbershopId: string, id: string): Promise<void> {
  await scopedService(db, barbershopId, id);
  const appointments = await db.appointment.count({ where: { serviceId: id } });
  if (appointments > 0n) throw new ServiceHasAppointmentsError();
  await db.service.delete({ where: { id } });
}

/** All barber profiles of the tenant (assignment lists + booking flow). */
export async function listBarbers(
  db: PrismaClient,
  barbershopId: string,
  opts: { includeInactive?: boolean } = {},
): Promise<BarberView[]> {
  const rows = await db.barber.findMany({
    where: { barbershopId, ...(opts.includeInactive ? {} : { active: true }) },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(toBarberView);
}

/** Creates a barber profile linked to an invited BARBER user of the tenant. */
export async function createBarber(
  db: PrismaClient,
  barbershopId: string,
  input: unknown,
): Promise<BarberView> {
  const parsed = CreateBarberInput.safeParse(input);
  if (!parsed.success) throw new InvalidInputError();

  const user = await db.user.findFirst({
    where: { id: parsed.data.userId, barbershopId, role: "BARBER" },
    select: { id: true },
  });
  if (!user) throw new BarberUserError();
  const existing = await db.barber.findUnique({ where: { userId: parsed.data.userId } });
  if (existing) throw new InvalidInputError("Barber profile already exists for this user");

  const row = await db.barber.create({
    data: {
      barbershopId,
      userId: parsed.data.userId,
      specialties: parsed.data.specialties,
      bio: parsed.data.bio,
      active: parsed.data.active,
    },
  });
  return toBarberView(row);
}

/** Updates a barber profile (specialties, bio, active flag). */
export async function updateBarber(
  db: PrismaClient,
  barbershopId: string,
  id: string,
  patch: unknown,
): Promise<BarberView> {
  const parsed = BarberUpdate.safeParse(patch);
  if (!parsed.success) throw new InvalidInputError();
  await scopedBarber(db, barbershopId, id);
  const row = await db.barber.update({ where: { id }, data: parsed.data });
  return toBarberView(row);
}

/** Adds a service to a barber's assignment list. */
export async function assignServiceToBarber(
  db: PrismaClient,
  barbershopId: string,
  barberId: string,
  serviceId: string,
): Promise<void> {
  await scopedBarber(db, barbershopId, barberId);
  await scopedService(db, barbershopId, serviceId);
  await db.barberService.upsert({
    where: { barberId_serviceId: { barberId, serviceId } },
    create: { barberId, serviceId },
    update: {},
  });
}

/** Removes a service from a barber's assignment list. */
export async function unassignServiceFromBarber(
  db: PrismaClient,
  barbershopId: string,
  barberId: string,
  serviceId: string,
): Promise<void> {
  await scopedBarber(db, barbershopId, barberId);
  await scopedService(db, barbershopId, serviceId);
  await db.barberService.deleteMany({ where: { barberId, serviceId } });
}

/** Weekly schedule entries of the tenant, optionally filtered by barber. */
export async function listSchedules(
  db: PrismaClient,
  barbershopId: string,
  barberId?: string,
): Promise<ScheduleView[]> {
  const rows = await db.schedule.findMany({
    where: { barber: { barbershopId }, ...(barberId ? { barberId } : {}) },
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
  });
  return rows.map(toScheduleView);
}

/** Creates a weekly schedule entry for a tenant barber. */
export async function createSchedule(
  db: PrismaClient,
  barbershopId: string,
  input: unknown,
): Promise<ScheduleView> {
  const parsed = CreateScheduleInput.safeParse(input);
  if (!parsed.success) throw new InvalidInputError();
  assertWindowOrder(parsed.data.startTime, parsed.data.endTime);
  await scopedBarber(db, barbershopId, parsed.data.barberId);
  const row = await db.schedule.create({
    data: {
      barberId: parsed.data.barberId,
      dayOfWeek: parsed.data.dayOfWeek,
      startTime: parsed.data.startTime,
      endTime: parsed.data.endTime,
    },
  });
  return toScheduleView(row);
}

/** Updates a schedule entry (scoped through the barber's tenant). */
export async function updateSchedule(
  db: PrismaClient,
  barbershopId: string,
  id: string,
  patch: unknown,
): Promise<ScheduleView> {
  const parsed = ScheduleInput.partial().safeParse(patch);
  if (!parsed.success) throw new InvalidInputError();
  const existing = await db.schedule.findFirst({ where: { id, barber: { barbershopId } } });
  if (!existing) throw new ScheduleNotFoundError();
  const next = {
    startTime: parsed.data.startTime ?? existing.startTime,
    endTime: parsed.data.endTime ?? existing.endTime,
  };
  if (parsed.data.startTime != null || parsed.data.endTime != null) {
    assertWindowOrder(next.startTime, next.endTime);
  }
  const row = await db.schedule.update({ where: { id }, data: parsed.data });
  return toScheduleView(row);
}

/** Deletes a schedule entry (scoped through the barber's tenant). */
export async function deleteSchedule(db: PrismaClient, barbershopId: string, id: string): Promise<void> {
  const existing = await db.schedule.findFirst({ where: { id, barber: { barbershopId } } });
  if (!existing) throw new ScheduleNotFoundError();
  await db.schedule.delete({ where: { id } });
}

/** One-off exceptions of the tenant, optionally filtered by barber and date. */
export async function listExceptions(
  db: PrismaClient,
  barbershopId: string,
  filter: { barberId?: string; date?: string } = {},
): Promise<ScheduleExceptionView[]> {
  const rows = await db.scheduleException.findMany({
    where: {
      barber: { barbershopId },
      ...(filter.barberId ? { barberId: filter.barberId } : {}),
      ...(filter.date ? { date: new Date(`${filter.date}T00:00:00.000Z`) } : {}),
    },
    orderBy: { date: "asc" },
  });
  return rows.map(toExceptionView);
}

/** Creates a one-off exception (holiday / day off) for a tenant barber. */
export async function createException(
  db: PrismaClient,
  barbershopId: string,
  input: unknown,
): Promise<ScheduleExceptionView> {
  const parsed = CreateScheduleExceptionInput.safeParse(input);
  if (!parsed.success) throw new InvalidInputError();
  assertWindowOrder(parsed.data.startTime, parsed.data.endTime);
  await scopedBarber(db, barbershopId, parsed.data.barberId);
  const row = await db.scheduleException.create({
    data: {
      barberId: parsed.data.barberId,
      date: new Date(`${parsed.data.date}T00:00:00.000Z`),
      startTime: parsed.data.startTime,
      endTime: parsed.data.endTime,
      reason: parsed.data.reason,
    },
  });
  return toExceptionView(row);
}

/** Deletes a one-off exception (scoped through the barber's tenant). */
export async function deleteException(db: PrismaClient, barbershopId: string, id: string): Promise<void> {
  const existing = await db.scheduleException.findFirst({ where: { id, barber: { barbershopId } } });
  if (!existing) throw new ExceptionNotFoundError();
  await db.scheduleException.delete({ where: { id } });
}

/**
 * Public barbershop directory (catalog spec): every tenant with at least one
 * ACTIVE service, projected to `{ slug, name }` only (no internal identity)
 * and ordered by name. Listability is a relation filter — no schema change.
 */
export async function listPublicBarbershops(db: PrismaClient): Promise<PublicBarbershopView[]> {
  return db.barbershop.findMany({
    where: { services: { some: { active: true } } },
    select: { slug: true, name: true },
    orderBy: { name: "asc" },
  });
}

/** Public catalog browse: only active services of the tenant (404 for unknown slug). */
export async function getPublicServices(db: PrismaClient, slug: string): Promise<ServiceView[]> {
  const shop = await db.barbershop.findUnique({ where: { slug }, select: { id: true } });
  if (!shop) throw new TenantNotFoundError();
  return listServices(db, shop.id);
}

/**
 * Public barber browse by service (catalog spec): only ACTIVE barbers of the
 * tenant with a `BarberService` assignment for the requested service. Unknown
 * slug → TENANT_NOT_FOUND; deactivated/unknown service → SERVICE_NOT_FOUND;
 * empty serviceId → INVALID_INPUT (the route validates via the contract too).
 */
export async function getPublicBarbersByService(
  db: PrismaClient,
  slug: string,
  serviceId: string,
): Promise<PublicBarberView[]> {
  if (!serviceId) throw new InvalidInputError("serviceId is required");
  const shop = await db.barbershop.findUnique({ where: { slug }, select: { id: true } });
  if (!shop) throw new TenantNotFoundError();
  const service = await db.service.findFirst({
    where: { id: serviceId, barbershopId: shop.id, active: true },
    select: { id: true },
  });
  if (!service) throw new ServiceNotFoundError();
  const rows = await db.barber.findMany({
    where: { barbershopId: shop.id, active: true, services: { some: { serviceId } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(toPublicBarberView);
}
