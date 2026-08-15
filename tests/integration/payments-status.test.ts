import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GenericContainer, type StartedTestContainer } from "testcontainers";
import { createClient } from "../../packages/db/src/index.js";
import type { PrismaClient } from "../../packages/db/src/index.js";
import { getPaymentStatusView } from "../../apps/web/lib/payments.js";

/**
 * Payment status read integration suite (payments spec) against a real
 * MySQL 8 via Testcontainers: `GET /api/payments/{id}` resolution matches
 * the appointment by `providerPaymentId` first, then the raw appointment id,
 * then the `pix_`-prefixed payment id form (stripped); an id matching no
 * appointment or an appointment of another client resolves to 404
 * `PAYMENT_APPOINTMENT_NOT_FOUND` with no ownership leak.
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

/** A tenant with one client and one appointment (deterministic `apt-{tag}` id). */
async function shopWithAppointment(prisma: PrismaClient, tag: string) {
  const shop = await prisma.barbershop.create({
    data: {
      slug: `pay-shop-${tag}`,
      name: `Pay Shop ${tag}`,
      timezone: "America/Sao_Paulo",
    },
  });
  const barberUser = await prisma.user.create({
    data: { email: `pay.barber.${tag}@example.com`, name: "Carlos", role: "BARBER", barbershopId: shop.id },
  });
  const barber = await prisma.barber.create({
    data: { barbershopId: shop.id, userId: barberUser.id, specialties: ["corte"] },
  });
  const client = await prisma.user.create({
    data: { email: `pay.client.${tag}@example.com`, name: "Maria", role: "CLIENT", barbershopId: shop.id },
  });
  const service = await prisma.service.create({
    data: { barbershopId: shop.id, name: "Corte", priceBRL: 45, durationMinutes: 30 },
  });
  const appointment = await prisma.appointment.create({
    data: {
      id: `apt-${tag}`,
      barbershopId: shop.id,
      barberId: barber.id,
      clientId: client.id,
      serviceId: service.id,
      startsAt: new Date("2026-10-07T13:00:00.000Z"),
      endsAt: new Date("2026-10-07T13:30:00.000Z"),
      priceSnapshot: 45,
    },
  });
  return { shop, client, appointment };
}

describe("payment status read (payments spec)", () => {
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

  it("resolves the appointment by providerPaymentId (provider_ form)", async () => {
    const f = await shopWithAppointment(prisma, "provider");
    // state a processed paid webhook would have written
    await prisma.appointment.update({
      where: { id: f.appointment.id },
      data: { providerPaymentId: "provider_abc", paymentStatus: "PAID", status: "CONFIRMED" },
    });

    const view = await getPaymentStatusView(prisma, f.client.id, "provider_abc");
    expect(view).toEqual({
      appointmentId: f.appointment.id,
      paymentStatus: "paid",
      appointmentStatus: "confirmed",
    });
  });

  it("resolves the appointment by pix_ payment id (stripped form)", async () => {
    const f = await shopWithAppointment(prisma, "pixform");
    await prisma.appointment.update({
      where: { id: f.appointment.id },
      data: { paymentStatus: "EXPIRED" },
    });

    const view = await getPaymentStatusView(prisma, f.client.id, `pix_${f.appointment.id}`);
    expect(view.appointmentId).toBe(f.appointment.id);
    expect(view.paymentStatus).toBe("expired");
  });

  it("resolves the appointment by raw appointment id", async () => {
    const f = await shopWithAppointment(prisma, "raw");
    const view = await getPaymentStatusView(prisma, f.client.id, f.appointment.id);
    expect(view.appointmentId).toBe(f.appointment.id);
    expect(view.paymentStatus).toBe("pending");
    expect(view.appointmentStatus).toBe("pending");
  });

  it("404s for a foreign client's appointment (no ownership leak)", async () => {
    const owner = await shopWithAppointment(prisma, "owner");
    const stranger = await shopWithAppointment(prisma, "stranger");

    await expect(
      getPaymentStatusView(prisma, stranger.client.id, owner.appointment.id),
    ).rejects.toMatchObject({ code: "PAYMENT_APPOINTMENT_NOT_FOUND" });
    // the foreign provider id form is equally invisible
    await prisma.appointment.update({
      where: { id: owner.appointment.id },
      data: { providerPaymentId: "provider_abc" },
    });
    await expect(
      getPaymentStatusView(prisma, stranger.client.id, "provider_abc"),
    ).rejects.toMatchObject({ code: "PAYMENT_APPOINTMENT_NOT_FOUND" });
  });

  it("404s for unknown ids (raw and pix_ forms)", async () => {
    const f = await shopWithAppointment(prisma, "unknown");
    await expect(
      getPaymentStatusView(prisma, f.client.id, "nao-existe"),
    ).rejects.toMatchObject({ code: "PAYMENT_APPOINTMENT_NOT_FOUND" });
    await expect(
      getPaymentStatusView(prisma, f.client.id, "pix_nao-existe"),
    ).rejects.toMatchObject({ code: "PAYMENT_APPOINTMENT_NOT_FOUND" });
  });
});