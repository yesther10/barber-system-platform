import { describe, expect, it } from "vitest";
import {
  BarberInput,
  BarbershopInput,
  BarbershopView,
  ScheduleExceptionInput,
  ScheduleInput,
  ServiceInput,
  ServiceUpdate,
} from "./catalog.js";

describe("catalog contracts", () => {
  it("parses a barbershop input and applies tenant policy defaults", () => {
    const parsed = BarbershopInput.safeParse({
      name: "Tesoura de Ouro",
      slug: "tesoura-de-ouro",
      timezone: "America/Sao_Paulo",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.slotGranularity).toBe(30);
      expect(parsed.data.confirmationMode).toBe("auto");
      expect(parsed.data.lateCancelPolicy).toBe("reject");
      expect(parsed.data.freeCancelWindowHours).toBe(24);
    }
  });

  it("rejects invalid slugs and invalid granularity", () => {
    expect(
      BarbershopInput.safeParse({
        name: "A",
        slug: "Invalid Slug",
        timezone: "America/Sao_Paulo",
      }).success,
    ).toBe(false);
    expect(
      BarbershopInput.safeParse({
        name: "A",
        slug: "ok-slug",
        timezone: "America/Sao_Paulo",
        slotGranularity: 60,
      }).success,
    ).toBe(false);
  });

  it("parses a service input and rejects negative price or empty name", () => {
    const ok = ServiceInput.safeParse({
      name: "Corte",
      priceBRL: 45.0,
      durationMinutes: 30,
    });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.active).toBe(true);

    expect(
      ServiceInput.safeParse({
        name: "Corte",
        priceBRL: -1,
        durationMinutes: 30,
      }).success,
    ).toBe(false);
    expect(
      ServiceInput.safeParse({
        name: "",
        priceBRL: 10,
        durationMinutes: 30,
      }).success,
    ).toBe(false);
  });

  it("parses a partial service update", () => {
    const parsed = ServiceUpdate.safeParse({ active: false });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.active).toBe(false);
  });

  it("parses a barber profile with specialties and rejects empty lists", () => {
    const ok = BarberInput.safeParse({
      specialties: ["corte", "barba"],
      bio: "Especialista em degradê",
    });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.active).toBe(true);

    expect(BarberInput.safeParse({ specialties: [] }).success).toBe(false);
  });

  it("parses weekly schedules for days 1-7 only", () => {
    expect(
      ScheduleInput.safeParse({
        dayOfWeek: 2,
        startTime: "09:00",
        endTime: "12:00",
      }).success,
    ).toBe(true);
    expect(ScheduleInput.safeParse({ dayOfWeek: 0, startTime: "09:00", endTime: "12:00" }).success).toBe(
      false,
    );
    expect(ScheduleInput.safeParse({ dayOfWeek: 8, startTime: "09:00", endTime: "12:00" }).success).toBe(
      false,
    );
    expect(
      ScheduleInput.safeParse({ dayOfWeek: 2, startTime: "25:00", endTime: "12:00" }).success,
    ).toBe(false);
  });

  it("parses schedule exceptions with a YYYY-MM-DD date", () => {
    expect(
      ScheduleExceptionInput.safeParse({
        date: "2026-08-15",
        startTime: "09:00",
        endTime: "17:00",
        reason: "Feriado",
      }).success,
    ).toBe(true);
    expect(
      ScheduleExceptionInput.safeParse({ date: "15/08/2026", startTime: "09:00", endTime: "17:00" })
        .success,
    ).toBe(false);
  });

  it("parses a full barbershop view with id and timestamps", () => {
    const parsed = BarbershopView.safeParse({
      id: "bshp_1",
      slug: "tesoura-de-ouro",
      name: "Tesoura de Ouro",
      timezone: "America/Sao_Paulo",
      slotGranularity: 30,
      confirmationMode: "manual",
      lateCancelPolicy: "reject",
      freeCancelWindowHours: 24,
      rescheduleWindowHours: 24,
      reminderLeadHours: 24,
      createdAt: "2026-08-01T10:00:00.000Z",
      updatedAt: "2026-08-01T10:00:00.000Z",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.confirmationMode).toBe("manual");
  });
});
