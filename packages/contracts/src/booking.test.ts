import { describe, expect, it } from "vitest";
import {
  AppointmentStatus,
  AppointmentView,
  CancelInput,
  CreateBookingInput,
  PaymentStatus,
  RescheduleInput,
  SlotGrid,
  SlotQuery,
} from "./booking.js";

describe("booking contracts", () => {
  it("parses a booking creation input with an ISO start time", () => {
    const parsed = CreateBookingInput.safeParse({
      serviceId: "svc_1",
      barberId: "brb_1",
      startsAt: "2026-08-10T14:00:00.000Z",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.serviceId).toBe("svc_1");
  });

  it("rejects a booking with a non-ISO start time", () => {
    expect(
      CreateBookingInput.safeParse({
        serviceId: "svc_1",
        barberId: "brb_1",
        startsAt: "10/08/2026 14:00",
      }).success,
    ).toBe(false);
  });

  it("parses a full appointment view", () => {
    const parsed = AppointmentView.safeParse({
      id: "apt_1",
      barbershopId: "bshp_1",
      barberId: "brb_1",
      clientId: "usr_1",
      serviceId: "svc_1",
      startsAt: "2026-08-10T14:00:00.000Z",
      endsAt: "2026-08-10T14:30:00.000Z",
      status: "confirmed",
      priceSnapshot: 45.0,
      paymentStatus: "paid",
      noShowAt: null,
      cancelReason: null,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.status).toBe("confirmed");
  });

  it("rejects an appointment with an unknown status", () => {
    const parsed = AppointmentView.safeParse({
      id: "apt_1",
      barbershopId: "bshp_1",
      barberId: "brb_1",
      clientId: "usr_1",
      serviceId: "svc_1",
      startsAt: "2026-08-10T14:00:00.000Z",
      endsAt: "2026-08-10T14:30:00.000Z",
      status: "bogus",
      priceSnapshot: 45.0,
      paymentStatus: "paid",
      noShowAt: null,
      cancelReason: null,
    });
    expect(parsed.success).toBe(false);
  });

  it("exposes only the spec lifecycle statuses and payment statuses", () => {
    for (const status of ["pending", "confirmed", "completed", "cancelled"]) {
      expect(AppointmentStatus.safeParse(status).success).toBe(true);
    }
    expect(AppointmentStatus.safeParse("no_show").success).toBe(false);
    for (const status of ["pending", "paid", "expired", "refunded"]) {
      expect(PaymentStatus.safeParse(status).success).toBe(true);
    }
    expect(PaymentStatus.safeParse("unknown").success).toBe(false);
  });

  it("parses reschedule and cancel inputs", () => {
    expect(RescheduleInput.safeParse({ startsAt: "2026-08-11T15:00:00.000Z" }).success).toBe(true);
    expect(CancelInput.safeParse({ reason: "Imprevisto" }).success).toBe(true);
    expect(CancelInput.safeParse({}).success).toBe(true);
  });

  it("parses a slot query with a YYYY-MM-DD date and rejects others", () => {
    expect(
      SlotQuery.safeParse({
        barbershopSlug: "tesoura-de-ouro",
        serviceId: "svc_1",
        barberId: "brb_1",
        date: "2026-08-10",
      }).success,
    ).toBe(true);
    expect(
      SlotQuery.safeParse({
        barbershopSlug: "tesoura-de-ouro",
        serviceId: "svc_1",
        barberId: "brb_1",
        date: "08/10/2026",
      }).success,
    ).toBe(false);
  });

  it("parses a slot grid with ISO slots, including an empty grid", () => {
    const full = SlotGrid.safeParse({
      date: "2026-08-10",
      slots: ["2026-08-10T09:00:00.000Z", "2026-08-10T09:30:00.000Z"],
    });
    expect(full.success).toBe(true);
    if (full.success) expect(full.data.slots).toHaveLength(2);

    const empty = SlotGrid.safeParse({ date: "2026-08-10", slots: [] });
    expect(empty.success).toBe(true);
    if (empty.success) expect(empty.data.slots).toHaveLength(0);
  });
});
