/**
 * Client-safe Brazil timezone helpers (booking design: tz decision).
 *
 * `lib/slots.ts` imports `@barber/db`, so it cannot ship in the client
 * bundle. This module duplicates ONLY the Intl formatting pieces needed by
 * the booking UI (slot times + calendar "today") using a formatter cache.
 * No tenant metadata endpoint: v1 fixes the shop timezone to
 * `America/Sao_Paulo` (UTC-3, no DST).
 */
export const BR_TIMEZONE = "America/Sao_Paulo";

const FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = FORMATTER_CACHE.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    FORMATTER_CACHE.set(timeZone, formatter);
  }
  return formatter;
}

function partsOf(date: Date, timeZone: string): Map<string, string> {
  const parts = formatterFor(timeZone).formatToParts(date);
  return new Map(parts.map((p) => [p.type, p.value]));
}

/** Renders an instant as its calendar parts in the given timezone. */
function zonedParts(date: Date, timeZone: string) {
  const parts = partsOf(date, timeZone);
  // ICU emits "24" for midnight with hour12:false in some locales.
  const hour = Number(parts.get("hour")) % 24;
  return {
    year: Number(parts.get("year")),
    month: Number(parts.get("month")),
    day: Number(parts.get("day")),
    hour,
    minute: Number(parts.get("minute")),
    second: Number(parts.get("second")),
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Local HH:MM of a UTC ISO slot instant in the given timezone. */
export function formatSlotLocal(iso: string, timeZone: string = BR_TIMEZONE): string {
  const p = zonedParts(new Date(iso), timeZone);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** The YYYY-MM-DD calendar date of "now" in the given timezone. */
export function todayInTz(now: Date = new Date(), timeZone: string = BR_TIMEZONE): string {
  const p = zonedParts(now, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}