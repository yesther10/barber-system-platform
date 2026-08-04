import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GenericContainer, type StartedTestContainer } from "testcontainers";
import { createClient } from "../../packages/db/src/index.js";
import type { PrismaClient } from "../../packages/db/src/index.js";
import {
  assignServiceToBarber,
  BarberNotFoundError,
  BarberUserError,
  createBarber,
  createException,
  createSchedule,
  createService,
  deleteException,
  deleteSchedule,
  deleteService,
  ExceptionNotFoundError,
  getPublicServices,
  listBarbers,
  listExceptions,
  listSchedules,
  listServices,
  ScheduleNotFoundError,
  ServiceHasAppointmentsError,
  ServiceNotFoundError,
  unassignServiceFromBarber,
  updateBarber,
  updateSchedule,
  updateService,
  WindowOrderError,
} from "../../apps/web/lib/catalog.js";
import { TenantNotFoundError } from "../../apps/web/lib/onboarding.js";

/**
 * Catalog integration suite (catalog spec) against a real MySQL 8 via
 * Testcontainers: tenant-scoped CRUD for services, barbers, schedules and
 * exceptions; deactivation makes a service unbookable without touching
 * existing appointments; cross-tenant access resolves to 404.
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

/** Creates a tenant with an admin + a barber user ready for profile creation. */
async function shopFixture(prisma: PrismaClient, tag: string) {
  const shop = await prisma.barbershop.create({
    data: {
      slug: `cat-shop-${tag}`,
      name: `Catalog Shop ${tag}`,
      timezone: "America/Sao_Paulo",
    },
  });
  const admin = await prisma.user.create({
    data: { email: `cat.admin.${tag}@example.com`, name: "Admin", role: "BARBERSHOP_ADMIN", barbershopId: shop.id },
  });
  const barberUser = await prisma.user.create({
    data: { email: `cat.barber.${tag}@example.com`, name: "Carlos", role: "BARBER", barbershopId: shop.id },
  });
  return { shop, admin, barberUser };
}

