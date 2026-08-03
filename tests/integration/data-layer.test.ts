import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GenericContainer, type StartedTestContainer } from "testcontainers";
import { requireTenant, scope, TenantContextError } from "../../apps/web/lib/tenant.js";
import { createClient } from "../../packages/db/src/index.js";
import type { PrismaClient } from "../../packages/db/src/index.js";
import { seedDatabase } from "../../packages/db/prisma/seed.js";

/**
 * Data-layer integration suite (tenant-management + booking specs) against a
 * real Postgres via Testcontainers:
 * 1. deploys the committed migrations (incl. btree_gist no_overlap),
 * 2. runs the A/B seed,
 * 3. proves tenant isolation (scoped listing, cross-tenant 404) and the
 *    DB-enforced slot-conflict constraint.
 */
async function startPostgres() {
  const container = await new GenericContainer("postgres:16-alpine")
    .withExposedPorts(5432)
    .withEnvironment({
      POSTGRES_USER: "test",
      POSTGRES_PASSWORD: "test",
      POSTGRES_DB: "barberia_test",
    })
    .start();
  const connectionString = `postgresql://test:test@${container.getHost()}:${container.getMappedPort(5432)}/barberia_test`;
  return { container, connectionString };
}

function deployMigrations(connectionString: string) {
  execFileSync(resolve(process.cwd(), "packages/db/node_modules/.bin/prisma"), ["migrate", "deploy"], {
    cwd: resolve(process.cwd(), "packages/db"),
    env: { ...process.env, DATABASE_URL: connectionString },
    stdio: "pipe",
  });
}

describe("data layer", () => {
  let container: StartedTestContainer;
  let connectionString: string;
  let prisma: PrismaClient;
  let seeded: Awaited<ReturnType<typeof seedDatabase>>;

  beforeAll(async () => {
    ({ container, connectionString } = await startPostgres());
    deployMigrations(connectionString);
    prisma = createClient(connectionString);
    seeded = await seedDatabase(prisma);
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
  });

  describe("tenant isolation (tenant-management spec)", () => {
    it("scoped listing returns only the caller's appointments", async () => {
      const where = { ...scope(seeded.barbershopA.id) };
      const rows = await prisma.appointment.findMany({
        where,
        select: { id: true },
        orderBy: { startsAt: "asc" },
      });
      expect(rows.map((r) => r.id)).toEqual([seeded.appointmentA.id]);
    });

    it("cross-tenant access returns 404-equivalent and leaks nothing", async () => {
      const unscoped = await prisma.appointment.findFirst({
        where: { id: seeded.appointmentB.id },
        select: { id: true },
      });
      expect(unscoped?.id).toBe(seeded.appointmentB.id);

      const scoped = await prisma.appointment.findFirst({
        where: { id: seeded.appointmentB.id, ...scope(seeded.barbershopA.id) },
        select: { id: true },
      });
      expect(scoped).toBeNull();
    });

    it("requireTenant guards operations without a tenant context", () => {
      expect(() => requireTenant({})).toThrow(TenantContextError);
      expect(() => scope("")).toThrow(TenantContextError);
    });
  });

  describe("slot conflict prevention (booking spec)", () => {
    async function slotFixture(tag: string) {
      const shop = await prisma.barbershop.create({
        data: {
          slug: `slot-conflict-shop-${tag}`,
          name: "Slot Conflict Shop",
          timezone: "America/Sao_Paulo",
        },
      });
      const barberUser = await prisma.user.create({
        data: {
          email: `slot.barber.${tag}@example.com`,
          name: "Slot Barber",
          role: "BARBER",
          barbershopId: shop.id,
        },
      });
      const barber = await prisma.barber.create({
        data: { barbershopId: shop.id, userId: barberUser.id, specialties: ["corte"] },
      });
      const client = await prisma.user.create({
        data: {
          email: `slot.client.${tag}@example.com`,
          name: "Slot Client",
          role: "CLIENT",
          barbershopId: shop.id,
        },
      });
      const service = await prisma.service.create({
        data: { barbershopId: shop.id, name: "Corte", priceBRL: 40, durationMinutes: 30 },
      });
      return { shop, barber, client, service };
    }

    it("rejects an overlapping appointment for the same barber", async () => {
      const f = await slotFixture("overlap");
      await prisma.appointment.create({
        data: {
          barbershopId: f.shop.id,
          barberId: f.barber.id,
          clientId: f.client.id,
          serviceId: f.service.id,
          startsAt: new Date("2026-09-01T13:00:00.000Z"),
          endsAt: new Date("2026-09-01T14:00:00.000Z"),
          priceSnapshot: 40,
        },
      });
      const overlap = prisma.appointment.create({
        data: {
          barbershopId: f.shop.id,
          barberId: f.barber.id,
          clientId: f.client.id,
          serviceId: f.service.id,
          startsAt: new Date("2026-09-01T13:30:00.000Z"),
          endsAt: new Date("2026-09-01T14:30:00.000Z"),
          priceSnapshot: 40,
        },
      });
      // Prisma 7 reports exclusion-constraint violations as P2039 (23P01),
      // with the constraint name in the driver-adapter error message.
      await expect(overlap).rejects.toMatchObject({
        code: "P2039",
        meta: { driverAdapterError: { cause: { message: expect.stringContaining('"no_overlap"') } } },
      });
    });

    it("allows adjacent non-overlapping appointments for the same barber", async () => {
      const f = await slotFixture("adjacent");
      const first = await prisma.appointment.create({
        data: {
          barbershopId: f.shop.id,
          barberId: f.barber.id,
          clientId: f.client.id,
          serviceId: f.service.id,
          startsAt: new Date("2026-09-02T10:00:00.000Z"),
          endsAt: new Date("2026-09-02T11:00:00.000Z"),
          priceSnapshot: 40,
        },
      });
      const adjacent = await prisma.appointment.create({
        data: {
          barbershopId: f.shop.id,
          barberId: f.barber.id,
          clientId: f.client.id,
          serviceId: f.service.id,
          startsAt: new Date("2026-09-02T11:00:00.000Z"),
          endsAt: new Date("2026-09-02T12:00:00.000Z"),
          priceSnapshot: 40,
        },
      });
      expect(first.id).not.toBe(adjacent.id);
      const count = await prisma.appointment.count({
        where: { barberId: f.barber.id },
      });
      expect(count).toBe(2);
    });

    it("allows overlapping appointments for different barbers", async () => {
      const f = await slotFixture("other-barber");
      const otherBarberUser = await prisma.user.create({
        data: { email: "slot.barber2.other@example.com", name: "Other Barber", role: "BARBER", barbershopId: f.shop.id },
      });
      const otherBarber = await prisma.barber.create({
        data: { barbershopId: f.shop.id, userId: otherBarberUser.id, specialties: ["barba"] },
      });
      await prisma.appointment.create({
        data: {
          barbershopId: f.shop.id,
          barberId: f.barber.id,
          clientId: f.client.id,
          serviceId: f.service.id,
          startsAt: new Date("2026-09-03T10:00:00.000Z"),
          endsAt: new Date("2026-09-03T11:00:00.000Z"),
          priceSnapshot: 40,
        },
      });
      const other = await prisma.appointment.create({
        data: {
          barbershopId: f.shop.id,
          barberId: otherBarber.id,
          clientId: f.client.id,
          serviceId: f.service.id,
          startsAt: new Date("2026-09-03T10:30:00.000Z"),
          endsAt: new Date("2026-09-03T11:30:00.000Z"),
          priceSnapshot: 40,
        },
      });
      expect(other.id).toBeTruthy();
    });
  });
});
