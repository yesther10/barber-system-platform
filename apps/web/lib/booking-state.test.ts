import { describe, expect, it } from "vitest";
import { sanitizeNextPath } from "./auth-redirect";
import {
  bookingLoginPath,
  bookingPathFor,
  bookingReducer,
  bookingStepOf,
  selectionFromParams,
  selectionToParams,
  type BookingAction,
  type BookingSelection,
} from "./booking-state";

describe("bookingStepOf", () => {
  it("starts at services until a service is chosen", () => {
    expect(bookingStepOf({ slug: "tesoura" })).toBe("services");
  });

  it("moves to barbers once a service is chosen, before a barber", () => {
    expect(bookingStepOf({ slug: "tesoura", serviceId: "svc_1" })).toBe("barbers");
  });

  it("reaches date-slot once both service and barber are chosen", () => {
    expect(
      bookingStepOf({ slug: "tesoura", serviceId: "svc_1", barberId: "brb_1" }),
    ).toBe("date-slot");
  });

  it("stays at date-slot when a date is picked but no slot yet", () => {
    expect(
      bookingStepOf({ slug: "tesoura", serviceId: "svc_1", barberId: "brb_1", date: "2026-08-20" }),
    ).toBe("date-slot");
  });

  it("moves to confirm once a slot is selected", () => {
    expect(
      bookingStepOf({
        slug: "tesoura",
        serviceId: "svc_1",
        barberId: "brb_1",
        date: "2026-08-20",
        slot: "2026-08-20T12:00:00.000Z",
      }),
    ).toBe("confirm");
  });

  it("reaches waiting once a booking appointment id is set", () => {
    expect(
      bookingStepOf({
        slug: "tesoura",
        serviceId: "svc_1",
        barberId: "brb_1",
        date: "2026-08-20",
        slot: "2026-08-20T12:00:00.000Z",
        appointmentId: "appt_1",
      }),
    ).toBe("waiting");
  });
});

describe("bookingReducer step order", () => {
  const base: BookingSelection = { slug: "tesoura" };

  function apply(actions: BookingAction[]): BookingSelection {
    return actions.reduce(bookingReducer, base);
  }

  it("selecting a service clears downstream barber/date/slot selections", () => {
    const state = apply([
      { type: "select-service", serviceId: "svc_1" },
      { type: "select-barber", barberId: "brb_1" },
      { type: "select-date", date: "2026-08-20" },
      { type: "select-slot", slot: "2026-08-20T12:00:00.000Z" },
      { type: "select-service", serviceId: "svc_2" },
    ]);
    expect(state).toEqual({ slug: "tesoura", serviceId: "svc_2" });
  });

  it("selecting a barber clears date and slot but keeps the service", () => {
    const state = apply([
      { type: "select-service", serviceId: "svc_1" },
      { type: "select-barber", barberId: "brb_1" },
      { type: "select-date", date: "2026-08-20" },
      { type: "select-slot", slot: "2026-08-20T12:00:00.000Z" },
      { type: "select-barber", barberId: "brb_2" },
    ]);
    expect(state).toEqual({ slug: "tesoura", serviceId: "svc_1", barberId: "brb_2" });
  });

  it("selecting a date clears only the slot", () => {
    const state = apply([
      { type: "select-service", serviceId: "svc_1" },
      { type: "select-barber", barberId: "brb_1" },
      { type: "select-date", date: "2026-08-20" },
      { type: "select-slot", slot: "2026-08-20T12:00:00.000Z" },
      { type: "select-date", date: "2026-08-21" },
    ]);
    expect(state).toEqual({
      slug: "tesoura",
      serviceId: "svc_1",
      barberId: "brb_1",
      date: "2026-08-21",
    });
  });

  it("keeps the slug untouched across all transitions", () => {
    const state = apply([{ type: "select-slot", slot: "2026-08-20T12:00:00.000Z" }]);
    expect(state.slug).toBe("tesoura");
  });

  it("clear-slot drops only the slot, keeping the date for the slot step", () => {
    const state = apply([
      { type: "select-service", serviceId: "svc_1" },
      { type: "select-barber", barberId: "brb_1" },
      { type: "select-date", date: "2026-08-20" },
      { type: "select-slot", slot: "2026-08-20T12:00:00.000Z" },
      { type: "clear-slot" },
    ]);
    expect(state).toEqual({ slug: "tesoura", serviceId: "svc_1", barberId: "brb_1", date: "2026-08-20" });
  });

  it("booking-created records the appointment id and keeps the full selection", () => {
    const state = apply([
      { type: "select-service", serviceId: "svc_1" },
      { type: "select-barber", barberId: "brb_1" },
      { type: "select-date", date: "2026-08-20" },
      { type: "select-slot", slot: "2026-08-20T12:00:00.000Z" },
      { type: "booking-created", appointmentId: "appt_1" },
    ]);
    expect(state).toEqual({
      slug: "tesoura",
      serviceId: "svc_1",
      barberId: "brb_1",
      date: "2026-08-20",
      slot: "2026-08-20T12:00:00.000Z",
      appointmentId: "appt_1",
    });
  });
});

describe("search-param codec", () => {
  const full: BookingSelection = {
    slug: "tesoura",
    serviceId: "svc_1",
    barberId: "brb_1",
    date: "2026-08-20",
    slot: "2026-08-20T12:00:00.000Z",
  };

  it("round-trips the full selection through search params", () => {
    const params = selectionToParams(full);
    expect(selectionFromParams(Object.fromEntries(params))).toEqual(full);
  });

  it("round-trips a partial selection with empty values dropped", () => {
    const partial: BookingSelection = { slug: "tesoura", serviceId: "svc_1" };
    const params = selectionToParams(partial);
    expect(params.has("barberId")).toBe(false);
    expect(params.has("date")).toBe(false);
    expect(params.has("slot")).toBe(false);
    expect(selectionFromParams(Object.fromEntries(params))).toEqual(partial);
  });

  it("reads the first value when a param arrives as an array", () => {
    const selection = selectionFromParams({
      slug: ["tesoura", "outra"],
      serviceId: "svc_1",
    });
    expect(selection.slug).toBe("tesoura");
  });

  it("produces an empty selection when no params are present", () => {
    expect(selectionFromParams({})).toEqual({ slug: "" });
  });

  it("round-trips the appointment id through search params", () => {
    const params = selectionToParams({ ...full, appointmentId: "appt_1" });
    expect(selectionFromParams(Object.fromEntries(params))).toEqual({ ...full, appointmentId: "appt_1" });
  });
});

describe("bookingLoginPath (login gate handoff)", () => {
  const full: BookingSelection = {
    slug: "tesoura",
    serviceId: "svc_1",
    barberId: "brb_1",
    date: "2026-08-20",
    slot: "2026-08-20T12:00:00.000Z",
  };

  it("builds /login?next= with the full selection URL", () => {
    const path = bookingLoginPath(full);
    expect(path).toBe(`/login?next=${encodeURIComponent(bookingPathFor(full))}`);
  });

  it("survives the login page sanitizeNextPath round-trip (pathname + search preserved)", () => {
    const next = new URL(bookingLoginPath(full), "https://barberia.local").searchParams.get("next");
    expect(sanitizeNextPath(next)).toBe(bookingPathFor(full));
  });
});