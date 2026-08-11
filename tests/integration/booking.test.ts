import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GenericContainer, type StartedTestContainer } from "testcontainers";
import { createClient } from "../../packages/db/src/index.js";
import type { PrismaClient } from "../../packages/db/src/index.js";
import {
  AppointmentNotFoundError,
  BookingSlotConflictError,
  cancelAppointment,
  createBooking,
  InvalidTransitionError,
  LateCancelRejectedError,
  RescheduleWindowRejectedError,
  rescheduleAppointment,
  ServiceInactiveError,
  ServiceNotAssignedError,
  SlotOutsideScheduleError,
} from "../../apps/web/lib/booking.js";
import { ServiceNotFoundError } from "../../apps/web/lib/catalog.js";
import { OnboardingIncompleteError } from "../../apps/web/lib/onboarding.js";
import { PastDateError } from "../../apps/web/lib/slots.js";

/**
 * Booking integration suite (booking spec) against a real MySQL 8 via
 * Testcontainers: transactional booking (price snapshot + outbox in one tx),
 * app-level slot conflict prevention under the barber lock, lifecycle
 * transitions and window rules for reschedule/cancel. The spec scenario
 * "Concurrent double-booking" is proven here: two parallel bookings for the
 * same slot → exactly one succeeds, the other gets a conflict.
 */
async function startMysql() {
  const container = await new GenericContainer("mysql:8")
    .withExposedPorts(3306)
    .withEnvironment({
      MYSQL_USER: "test",
      MYSQL_PASSWORD: "test",
      MYSQL_DATABASE: "barberia_test",
      MYSQL_ROOT_PASSWORD: "test",
    })
    .start();
  const connectionString = `mysql://test:test@${container.getHost()}:${container.getMappedPort(3306)}/barberia_test?allowPublicKeyRetrieval=true`;
  return { container, connectionString };
}

function deployMigrations(connectionString: string) {
  execFileSync(resolve(process.cwd(), "packages/db/node_modules/.bin/prisma"), ["migrate", "deploy"], {
    cwd: resolve(process.cwd(), "packages/db"),
    env: { ...process.env, DATABASE_URL: connectionString },
    stdio: "pipe",
  });
}

interface ShopOptions {
  confirmationMode?: "AUTO" | "MANUAL";
  lateCancelPolicy?: "REJECT" | "ALLOW";
  pixProvider?: string | null;
  freeCancelWindowHours?: number;
  rescheduleWindowHours?: number;
}

/**
 * A fully onboarded tenant: services + barbers + schedules + pix, so the
 * requireOnboarded guard passes. Wednesday shift 09:00-17:00 local
 * (= 12:00-20:00 UTC). Two clients for concurrency/lifecycle tests.
 */
async function createOnboardedShop(prisma: PrismaClient, tag: string, opts: ShopOptions = {}) {
  const shop = await prisma.barbershop.create({
    data: {
      slug: `bkg-shop-${tag}`,
      name: `Booking Shop ${tag}`,
      timezone: "America/Sao_Paulo",
      confirmationMode: opts.confirmationMode ?? "AUTO",
      lateCancelPolicy: opts.lateCancelPolicy ?? "REJECT",
      pixProvider: opts.pixProvider === undefined ? "mercado_pago" : opts.pixProvider,
      freeCancelWindowHours: opts.freeCancelWindowHours ?? 24,
      rescheduleWindowHours: opts.rescheduleWindowHours ?? 24,
    },
  });
  await prisma.user.create({
    data: { email: `bkg.admin.${tag}@example.com`, name: "Admin", role: "BARBERSHOP_ADMIN", barbershopId: shop.id },
  });
  const barberUser = await prisma.user.create({
    data: { email: `bkg.barber.${tag}@example.com`, name: "Carlos", role: "BARBER", barbershopId: shop.id },
  });
  const barber = await prisma.barber.create({
    data: { barbershopId: shop.id, userId: barberUser.id, specialties: ["corte"] },
  });
  const clientA = await prisma.user.create({
    data: { email: `bkg.client.a.${tag}@example.com`, name: "Maria", role: "CLIENT", barbershopId: shop.id },
  });
  const clientB = await prisma.user.create({
    data: { email: `bkg.client.b.${tag}@example.com`, name: "João", role: "CLIENT", barbershopId: shop.id },
  });
  const service = await prisma.service.create({
    data: { barbershopId: shop.id, name: "Corte", priceBRL: 45, durationMinutes: 30 },
  });
  await prisma.barberService.create({ data: { barberId: barber.id, serviceId: service.id } });
  await prisma.schedule.create({
    data: { barberId: barber.id, dayOfWeek: 3, startTime: "09:00", endTime: "17:00" }, // Wednesday
  });
  return { shop, barber, clientA, clientB, service };
}

