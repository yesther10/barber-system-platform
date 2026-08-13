import { describe, expect, it } from "vitest";
import {
  BarberInput,
  BarberUpdate,
  BarberView,
  BarbershopInput,
  BarbershopView,
  CreateBarberInput,
  CreateScheduleExceptionInput,
  CreateScheduleInput,
  ScheduleExceptionInput,
  ScheduleExceptionView,
  ScheduleInput,
  ScheduleUpdate,
  ScheduleView,
  ServiceInput,
  ServiceUpdate,
  ServiceView,
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

  it("parses a service view with id and timestamps", () => {
    const parsed = ServiceView.safeParse({
      id: "svc_1",
      name: "Corte",
      priceBRL: 45,
      durationMinutes: 30,
      active: true,
      createdAt: "2026-08-01T10:00:00.000Z",
      updatedAt: "2026-08-01T10:00:00.000Z",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.priceBRL).toBe(45);
  });

  it("parses create/update barber inputs and the barber view", () => {
    const created = CreateBarberInput.safeParse({
      userId: "usr_1",
      specialties: ["corte"],
      active: true,
    });
    expect(created.success).toBe(true);
    if (created.success) expect(created.data.userId).toBe("usr_1");
    expect(CreateBarberInput.safeParse({ specialties: ["corte"] }).success).toBe(false);

    expect(BarberUpdate.safeParse({ active: false, bio: "Novo" }).success).toBe(true);
    expect(
      BarberView.safeParse({
        id: "brb_1",
        userId: "usr_1",
        specialties: ["corte"],
        active: true,
        createdAt: "2026-08-01T10:00:00.000Z",
        updatedAt: "2026-08-01T10:00:00.000Z",
      }).success,
    ).toBe(true);
  });

  it("parses schedule create/update and views; exception create and view", () => {
    const created = CreateScheduleInput.safeParse({
      barberId: "brb_1",
      dayOfWeek: 3,
      startTime: "09:00",
      endTime: "17:00",
    });
    expect(created.success).toBe(true);
    if (created.success) expect(created.data.barberId).toBe("brb_1");
    expect(CreateScheduleInput.safeParse({ dayOfWeek: 3, startTime: "09:00", endTime: "17:00" }).success).toBe(
      false,
    );

    expect(ScheduleUpdate.safeParse({ endTime: "18:00" }).success).toBe(true);
    expect(
      ScheduleView.safeParse({
        id: "sch_1",
        dayOfWeek: 3,
        startTime: "09:00",
        endTime: "17:00",
      }).success,
    ).toBe(true);

    const exception = CreateScheduleExceptionInput.safeParse({
      barberId: "brb_1",
      date: "2026-08-15",
      startTime: "09:00",
      endTime: "17:00",
    });
    expect(exception.success).toBe(true);
    if (exception.success) expect(exception.data.barberId).toBe("brb_1");
    expect(
      ScheduleExceptionView.safeParse({
        id: "exc_1",
        date: "2026-08-15",
        startTime: "09:00",
        endTime: "17:00",
      }).success,
    ).toBe(true);
  });
});
