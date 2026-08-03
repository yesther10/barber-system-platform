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
 * real MySQL 8 via Testcontainers:
 * 1. deploys the committed migrations,
 * 2. runs the A/B seed,
 * 3. proves tenant isolation (scoped listing, cross-tenant 404) and that
 *    slot inserts work. Slot-conflict prevention is application-level
 *    (SELECT ... FOR UPDATE + transactional re-validation) and ships with
 *    WU5 (booking service) — MySQL has no exclusion constraints.
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

describe("data layer", () => {
  let container: StartedTestContainer;
  let connectionString: string;
  let prisma: PrismaClient;
  let seeded: Awaited<ReturnType<typeof seedDatabase>>;

  beforeAll(async () => {
    ({ container, connectionString } = await startMysql());
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

  // Slot-conflict prevention moves to WU5 (booking service app lock:
  // SELECT ... FOR UPDATE on the barber + transactional re-validation).
  // These tests only prove that non-conflicting inserts land correctly;
  // the overlapping-insert rejection test was removed because MySQL has
  // no exclusion constraints (see design.md Decision 4).
  describe("slot inserts (conflict prevention moves to WU5 app lock)", () => {
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