const NOW = new Date("2026-10-06T12:00:00.000Z");
const WEDNESDAY_10AM = "2026-10-07T13:00:00.000Z"; // 10:00 local São Paulo

describe("booking lifecycle", () => {
  let container: StartedTestContainer;
  let connectionString: string;
  let prisma: PrismaClient;

  beforeAll(async () => {
    ({ container, connectionString } = await startMysql());
    deployMigrations(connectionString);
    prisma = createClient(connectionString);
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
  });

  describe("booking creation (booking spec)", () => {
    it("creates a pending/confirmed appointment with price snapshot + outbox atomically", async () => {
      const f = await createOnboardedShop(prisma, "create");

      const view = await createBooking(
        prisma,
        { clientId: f.clientA.id, now: NOW },
        { serviceId: f.service.id, barberId: f.barber.id, startsAt: WEDNESDAY_10AM },
      );

      expect(view.status).toBe("confirmed"); // AUTO mode confirms immediately
      expect(view.priceSnapshot).toBe(45);
      expect(view.clientId).toBe(f.clientA.id);
      expect(view.startsAt).toBe(WEDNESDAY_10AM);
      expect(view.endsAt).toBe("2026-10-07T13:30:00.000Z");

      const row = await prisma.appointment.findUnique({ where: { id: view.id } });
      expect(row?.status).toBe("CONFIRMED");
      expect(Number(row?.priceSnapshot)).toBe(45);

      const outbox = await prisma.emailNotification.findMany({
        where: { appointmentId: view.id },
      });
      expect(outbox).toHaveLength(1);
      expect(outbox[0].type).toBe("CONFIRMATION");
      expect(outbox[0].status).toBe("QUEUED");
      expect(outbox[0].nextAttemptAt).not.toBeNull();
    });

    it("keeps manual tenants pending until admin confirmation", async () => {
      const f = await createOnboardedShop(prisma, "manual", { confirmationMode: "MANUAL" });
      const view = await createBooking(
        prisma,
        { clientId: f.clientA.id, now: NOW },
        { serviceId: f.service.id, barberId: f.barber.id, startsAt: WEDNESDAY_10AM },
      );
      expect(view.status).toBe("pending");
    });

    it("rejects deactivated services (unbookable) and unknown services", async () => {
      const f = await createOnboardedShop(prisma, "inactive");
      await prisma.service.update({ where: { id: f.service.id }, data: { active: false } });

      await expect(
        createBooking(prisma, { clientId: f.clientA.id, now: NOW }, { serviceId: f.service.id, barberId: f.barber.id, startsAt: WEDNESDAY_10AM }),
      ).rejects.toThrow(ServiceInactiveError);

      await expect(
        createBooking(prisma, { clientId: f.clientA.id, now: NOW }, { serviceId: "svc-desconhecida", barberId: f.barber.id, startsAt: WEDNESDAY_10AM }),
      ).rejects.toThrow(ServiceNotFoundError);
    });

    it("rejects a service the barber is not assigned to", async () => {
      const f = await createOnboardedShop(prisma, "unassigned");
      const otherService = await prisma.service.create({
        data: { barbershopId: f.shop.id, name: "Barba", priceBRL: 30, durationMinutes: 20 },
      });
      await expect(
        createBooking(prisma, { clientId: f.clientA.id, now: NOW }, { serviceId: otherService.id, barberId: f.barber.id, startsAt: WEDNESDAY_10AM }),
      ).rejects.toThrow(ServiceNotAssignedError);
    });

    it("rejects a start outside the barber's schedule and a past start", async () => {
      const f = await createOnboardedShop(prisma, "outside");
      await expect(
        createBooking(prisma, { clientId: f.clientA.id, now: NOW }, { serviceId: f.service.id, barberId: f.barber.id, startsAt: "2026-10-07T21:00:00.000Z" }),
      ).rejects.toThrow(SlotOutsideScheduleError);

      await expect(
        createBooking(prisma, { clientId: f.clientA.id, now: NOW }, { serviceId: f.service.id, barberId: f.barber.id, startsAt: "2026-10-06T11:00:00.000Z" }),
      ).rejects.toThrow(PastDateError);
    });

    it("blocks booking until the tenant finishes onboarding", async () => {
      const f = await createOnboardedShop(prisma, "notready", { pixProvider: null });
      await expect(
        createBooking(prisma, { clientId: f.clientA.id, now: NOW }, { serviceId: f.service.id, barberId: f.barber.id, startsAt: WEDNESDAY_10AM }),
      ).rejects.toThrow(OnboardingIncompleteError);
    });
  });

  describe("reschedule (booking spec)", () => {
    it("moves the appointment atomically, frees the old slot and enqueues RESCHEDULE", async () => {
      const f = await createOnboardedShop(prisma, "resched");
      const created = await createBooking(
        prisma,
        { clientId: f.clientA.id, now: NOW },
        { serviceId: f.service.id, barberId: f.barber.id, startsAt: WEDNESDAY_10AM },
      );

      const moved = await rescheduleAppointment(
        prisma,
        { clientId: f.clientA.id, appointmentId: created.id, now: NOW },
        { startsAt: "2026-10-07T15:00:00.000Z" },
      );
      expect(moved.startsAt).toBe("2026-10-07T15:00:00.000Z");
      expect(moved.endsAt).toBe("2026-10-07T15:30:00.000Z");
      expect(moved.status).toBe("confirmed");

      const outbox = await prisma.emailNotification.findMany({
        where: { appointmentId: created.id },
        orderBy: { createdAt: "asc" },
      });
      expect(outbox.map((n) => n.type)).toEqual(["CONFIRMATION", "RESCHEDULE"]);

      // the old slot is free again → a new booking there succeeds
      const oldSlot = await createBooking(
        prisma,
        { clientId: f.clientB.id, now: NOW },
        { serviceId: f.service.id, barberId: f.barber.id, startsAt: WEDNESDAY_10AM },
      );
      expect(oldSlot.startsAt).toBe(WEDNESDAY_10AM);

      // the new slot is taken → another booking there conflicts
      await expect(
        createBooking(prisma, { clientId: f.clientB.id, now: NOW }, { serviceId: f.service.id, barberId: f.barber.id, startsAt: "2026-10-07T15:00:00.000Z" }),
      ).rejects.toThrow(BookingSlotConflictError);
    });

    it("rejects reschedule into an already-taken slot", async () => {
      const f = await createOnboardedShop(prisma, "resched-conflict");
      await createBooking(
        prisma,
        { clientId: f.clientA.id, now: NOW },
        { serviceId: f.service.id, barberId: f.barber.id, startsAt: WEDNESDAY_10AM },
      );
      const mine = await createBooking(
        prisma,
        { clientId: f.clientB.id, now: NOW },
        { serviceId: f.service.id, barberId: f.barber.id, startsAt: "2026-10-07T14:00:00.000Z" },
      );
      await expect(
        rescheduleAppointment(prisma, { clientId: f.clientB.id, appointmentId: mine.id, now: NOW }, { startsAt: WEDNESDAY_10AM }),
      ).rejects.toThrow(BookingSlotConflictError);
    });

    it("rejects reschedule inside the tenant reschedule window", async () => {
      const f = await createOnboardedShop(prisma, "resched-window", { rescheduleWindowHours: 24 });
      const created = await createBooking(
        prisma,
        { clientId: f.clientA.id, now: NOW },
        { serviceId: f.service.id, barberId: f.barber.id, startsAt: "2026-10-07T14:00:00.000Z" },
      );
      // now is 2h before the appointment start → inside the 24h window
      await expect(
        rescheduleAppointment(prisma, { clientId: f.clientA.id, appointmentId: created.id, now: new Date("2026-10-07T12:00:00.000Z") }, { startsAt: "2026-10-07T15:00:00.000Z" }),
      ).rejects.toThrow(RescheduleWindowRejectedError);
    });

    it("rejects rescheduling a completed appointment (invalid transition)", async () => {
      const f = await createOnboardedShop(prisma, "resched-completed");
      const created = await createBooking(
        prisma,
        { clientId: f.clientA.id, now: NOW },
        { serviceId: f.service.id, barberId: f.barber.id, startsAt: WEDNESDAY_10AM },
      );
      await prisma.appointment.update({ where: { id: created.id }, data: { status: "COMPLETED" } });
      await expect(
        rescheduleAppointment(prisma, { clientId: f.clientA.id, appointmentId: created.id, now: NOW }, { startsAt: "2026-10-07T15:00:00.000Z" }),
      ).rejects.toThrow(InvalidTransitionError);
    });
  });

  describe("cancel (booking spec)", () => {
    it("cancels a pending appointment within the free window and enqueues CANCELLATION", async () => {
      const f = await createOnboardedShop(prisma, "cancel-ok", { confirmationMode: "MANUAL" });
      const created = await createBooking(
        prisma,
        { clientId: f.clientA.id, now: NOW },
        { serviceId: f.service.id, barberId: f.barber.id, startsAt: WEDNESDAY_10AM },
      );
      expect(created.status).toBe("pending");

      const cancelled = await cancelAppointment(
        prisma,
        { clientId: f.clientA.id, appointmentId: created.id, now: NOW },
        { reason: "Imprevisto" },
      );
      expect(cancelled.status).toBe("cancelled");
      expect(cancelled.cancelReason).toBe("Imprevisto");

      const outbox = await prisma.emailNotification.findMany({ where: { appointmentId: created.id } });
      expect(outbox.map((n) => n.type).sort()).toEqual(["CANCELLATION", "CONFIRMATION"]);

      // the slot is free again (cancelled appointments never block)
      const rebook = await createBooking(
        prisma,
        { clientId: f.clientB.id, now: NOW },
        { serviceId: f.service.id, barberId: f.barber.id, startsAt: WEDNESDAY_10AM },
      );
      expect(rebook.startsAt).toBe(WEDNESDAY_10AM);
    });

    it("rejects late cancellation under the reject policy (spec scenario)", async () => {
      const f = await createOnboardedShop(prisma, "cancel-late", { lateCancelPolicy: "REJECT", freeCancelWindowHours: 24 });
      const created = await createBooking(
        prisma,
        { clientId: f.clientA.id, now: NOW },
        { serviceId: f.service.id, barberId: f.barber.id, startsAt: "2026-10-07T14:00:00.000Z" },
      );
      // appointment starts in 2h → inside the 24h free-cancel window
      await expect(
        cancelAppointment(prisma, { clientId: f.clientA.id, appointmentId: created.id, now: new Date("2026-10-07T12:00:00.000Z") }, {}),
      ).rejects.toThrow(LateCancelRejectedError);
    });

    it("allows late cancellation under the allow policy", async () => {
      const f = await createOnboardedShop(prisma, "cancel-allow", { lateCancelPolicy: "ALLOW", freeCancelWindowHours: 24 });
      const created = await createBooking(
        prisma,
        { clientId: f.clientA.id, now: NOW },
        { serviceId: f.service.id, barberId: f.barber.id, startsAt: "2026-10-07T14:00:00.000Z" },
      );
      const cancelled = await cancelAppointment(
        prisma,
        { clientId: f.clientA.id, appointmentId: created.id, now: new Date("2026-10-07T12:00:00.000Z") },
        {},
      );
      expect(cancelled.status).toBe("cancelled");
    });

    it("rejects cancelling a completed appointment (invalid transition)", async () => {
      const f = await createOnboardedShop(prisma, "cancel-completed");
      const created = await createBooking(
        prisma,
        { clientId: f.clientA.id, now: NOW },
        { serviceId: f.service.id, barberId: f.barber.id, startsAt: WEDNESDAY_10AM },
      );
      await prisma.appointment.update({ where: { id: created.id }, data: { status: "COMPLETED" } });
      await expect(
        cancelAppointment(prisma, { clientId: f.clientA.id, appointmentId: created.id, now: NOW }, {}),
      ).rejects.toThrow(InvalidTransitionError);
    });

    it("rejects lifecycle access to another client's appointment (404, no leak)", async () => {
      const f = await createOnboardedShop(prisma, "owner");
      const created = await createBooking(
        prisma,
        { clientId: f.clientA.id, now: NOW },
        { serviceId: f.service.id, barberId: f.barber.id, startsAt: WEDNESDAY_10AM },
      );
      await expect(
        cancelAppointment(prisma, { clientId: f.clientB.id, appointmentId: created.id, now: NOW }, {}),
      ).rejects.toThrow(AppointmentNotFoundError);
      await expect(
        rescheduleAppointment(prisma, { clientId: f.clientB.id, appointmentId: created.id, now: NOW }, { startsAt: "2026-10-07T15:00:00.000Z" }),
      ).rejects.toThrow(AppointmentNotFoundError);
    });
  });

  describe("slot conflict prevention (booking spec)", () => {
    it("exactly one of two parallel bookings for the same slot succeeds", async () => {
      const f = await createOnboardedShop(prisma, "race");
      const attempt = () =>
        createBooking(
          prisma,
          { clientId: f.clientA.id, now: NOW },
          { serviceId: f.service.id, barberId: f.barber.id, startsAt: WEDNESDAY_10AM },
        );

      // Two DIFFERENT clients racing for the same slot, both committed in parallel.
      const results = await Promise.allSettled([
        attempt(),
        createBooking(
          prisma,
          { clientId: f.clientB.id, now: NOW },
          { serviceId: f.service.id, barberId: f.barber.id, startsAt: WEDNESDAY_10AM },
        ),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      if (rejected[0].status === "rejected") {
        expect(rejected[0].reason).toBeInstanceOf(BookingSlotConflictError);
      }

      const rows = await prisma.appointment.count({ where: { barberId: f.barber.id } });
      expect(rows).toBe(1);
    });

    it("allows parallel bookings for adjacent non-overlapping slots", async () => {
      const f = await createOnboardedShop(prisma, "adjacent");
      const results = await Promise.allSettled([
        createBooking(prisma, { clientId: f.clientA.id, now: NOW }, { serviceId: f.service.id, barberId: f.barber.id, startsAt: WEDNESDAY_10AM }),
        createBooking(prisma, { clientId: f.clientB.id, now: NOW }, { serviceId: f.service.id, barberId: f.barber.id, startsAt: "2026-10-07T13:30:00.000Z" }),
      ]);
      expect(results.every((r) => r.status === "fulfilled")).toBe(true);
      const rows = await prisma.appointment.count({ where: { barberId: f.barber.id } });
      expect(rows).toBe(2);
    });

    it("rejects a booking that overlaps an existing appointment", async () => {
      const f = await createOnboardedShop(prisma, "overlap");
      await createBooking(
        prisma,
        { clientId: f.clientA.id, now: NOW },
        { serviceId: f.service.id, barberId: f.barber.id, startsAt: WEDNESDAY_10AM },
      );
      // 30-min service starting 10:15 local overlaps the 10:00-10:30 appointment
      await expect(
        createBooking(prisma, { clientId: f.clientB.id, now: NOW }, { serviceId: f.service.id, barberId: f.barber.id, startsAt: "2026-10-07T13:15:00.000Z" }),
      ).rejects.toThrow(BookingSlotConflictError);
    });
  });
});
