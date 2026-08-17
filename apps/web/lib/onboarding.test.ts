import { describe, expect, it } from "vitest";
import { confirmsImmediately, onboardingStatus } from "./onboarding.js";

describe("onboardingStatus", () => {
  it("reports a tenant with services, barbers, schedules and pix as complete", () => {
    const status = onboardingStatus({
      serviceCount: 3,
      barberCount: 2,
      scheduleCount: 5,
      pixProvider: "mercadopago",
      confirmationMode: "AUTO",
      lateCancelPolicy: "REJECT",
      freeCancelWindowHours: 24,
      rescheduleWindowHours: 24,
      reminderLeadHours: 24,
    });
    expect(status).toEqual({ complete: true, missing: [], nextStep: null });
  });

  it("reports the missing setup steps for an incomplete tenant", () => {
    const status = onboardingStatus({
      serviceCount: 0,
      barberCount: 0,
      scheduleCount: 0,
      pixProvider: null,
      confirmationMode: "MANUAL",
      lateCancelPolicy: "ALLOW",
      freeCancelWindowHours: 48,
      rescheduleWindowHours: 12,
      reminderLeadHours: 24,
    });
    expect(status.complete).toBe(false);
    expect(status.missing).toEqual(["services", "barbers", "schedules", "pix"]);
    expect(status.nextStep).toBe("services");
  });

  it("guides to the first missing step when only some are done", () => {
    const status = onboardingStatus({
      serviceCount: 2,
      barberCount: 0,
      scheduleCount: 4,
      pixProvider: "mercadopago",
      confirmationMode: "AUTO",
      lateCancelPolicy: "REJECT",
      freeCancelWindowHours: 24,
      rescheduleWindowHours: 24,
      reminderLeadHours: 24,
    });
    expect(status.complete).toBe(false);
    expect(status.missing).toEqual(["barbers"]);
    expect(status.nextStep).toBe("barbers");
  });

  it("treats pix as a mandatory onboarding step (no provider configured)", () => {
    const status = onboardingStatus({
      serviceCount: 1,
      barberCount: 1,
      scheduleCount: 1,
      pixProvider: null,
      confirmationMode: "AUTO",
      lateCancelPolicy: "REJECT",
      freeCancelWindowHours: 24,
      rescheduleWindowHours: 24,
      reminderLeadHours: 24,
    });
    expect(status.complete).toBe(false);
    expect(status.missing).toEqual(["pix"]);
  });
});

describe("confirmsImmediately", () => {
  it("confirms instantly when the tenant uses AUTO confirmation", () => {
    expect(confirmsImmediately("AUTO")).toBe(true);
  });

  it("stays pending when the tenant uses MANUAL confirmation", () => {
    expect(confirmsImmediately("MANUAL")).toBe(false);
  });
});
