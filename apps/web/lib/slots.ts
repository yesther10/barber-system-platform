/**
 * Slot projection (booking spec, task 4.2).
 *
 * The available slot grid for one date is computed as:
 *
 *     weekly schedule − one-off exceptions − existing appointments
 *
 * at the tenant's configured granularity (15|30 minutes), and a slot is only
 * offered when the FULL service duration fits before the shift ends. Dates
 * before today (in the tenant's timezone) are an error. All conversions run
 * tenant-local → UTC so slots are stored and returned as UTC ISO instants.
 *
 * The pure `projectSlots` is unit-tested here; `getSlotGrid` loads the
 * tenant data (schedule/exceptions/appointments) and delegates to it.
 */
import type { PrismaClient } from "@barber/db";
import type { SlotGrid, SlotQuery } from "@barber/contracts";
import { AppointmentStatus } from "@barber/db";
import { TenantNotFoundError } from "./onboarding";
import { BarberNotFoundError, ServiceNotFoundError } from "./catalog";

/** Thrown when the requested date is before today in the tenant's timezone. */
export class PastDateError extends Error {
  readonly code = "PAST_DATE" as const;

  constructor(date: string) {
    super(`Date ${date} is in the past`);
    this.name = "PastDateError";
  }
}

const FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timezone: string): Intl.DateTimeFormat {
  let formatter = FORMATTER_CACHE.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    FORMATTER_CACHE.set(timezone, formatter);
  }
  return formatter;
}

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** Renders an instant as its calendar parts in the given timezone. */
export function tzParts(date: Date, timezone: string): ZonedParts {
  const parts = formatterFor(timezone).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  // ICU emits "24" for midnight with hour12:false in some locales.
  const hour = get("hour") % 24;
  return { year: get("year"), month: get("month"), day: get("day"), hour, minute: get("minute"), second: get("second") };
}