describe("catalog admin CRUD", () => {
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

  describe("services (catalog spec)", () => {
    it("creates, lists and updates a tenant-scoped service", async () => {
      const f = await shopFixture(prisma, "svc");

      const created = await createService(prisma, f.shop.id, {
        name: "Corte Degradê",
        priceBRL: 60,
        durationMinutes: 40,
      });
      expect(created.id).toBeTruthy();
      expect(created.active).toBe(true);
      expect(created.priceBRL).toBe(60);

      const listed = await listServices(prisma, f.shop.id);
      expect(listed.map((s) => s.name)).toEqual(["Corte Degradê"]);

      const updated = await updateService(prisma, f.shop.id, created.id, {
        priceBRL: 70,
        durationMinutes: 45,
      });
      expect(updated.priceBRL).toBe(70);
      expect(updated.durationMinutes).toBe(45);
    });

    it("deactivate hides the service from public booking but keeps appointments", async () => {
      const f = await shopFixture(prisma, "deact");
      const service = await createService(prisma, f.shop.id, {
        name: "Corte",
        priceBRL: 45,
        durationMinutes: 30,
      });
      const barber = await createBarber(prisma, f.shop.id, {
        userId: f.barberUser.id,
        specialties: ["corte"],
      });
      const client = await prisma.user.create({
        data: { email: `cat.client.deact@example.com`, name: "Cliente", role: "CLIENT", barbershopId: f.shop.id },
      });
      const appointment = await prisma.appointment.create({
        data: {
          barbershopId: f.shop.id,
          barberId: barber.id,
          clientId: client.id,
          serviceId: service.id,
          startsAt: new Date("2026-10-07T13:00:00.000Z"),
          endsAt: new Date("2026-10-07T13:30:00.000Z"),
          priceSnapshot: 45,
        },
      });

      const deactivated = await updateService(prisma, f.shop.id, service.id, { active: false });
      expect(deactivated.active).toBe(false);

      // public browse shows only active services → the deactivated one is gone
      const publicList = await getPublicServices(prisma, f.shop.slug);
      expect(publicList).toHaveLength(0);

      // existing appointments remain unchanged
      const kept = await prisma.appointment.findUnique({ where: { id: appointment.id } });
      expect(kept?.status).toBe("PENDING");
      expect(Number(kept?.priceSnapshot)).toBe(45);
    });

    it("refuses to delete a service that still has appointments", async () => {
      const f = await shopFixture(prisma, "used");
      const service = await createService(prisma, f.shop.id, { name: "Barba", priceBRL: 30, durationMinutes: 20 });
      const barber = await createBarber(prisma, f.shop.id, { userId: f.barberUser.id, specialties: ["barba"] });
      const client = await prisma.user.create({
        data: { email: "cat.client.used@example.com", name: "C", role: "CLIENT", barbershopId: f.shop.id },
      });
      await prisma.appointment.create({
        data: {
          barbershopId: f.shop.id,
          barberId: barber.id,
          clientId: client.id,
          serviceId: service.id,
          startsAt: new Date("2026-10-08T13:00:00.000Z"),
          endsAt: new Date("2026-10-08T13:20:00.000Z"),
          priceSnapshot: 30,
        },
      });

      await expect(deleteService(prisma, f.shop.id, service.id)).rejects.toThrow(ServiceHasAppointmentsError);

      const unused = await createService(prisma, f.shop.id, { name: "Sobrancelha", priceBRL: 25, durationMinutes: 15 });
      await deleteService(prisma, f.shop.id, unused.id);
      const rows = await prisma.service.findUnique({ where: { id: unused.id } });
      expect(rows).toBeNull();
    });

    it("scopes service updates and deletes to the tenant (404, no leak)", async () => {
      const a = await shopFixture(prisma, "svc-a");
      const b = await shopFixture(prisma, "svc-b");
      const service = await createService(prisma, a.shop.id, { name: "Corte", priceBRL: 45, durationMinutes: 30 });

      await expect(updateService(prisma, b.shop.id, service.id, { priceBRL: 1 })).rejects.toThrow(
        ServiceNotFoundError,
      );
      await expect(deleteService(prisma, b.shop.id, service.id)).rejects.toThrow(ServiceNotFoundError);

      const rows = await prisma.service.findUnique({ where: { id: service.id } });
      expect(Number(rows?.priceBRL)).toBe(45);
    });
  });

  describe("barbers (catalog spec)", () => {
    it("creates a barber profile linked to the tenant barber user", async () => {
      const f = await shopFixture(prisma, "barber");
      const barber = await createBarber(prisma, f.shop.id, {
        userId: f.barberUser.id,
        specialties: ["corte", "barba"],
        bio: "Especialista em degradê",
      });
      expect(barber.id).toBeTruthy();
      expect(barber.specialties).toEqual(["corte", "barba"]);
      expect(barber.bio).toBe("Especialista em degradê");

      const listed = await listBarbers(prisma, f.shop.id);
      expect(listed).toHaveLength(1);
      expect(listed[0].id).toBe(barber.id);
    });

    it("rejects a profile for a user that is not a barber in the tenant", async () => {
      const f = await shopFixture(prisma, "baduser");
      const outsider = await prisma.user.create({
        data: { email: "cat.outsider@example.com", name: "Fora", role: "CLIENT" },
      });
      await expect(
        createBarber(prisma, f.shop.id, { userId: outsider.id, specialties: ["corte"] }),
      ).rejects.toThrow(BarberUserError);
    });

    it("updates specialties and deactivation flag", async () => {
      const f = await shopFixture(prisma, "upd");
      const barber = await createBarber(prisma, f.shop.id, { userId: f.barberUser.id, specialties: ["corte"] });
      const updated = await updateBarber(prisma, f.shop.id, barber.id, {
        specialties: ["barba", "pigmentacao"],
        active: false,
      });
      expect(updated.specialties).toEqual(["barba", "pigmentacao"]);
      expect(updated.active).toBe(false);
    });

    it("assigns and unassigns services from a barber (assignment lists)", async () => {
      const f = await shopFixture(prisma, "assign");
      const barber = await createBarber(prisma, f.shop.id, { userId: f.barberUser.id, specialties: ["corte"] });
      const corte = await createService(prisma, f.shop.id, { name: "Corte", priceBRL: 45, durationMinutes: 30 });
      const barba = await createService(prisma, f.shop.id, { name: "Barba", priceBRL: 30, durationMinutes: 20 });

      await assignServiceToBarber(prisma, f.shop.id, barber.id, corte.id);
      await assignServiceToBarber(prisma, f.shop.id, barber.id, barba.id);

      const rows = await prisma.barberService.findMany({
        where: { barberId: barber.id },
        orderBy: { serviceId: "asc" },
      });
      expect(rows.map((r) => r.serviceId)).toEqual([corte.id, barba.id].sort());

      await unassignServiceFromBarber(prisma, f.shop.id, barber.id, corte.id);
      const after = await prisma.barberService.count({ where: { barberId: barber.id } });
      expect(after).toBe(1);
    });
  });

  describe("schedules + exceptions (catalog spec)", () => {
    it("creates, lists, updates and deletes a weekly schedule", async () => {
      const f = await shopFixture(prisma, "sch");
      const barber = await createBarber(prisma, f.shop.id, { userId: f.barberUser.id, specialties: ["corte"] });

      const created = await createSchedule(prisma, f.shop.id, {
        barberId: barber.id,
        dayOfWeek: 3,
        startTime: "09:00",
        endTime: "17:00",
      });
      expect(created.dayOfWeek).toBe(3);

      const listed = await listSchedules(prisma, f.shop.id);
      expect(listed.map((s) => s.id)).toEqual([created.id]);

      const updated = await updateSchedule(prisma, f.shop.id, created.id, { endTime: "18:00" });
      expect(updated.endTime).toBe("18:00");

      await deleteSchedule(prisma, f.shop.id, created.id);
      expect(await listSchedules(prisma, f.shop.id)).toHaveLength(0);
    });

    it("rejects an inverted schedule window", async () => {
      const f = await shopFixture(prisma, "invert");
      const barber = await createBarber(prisma, f.shop.id, { userId: f.barberUser.id, specialties: ["corte"] });
      await expect(
        createSchedule(prisma, f.shop.id, { barberId: barber.id, dayOfWeek: 3, startTime: "17:00", endTime: "09:00" }),
      ).rejects.toThrow(WindowOrderError);
    });

    it("creates, lists and deletes a day-off exception", async () => {
      const f = await shopFixture(prisma, "exc");
      const barber = await createBarber(prisma, f.shop.id, { userId: f.barberUser.id, specialties: ["corte"] });

      const created = await createException(prisma, f.shop.id, {
        barberId: barber.id,
        date: "2026-10-07",
        startTime: "09:00",
        endTime: "17:00",
        reason: "Feriado",
      });
      expect(created.date).toBe("2026-10-07");
      expect(created.reason).toBe("Feriado");

      const listed = await listExceptions(prisma, f.shop.id, { date: "2026-10-07" });
      expect(listed.map((e) => e.id)).toEqual([created.id]);

      await deleteException(prisma, f.shop.id, created.id);
      expect(await listExceptions(prisma, f.shop.id)).toHaveLength(0);
    });

    it("scopes schedule and exception access to the tenant (404)", async () => {
      const a = await shopFixture(prisma, "sch-a");
      const b = await shopFixture(prisma, "sch-b");
      const barberA = await createBarber(prisma, a.shop.id, { userId: a.barberUser.id, specialties: ["corte"] });
      const schedule = await createSchedule(prisma, a.shop.id, {
        barberId: barberA.id,
        dayOfWeek: 3,
        startTime: "09:00",
        endTime: "17:00",
      });
      const exception = await createException(prisma, a.shop.id, {
        barberId: barberA.id,
        date: "2026-10-07",
        startTime: "09:00",
        endTime: "17:00",
      });

      await expect(updateSchedule(prisma, b.shop.id, schedule.id, { endTime: "18:00" })).rejects.toThrow(
        ScheduleNotFoundError,
      );
      await expect(deleteSchedule(prisma, b.shop.id, schedule.id)).rejects.toThrow(ScheduleNotFoundError);
      await expect(deleteException(prisma, b.shop.id, exception.id)).rejects.toThrow(ExceptionNotFoundError);
      await expect(createSchedule(prisma, b.shop.id, { barberId: barberA.id, dayOfWeek: 2, startTime: "09:00", endTime: "12:00" })).rejects.toThrow(BarberNotFoundError);
    });

    it("public services listing 404s for an unknown tenant slug", async () => {
      await expect(getPublicServices(prisma, "nao-existe")).rejects.toThrow(TenantNotFoundError);
    });
  });
});
