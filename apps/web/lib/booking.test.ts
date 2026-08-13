/**
 * Unit tests for the booking domain rules (tasks 4.4-4.5, booking spec):
 * status lifecycle transitions, cancellation/reschedule window rules and the
 * view mapper. The transactional behavior (app-level lock, outbox atomicity,
 * conflict prevention) is covered by tests/integration/booking.test.ts.
 */
import { describe, expect, it } from "vitest";
import { AppointmentStatus, PaymentStatus, Prisma } from "@barber/db";
import type { Appointment } from "@barber/db";
import {
  assertTransition,
  InvalidTransitionError,
  isFuture,
  isLateCancel,
  isRescheduleAllowed,
  mapAppointmentStatusToContract,
  mapPaymentStatusToContract,
  toAppointmentView,
} from "./booking";

const HOUR = 3_600_000;
const now = new Date("2026-10-06T12:00:00.000Z");

describe("status mappers", () => {
  it("maps DB enums to the lowercase contract values", () => {
    expect(mapAppointmentStatusToContract(AppointmentStatus.PENDING)).toBe("pending");
    expect(mapAppointmentStatusToContract(AppointmentStatus.CONFIRMED)).toBe("confirmed");
    expect(mapAppointmentStatusToContract(AppointmentStatus.COMPLETED)).toBe("completed");
    expect(mapAppointmentStatusToContract(AppointmentStatus.CANCELLED)).toBe("cancelled");
    expect(mapPaymentStatusToContract(PaymentStatus.PAID)).toBe("paid");
    expect(mapPaymentStatusToContract(PaymentStatus.EXPIRED)).toBe("expired");
  });
});

describe("assertTransition — lifecycle (booking spec)", () => {
  it("allows pending→confirmed, pending|confirmed→cancelled, confirmed→completed", () => {
    expect(() => assertTransition("pending", "confirmed")).not.toThrow();
    expect(() => assertTransition("pending", "cancelled")).not.toThrow();
    expect(() => assertTransition("confirmed", "cancelled")).not.toThrow();
    expect(() => assertTransition("confirmed", "completed")).not.toThrow();
  });

  it("rejects every other transition, including completed→cancelled", () => {
    expect(() => assertTransition("completed", "cancelled")).toThrow(InvalidTransitionError);
    expect(() => assertTransition("cancelled", "confirmed")).toThrow(InvalidTransitionError);
    expect(() => assertTransition("cancelled", "completed")).toThrow(InvalidTransitionError);
    // pending must go through confirmed to reach completed
    expect(() => assertTransition("pending", "completed")).toThrow(InvalidTransitionError);
  });
});

describe("window rules (design Decision 2)", () => {
  it("isLateCancel: inside the free-cancel window is late", () => {
    const startsIn2h = new Date(now.getTime() + 2 * HOUR);
    expect(isLateCancel(startsIn2h, now, 24)).toBe(true);
    const startsIn30h = new Date(now.getTime() + 30 * HOUR);
    expect(isLateCancel(startsIn30h, now, 24)).toBe(false);
    // boundary: exactly at the window edge is not late
    expect(isLateCancel(new Date(now.getTime() + 24 * HOUR), now, 24)).toBe(false);
  });

  it("isRescheduleAllowed: only appointments far enough out may move", () => {
    expect(isRescheduleAllowed(new Date(now.getTime() + 30 * HOUR), now, 24)).toBe(true);
    expect(isRescheduleAllowed(new Date(now.getTime() + 2 * HOUR), now, 24)).toBe(false);
  });

  it("isFuture distinguishes bookable and past start times", () => {
    expect(isFuture(new Date(now.getTime() + HOUR), now)).toBe(true);
    expect(isFuture(new Date(now.getTime() - HOUR), now)).toBe(false);
    expect(isFuture(now, now)).toBe(true);
  });
});

describe("toAppointmentView", () => {
  function fakeAppointment(): Appointment {
    return {
      id: "apt_1",
      barbershopId: "bshp_1",
      barberId: "brb_1",
      clientId: "usr_1",
      serviceId: "svc_1",
      startsAt: new Date("2026-10-07T13:00:00.000Z"),
      endsAt: new Date("2026-10-07T13:30:00.000Z"),
      status: AppointmentStatus.CONFIRMED,
      priceSnapshot: new Prisma.Decimal("45.50"),
      paymentStatus: PaymentStatus.PENDING,
      providerPaymentId: null,
      noShowAt: null,
      cancelReason: "Imprevisto",
      createdAt: new Date("2026-10-06T12:00:00.000Z"),
      updatedAt: new Date("2026-10-06T12:00:00.000Z"),
    };
  }

  it("maps the row to the contract view (Decimal → number, ISO datetimes)", () => {
    const view = toAppointmentView(fakeAppointment());
    expect(view).toMatchObject({
      id: "apt_1",
      barbershopId: "bshp_1",
      clientId: "usr_1",
      startsAt: "2026-10-07T13:00:00.000Z",
      endsAt: "2026-10-07T13:30:00.000Z",
      status: "confirmed",
      priceSnapshot: 45.5,
      paymentStatus: "pending",
      noShowAt: null,
      cancelReason: "Imprevisto",
    });
  });
});