/** The YYYY-MM-DD calendar date of an instant in the given timezone. */
export function dateKeyInTz(date: Date, timezone: string): string {
  const p = tzParts(date, timezone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Weekday of a YYYY-MM-DD calendar date: 1=Monday … 7=Sunday. */
export function weekdayOfDateKey(dateKey: string): number {
  const [year, month, day] = dateKey.split("-").map(Number);
  return ((new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7) + 1;
}

/**
 * Converts a tenant-local date + HH:MM to the UTC instant. Converges by
 * iteratively correcting the offset (DST changes by at most an hour; Brazil
 * has no DST, so one pass suffices there).
 */
export function zonedToUtc(dateKey: string, time: string, timezone: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const desired = Date.UTC(year, month - 1, day, hour, minute, 0);
  let utc = desired;
  for (let i = 0; i < 4; i++) {
    const p = tzParts(new Date(utc), timezone);
    const actual = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    const diff = desired - actual;
    if (diff === 0) break;
    utc += diff;
  }
  return new Date(utc);
}

export interface SlotProjectionInput {
  /** YYYY-MM-DD in the tenant's timezone. */
  date: string;
  timezone: string;
  granularity: 15 | 30;
  durationMinutes: number;
  /** Weekly entries matching the requested date's weekday (dayOfWeek 1..7). */
  schedule: { dayOfWeek: number; startTime: string; endTime: string }[];
  /** One-off exceptions ON the requested date (HH:MM windows). */
  exceptions: { startTime: string; endTime: string }[];
  /** Existing appointments overlapping the requested day (UTC). */
  appointments: { startsAt: Date; endsAt: Date }[];
  /** Injectable clock for deterministic past-date behavior. */
  now?: Date;
}

/**
 * Projects the available slot starts (UTC ISO) for one date: schedule −
 * exceptions − appointments, granularity steps, full-duration fit, past
 * date → PastDateError.
 */
export function projectSlots(input: SlotProjectionInput): string[] {
  const now = input.now ?? new Date();
  const today = dateKeyInTz(now, input.timezone);
  if (input.date < today) throw new PastDateError(input.date);

  const weekday = weekdayOfDateKey(input.date);
  const daySchedules = input.schedule.filter((s) => s.dayOfWeek === weekday);
  if (daySchedules.length === 0) return [];

  let windows = daySchedules.map((w) => ({
    start: zonedToUtc(input.date, w.startTime, input.timezone).getTime(),
    end: zonedToUtc(input.date, w.endTime, input.timezone).getTime(),
  }));

  // Subtract exception windows (day off → nothing left).
  const exceptionRanges = input.exceptions
    .map((e) => ({
      start: zonedToUtc(input.date, e.startTime, input.timezone).getTime(),
      end: zonedToUtc(input.date, e.endTime, input.timezone).getTime(),
    }))
    .filter((e) => e.end > e.start);
  for (const exception of exceptionRanges) {
    const next: typeof windows = [];
    for (const window of windows) {
      if (exception.end <= window.start || exception.start >= window.end) {
        next.push(window);
        continue;
      }
      if (exception.start > window.start) next.push({ start: window.start, end: exception.start });
      if (exception.end < window.end) next.push({ start: exception.end, end: window.end });
    }
    windows = next;
  }

  const stepMs = input.granularity * 60_000;
  const durationMs = input.durationMinutes * 60_000;
  const busy = input.appointments.map((a) => ({ start: a.startsAt.getTime(), end: a.endsAt.getTime() }));

  const slots: string[] = [];
  const seen = new Set<number>();
  for (const window of windows) {
    if (window.end - window.start < durationMs) continue;
    for (let t = window.start; t + durationMs <= window.end; t += stepMs) {
      if (seen.has(t)) continue;
      const overlaps = busy.some((b) => t < b.end && t + durationMs > b.start);
      if (!overlaps) {
        seen.add(t);
        slots.push(new Date(t).toISOString());
      }
    }
  }
  return slots.sort();
}

/**
 * Public slot grid for one tenant/barber/service/date. Resolves the tenant
 * by slug, loads the day's schedule + exceptions + appointments and projects
 * the grid. For the public surface, inactive services/barbers resolve to
 * NotFound (they are not browsable) and past dates are an error.
 */
export async function getSlotGrid(
  db: PrismaClient,
  query: SlotQuery,
  now: Date = new Date(),
): Promise<SlotGrid> {
  const shop = await db.barbershop.findUnique({ where: { slug: query.barbershopSlug } });
  if (!shop) throw new TenantNotFoundError();

  const today = dateKeyInTz(now, shop.timezone);
  if (query.date < today) throw new PastDateError(query.date);

  const service = await db.service.findFirst({
    where: { id: query.serviceId, barbershopId: shop.id, active: true },
  });
  if (!service) throw new ServiceNotFoundError();

  const barber = await db.barber.findFirst({
    where: { id: query.barberId, barbershopId: shop.id, active: true },
  });
  if (!barber) throw new BarberNotFoundError();

  const weekday = weekdayOfDateKey(query.date);
  const [schedules, exceptions] = await Promise.all([
    db.schedule.findMany({
      where: { barberId: barber.id, dayOfWeek: weekday },
      select: { dayOfWeek: true, startTime: true, endTime: true },
    }),
    db.scheduleException.findMany({
      where: { barberId: barber.id, date: new Date(`${query.date}T00:00:00.000Z`) },
      select: { startTime: true, endTime: true },
    }),
  ]);
  if (schedules.length === 0) return { date: query.date, slots: [] };

  let dayStart = Number.POSITIVE_INFINITY;
  let dayEnd = Number.NEGATIVE_INFINITY;
  for (const s of schedules) {
    const start = zonedToUtc(query.date, s.startTime, shop.timezone).getTime();
    const end = zonedToUtc(query.date, s.endTime, shop.timezone).getTime();
    dayStart = Math.min(dayStart, start);
    dayEnd = Math.max(dayEnd, end);
  }

  const appointments = await db.appointment.findMany({
    where: {
      barberId: barber.id,
      startsAt: { lt: new Date(dayEnd) },
      endsAt: { gt: new Date(dayStart) },
      status: { not: AppointmentStatus.CANCELLED },
    },
    select: { startsAt: true, endsAt: true },
  });

  const slots = projectSlots({
    date: query.date,
    timezone: shop.timezone,
    granularity: shop.slotGranularity as 15 | 30,
    durationMinutes: service.durationMinutes,
    schedule: schedules.map((s) => ({
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime,
      endTime: s.endTime,
    })),
    exceptions: exceptions.map((e) => ({ startTime: e.startTime, endTime: e.endTime })),
    appointments,
    now,
  });
  return { date: query.date, slots };
}
