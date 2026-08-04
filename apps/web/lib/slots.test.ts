/**
 * Unit tests for the slot projection (task 4.2, booking spec): the available
 * slot grid for one date is weekly schedule − exceptions − existing
 * appointments, at the tenant granularity, and only when the full service
 * duration fits before the shift ends. Past dates are an error. Timezone
 * helpers convert tenant-local times to UTC instants.
 */
import { describe, expect, it } from "vitest";
import {
  dateKeyInTz,
  PastDateError,
  projectSlots,
  tzParts,
  weekdayOfDateKey,
  zonedToUtc,
} from "./slots";

const SAO_PAULO = "America/Sao_Paulo"; // UTC-3, no DST
const LISBON = "Europe/Lisbon"; // UTC+1 in September

/** 2026-09-02 is a Wednesday (dayOfWeek 3). */
const WEDNESDAY = "2026-09-02";

/** Runs the projection with a fixed clock so past-date rules are deterministic. */
function grid(input: Parameters<typeof projectSlots>[0]): string[] {
  return projectSlots({ now: new Date("2026-09-01T12:00:00.000Z"), ...input });
}

describe("timezone helpers", () => {
  it("converts tenant-local HH:MM to the UTC instant", () => {
    // 09:00 in São Paulo (UTC-3) is 12:00 UTC
    expect(zonedToUtc(WEDNESDAY, "09:00", SAO_PAULO).toISOString()).toBe("2026-09-02T12:00:00.000Z");
    expect(zonedToUtc(WEDNESDAY, "17:00", SAO_PAULO).toISOString()).toBe("2026-09-02T20:00:00.000Z");
    // Lisbon is UTC+1 in September → 09:00 local is 08:00 UTC
    expect(zonedToUtc(WEDNESDAY, "09:00", LISBON).toISOString()).toBe("2026-09-02T08:00:00.000Z");
  });

  it("extracts the tenant-local calendar date of an instant", () => {
    expect(dateKeyInTz(new Date("2026-09-02T23:30:00.000Z"), SAO_PAULO)).toBe("2026-09-02");
    // 00:30 UTC on Sep 3 is still Sep 2 evening (20:30) in São Paulo
    expect(dateKeyInTz(new Date("2026-09-03T00:30:00.000Z"), SAO_PAULO)).toBe("2026-09-02");
    expect(tzParts(new Date("2026-09-03T00:30:00.000Z"), SAO_PAULO).hour).toBe(21);
  });

  it("computes the weekday (1=Mon..7=Sun) of a calendar date", () => {
    expect(weekdayOfDateKey("2026-09-07")).toBe(1); // Monday
    expect(weekdayOfDateKey(WEDNESDAY)).toBe(3);
    expect(weekdayOfDateKey("2026-09-06")).toBe(7); // Sunday
  });
});

describe("projectSlots — full day grid (booking spec)", () => {
  const fullDay = {
    date: WEDNESDAY,
    timezone: SAO_PAULO,
    granularity: 30 as const,
    durationMinutes: 30,
    schedule: [{ dayOfWeek: 3, startTime: "09:00", endTime: "17:00" }],
    exceptions: [],
    appointments: [],
  };

  it("returns every 30-minute slot from 09:00 to 16:30 (12:00 to 19:30 UTC)", () => {
    const slots = grid(fullDay);
    expect(slots).toHaveLength(16);
    expect(slots[0]).toBe("2026-09-02T12:00:00.000Z");
    expect(slots[1]).toBe("2026-09-02T12:30:00.000Z");
    expect(slots[15]).toBe("2026-09-02T19:30:00.000Z");
  });

  it("respects the tenant granularity (15-minute grid)", () => {
    const slots = grid({ ...fullDay, granularity: 15 });
    expect(slots).toHaveLength(31);
    expect(slots[1]).toBe("2026-09-02T12:15:00.000Z");
  });

  it("never offers a slot that does not fit the full service duration", () => {
    const slots = grid({
      ...fullDay,
      schedule: [{ dayOfWeek: 3, startTime: "09:00", endTime: "12:00" }],
      granularity: 15,
      durationMinutes: 45,
    });
    // 09:00..11:15 → 10 slots; 11:15+45min = 12:00 fits, 11:30 does not
    expect(slots).toHaveLength(10);
    expect(slots[0]).toBe("2026-09-02T12:00:00.000Z");
    expect(slots[9]).toBe("2026-09-02T14:15:00.000Z");
    expect(slots).not.toContain("2026-09-02T14:30:00.000Z");
  });

  it("returns no slots on days without a schedule entry", () => {
    expect(grid({ ...fullDay, date: "2026-09-05" })).toEqual([]); // Saturday
  });
});

