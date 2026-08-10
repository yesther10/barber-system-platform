import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GenericContainer, type StartedTestContainer } from "testcontainers";
import { createClient } from "../../packages/db/src/index.js";
import type { PrismaClient } from "../../packages/db/src/index.js";
import { createBooking } from "../../apps/web/lib/booking.js";
import { deletePersonalData, exportPersonalData } from "../../apps/web/lib/me-privacy.js";

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

async function createLgpdFixture(prisma: PrismaClient, tag: string) {
  const shop = await prisma.barbershop.create({
    data: {
      slug: `lgpd-shop-${tag}`,
      name: `LGPD Shop ${tag}`,
      timezone: "America/Sao_Paulo",
      pixProvider: "mercadopago",
    },
  });

  const barberUser = await prisma.user.create({
    data: { email: `lgpd.barber.${tag}@example.com`, name: "Carlos", role: "BARBER", barbershopId: shop.id },
  });
  const barber = await prisma.barber.create({
    data: { barbershopId: shop.id, userId: barberUser.id, specialties: ["corte"] },
  });
  const service = await prisma.service.create({
    data: { barbershopId: shop.id, name: "Corte", priceBRL: 45, durationMinutes: 30 },
  });
  await prisma.barberService.create({ data: { barberId: barber.id, serviceId: service.id } });
  await prisma.schedule.create({
    data: { barberId: barber.id, dayOfWeek: 3, startTime: "09:00", endTime: "17:00" },
  });
  const client = await prisma.user.create({
    data: {
      email: `lgpd.client.${tag}@example.com`,
      name: "Marina",
      phone: "+5511999999999",
      passwordHash: "hashed",
      role: "CLIENT",
      barbershopId: shop.id,
      consentAcceptedAt: new Date("2026-10-01T12:00:00.000Z"),
      consentPolicyVersion: "2026-08-07",
    },
  });

  return { shop, barber, client, service };
}

const NOW = new Date("2026-10-06T12:00:00.000Z");

describe("lgpd me export/delete", () => {
  let container: StartedTestContainer;
  let connectionString: string;
  let prisma: PrismaClient;

  beforeAll(async () => {
    ({ container, connectionString } = await startMysql());
    deployMigrations(connectionString);
    prisma = createClient(connectionString);
  }, 120_000);

  beforeEach(async () => {
    await prisma.paymentWebhookEvent.deleteMany();
    await prisma.emailNotification.deleteMany();
    await prisma.appointment.deleteMany();
    await prisma.barberService.deleteMany();
    await prisma.schedule.deleteMany();
    await prisma.scheduleException.deleteMany();
    await prisma.service.deleteMany();
    await prisma.barber.deleteMany();
    await prisma.user.deleteMany();
    await prisma.barbershop.deleteMany();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
  });

  it("exports structured personal data with consent and appointment history", async () => {
    const f = await createLgpdFixture(prisma, "export");
    await prisma.appointment.create({
      data: {
        barbershopId: f.shop.id,
        barberId: f.barber.id,
        clientId: f.client.id,
        serviceId: f.service.id,
        startsAt: new Date("2026-10-02T13:00:00.000Z"),
        endsAt: new Date("2026-10-02T13:30:00.000Z"),
        status: "COMPLETED",
        paymentStatus: "PAID",
        priceSnapshot: 45,
      },
    });

    const exported = await exportPersonalData(prisma, f.client.id, NOW);

    expect(exported).toEqual({
      user: {
        id: f.client.id,
        email: `lgpd.client.export@example.com`,
        name: "Marina",
        phone: "+5511999999999",
      },
      appointments: [
        {
          id: expect.any(String),
          barbershopId: f.shop.id,
          serviceId: f.service.id,
          startsAt: "2026-10-02T13:00:00.000Z",
          status: "completed",
          priceSnapshot: 45,
        },
      ],
      consent: {
        acceptedAt: "2026-10-01T12:00:00.000Z",
        policyVersion: "2026-08-07",
      },
      generatedAt: NOW.toISOString(),
    });
  });

  it("cancels future appointments, removes pending notifications, anonymizes PII and keeps legal rows", async () => {
    const f = await createLgpdFixture(prisma, "delete");
    const future = await createBooking(
      prisma,
      { clientId: f.client.id, now: NOW },
      { serviceId: f.service.id, barberId: f.barber.id, startsAt: "2026-10-07T13:00:00.000Z" },
    );
    const past = await prisma.appointment.create({
      data: {
        barbershopId: f.shop.id,
        barberId: f.barber.id,
        clientId: f.client.id,
        serviceId: f.service.id,
        startsAt: new Date("2026-10-02T13:00:00.000Z"),
        endsAt: new Date("2026-10-02T13:30:00.000Z"),
        status: "COMPLETED",
        paymentStatus: "PAID",
        priceSnapshot: 45,
      },
    });
    expect(await prisma.emailNotification.count({ where: { appointmentId: future.id } })).toBe(1);

    const deleted = await deletePersonalData(prisma, f.client.id, { confirm: true }, NOW);

    expect(deleted).toEqual({
      userId: f.client.id,
      anonymizedEmail: `deleted+${f.client.id}@deleted.local`,
      cancelledAppointments: 1,
      deletedAt: NOW.toISOString(),
    });

    const user = await prisma.user.findUniqueOrThrow({ where: { id: f.client.id } });
    expect(user.email).toBe(`deleted+${f.client.id}@deleted.local`);
    expect(user.name).toBeNull();
    expect(user.phone).toBeNull();
    expect(user.passwordHash).toBeNull();
    expect(user.consentAcceptedAt).toBeNull();
    expect(user.consentPolicyVersion).toBeNull();
    expect(user.consentWithdrawnAt?.toISOString()).toBe(NOW.toISOString());

    const cancelled = await prisma.appointment.findUniqueOrThrow({ where: { id: future.id } });
    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.cancelReason).toBe("LGPD account deletion request");
    expect(await prisma.emailNotification.count({ where: { appointmentId: future.id } })).toBe(0);

    const kept = await prisma.appointment.findUniqueOrThrow({ where: { id: past.id } });
    expect(kept.status).toBe("COMPLETED");
    expect(kept.paymentStatus).toBe("PAID");
    expect(Number(kept.priceSnapshot)).toBe(45);
  });

  it("confirms deletion for an empty account without error", async () => {
    const shop = await prisma.barbershop.create({
      data: { slug: "lgpd-empty", name: "LGPD Empty", timezone: "America/Sao_Paulo" },
    });
    const client = await prisma.user.create({
      data: { email: "empty.client@example.com", role: "CLIENT", barbershopId: shop.id },
    });

    const deleted = await deletePersonalData(prisma, client.id, { confirm: true }, NOW);

    expect(deleted.cancelledAppointments).toBe(0);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: client.id } });
    expect(user.email).toBe(`deleted+${client.id}@deleted.local`);
    expect(user.consentWithdrawnAt?.toISOString()).toBe(NOW.toISOString());
  });
});