describe("projectSlots — past date (booking spec)", () => {
  it("throws PastDateError and produces no slots for a date before today", () => {
    expect(() => grid({ ...gridInputFor("2026-08-31") })).toThrow(PastDateError);
  });

  it("allows the current day (slots later today are bookable)", () => {
    const today = projectSlots({
      date: "2026-09-01", // Tuesday
      timezone: SAO_PAULO,
      granularity: 30,
      durationMinutes: 30,
      schedule: [{ dayOfWeek: 2, startTime: "09:00", endTime: "17:00" }],
      exceptions: [],
      appointments: [],
      now: new Date("2026-09-01T12:00:00.000Z"),
    });
    expect(today.length).toBeGreaterThan(0);
    expect(today[0]).toBe("2026-09-01T12:00:00.000Z");
  });
});

/** Helper keeping the big input object out of the past-date cases. */
function gridInputFor(date: string): Parameters<typeof projectSlots>[0] {
  return {
    date,
    timezone: SAO_PAULO,
    granularity: 30,
    durationMinutes: 30,
    schedule: [{ dayOfWeek: 3, startTime: "09:00", endTime: "17:00" }],
    exceptions: [],
    appointments: [],
    now: new Date("2026-09-01T12:00:00.000Z"),
  };
}

describe("projectSlots — exceptions (catalog spec: day off)", () => {
  it("returns no slots when an exception covers the full shift", () => {
    const slots = grid({
      date: WEDNESDAY,
      timezone: SAO_PAULO,
      granularity: 30,
      durationMinutes: 30,
      schedule: [{ dayOfWeek: 3, startTime: "09:00", endTime: "12:00" }],
      exceptions: [{ startTime: "09:00", endTime: "12:00" }],
      appointments: [],
    });
    expect(slots).toEqual([]);
  });

  it("removes only the excepted window, keeping the rest of the shift", () => {
    const slots = grid({
      date: WEDNESDAY,
      timezone: SAO_PAULO,
      granularity: 30,
      durationMinutes: 30,
      schedule: [{ dayOfWeek: 3, startTime: "09:00", endTime: "12:00" }],
      exceptions: [{ startTime: "10:00", endTime: "11:00" }],
      appointments: [],
    });
    // 09:00, 09:30 kept; 10:00-11:00 removed; 11:00, 11:30 kept
    expect(slots).toEqual([
      "2026-09-02T12:00:00.000Z",
      "2026-09-02T12:30:00.000Z",
      "2026-09-02T14:00:00.000Z",
      "2026-09-02T14:30:00.000Z",
    ]);
  });
});

describe("projectSlots — appointments carve out busy time", () => {
  it("removes slots that overlap an existing appointment (half-open intervals)", () => {
    const slots = grid({
      date: WEDNESDAY,
      timezone: SAO_PAULO,
      granularity: 30,
      durationMinutes: 30,
      schedule: [{ dayOfWeek: 3, startTime: "09:00", endTime: "11:00" }],
      exceptions: [],
      appointments: [{ startsAt: new Date("2026-09-02T12:30:00.000Z"), endsAt: new Date("2026-09-02T13:00:00.000Z") }],
    });
    // 4 half-hour slots 12:00-14:00 UTC; only the 12:30 slot is taken
    expect(slots).toEqual([
      "2026-09-02T12:00:00.000Z",
      "2026-09-02T13:00:00.000Z",
      "2026-09-02T13:30:00.000Z",
    ]);
  });

  it("keeps an appointment that ends exactly when a slot starts (adjacent)", () => {
    const slots = grid({
      date: WEDNESDAY,
      timezone: SAO_PAULO,
      granularity: 30,
      durationMinutes: 30,
      schedule: [{ dayOfWeek: 3, startTime: "09:00", endTime: "11:00" }],
      exceptions: [],
      appointments: [{ startsAt: new Date("2026-09-02T12:00:00.000Z"), endsAt: new Date("2026-09-02T12:30:00.000Z") }],
    });
    // the 12:00 slot overlaps the appointment; 12:30/13:00/13:30 stay free
    expect(slots).toEqual([
      "2026-09-02T12:30:00.000Z",
      "2026-09-02T13:00:00.000Z",
      "2026-09-02T13:30:00.000Z",
    ]);
  });

  it("returns an empty grid for a full shift of appointments", () => {
    const slots = grid({
      date: WEDNESDAY,
      timezone: SAO_PAULO,
      granularity: 30,
      durationMinutes: 30,
      schedule: [{ dayOfWeek: 3, startTime: "09:00", endTime: "10:30" }],
      exceptions: [],
      appointments: [{ startsAt: new Date("2026-09-02T12:00:00.000Z"), endsAt: new Date("2026-09-02T13:30:00.000Z") }],
    });
    expect(slots).toEqual([]);
  });
});
