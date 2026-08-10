import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GenericContainer, type StartedTestContainer } from "testcontainers";
import { createClient, PaymentStatus } from "../../packages/db/src/index.js";
import type { PrismaClient } from "../../packages/db/src/index.js";
import { createBooking } from "../../apps/web/lib/booking.js";
import {
  applyWebhookPayment,
  createPixPayment,
  ManualPaymentAlreadyProcessedError,
  markAppointmentPaidManually,
} from "../../packages/payments/src/service.js";
import {
  outboxScan,
  reminderScan,
  type WorkerDependencies,
} from "../../apps/worker/src/index.js";
import type { PaymentRecord, PixProvider } from "../../packages/payments/src/index.js";

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

async function createOnboardedShop(prisma: PrismaClient, tag: string, confirmationMode: "AUTO" | "MANUAL" = "AUTO") {
  const shop = await prisma.barbershop.create({
    data: {
      slug: `payments-shop-${tag}`,
      name: `Payments Shop ${tag}`,
      timezone: "America/Sao_Paulo",
      confirmationMode,
      pixProvider: "mercado_pago",
      pixCredentials: { accessToken: "token", webhookSecret: "secret" },
      reminderLeadHours: 24,
    },
  });

  const barberUser = await prisma.user.create({
    data: { email: `payments.barber.${tag}@example.com`, name: "Carlos", role: "BARBER", barbershopId: shop.id },
  });
  const barber = await prisma.barber.create({
    data: { barbershopId: shop.id, userId: barberUser.id, specialties: ["corte"] },
  });
  const client = await prisma.user.create({
    data: { email: `payments.client.${tag}@example.com`, name: "Marina", role: "CLIENT", barbershopId: shop.id },
  });
  const admin = await prisma.user.create({
    data: { email: `payments.admin.${tag}@example.com`, name: "Admin", role: "BARBERSHOP_ADMIN", barbershopId: shop.id },
  });
  const service = await prisma.service.create({
    data: { barbershopId: shop.id, name: "Corte", priceBRL: 45, durationMinutes: 30 },
  });
  await prisma.barberService.create({ data: { barberId: barber.id, serviceId: service.id } });
  await prisma.schedule.create({
    data: { barberId: barber.id, dayOfWeek: 3, startTime: "09:00", endTime: "17:00" },
  });

  return { shop, barber, client, admin, service };
}

function fakeProvider(overrides: Partial<PixProvider> = {}, payment: Partial<PaymentRecord> = {}): PixProvider {
  const approved: PaymentRecord = {
    id: payment.id ?? "123",
    appointmentId: payment.appointmentId ?? "apt_default",
    providerId: payment.providerId ?? "123",
    status: payment.status ?? "approved",
    qrCode: payment.qrCode ?? "000201pix",
    qrCodeBase64: payment.qrCodeBase64 ?? "base64qr",
    ticketUrl: payment.ticketUrl ?? "https://mp.test/ticket",
    expiresAt: payment.expiresAt ?? "2026-10-07T15:30:00.000Z",
    raw: payment.raw ?? {},
  };

  return {
    name: "mercadopago",
    createPayment: vi.fn().mockResolvedValue({ ...approved, status: "pending" }),
    getPayment: vi.fn().mockResolvedValue(approved),
    refund: vi.fn().mockResolvedValue({ id: "refund_1", refunded: true }),
    verifyWebhook: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

const NOW = new Date("2026-10-06T12:00:00.000Z");
const SLOT = "2026-10-07T13:00:00.000Z";

describe("payments + worker", () => {
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

  it("creates a Pix payment and keeps the appointment when provider generation fails", async () => {
    const f = await createOnboardedShop(prisma, `pix-${Date.now()}`);
    const appointment = await createBooking(prisma, { clientId: f.client.id, now: NOW }, { serviceId: f.service.id, barberId: f.barber.id, startsAt: SLOT });
    const successProvider = fakeProvider({}, { appointmentId: appointment.id });

    const payment = await createPixPayment(prisma, successProvider, {
      appointmentId: appointment.id,
      clientId: f.client.id,
    });

    expect(payment.status).toBe("pending");
    expect(payment.qrCode).toContain("000201");
    const updated = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
    expect(updated.providerPaymentId).toBe("123");
    expect(updated.paymentStatus).toBe(PaymentStatus.PENDING);

    const other = await createBooking(prisma, { clientId: f.client.id, now: NOW }, { serviceId: f.service.id, barberId: f.barber.id, startsAt: "2026-10-07T14:00:00.000Z" });
    const failingProvider = fakeProvider({ createPayment: vi.fn().mockRejectedValue(new Error("provider down")) });

    await expect(createPixPayment(prisma, failingProvider, { appointmentId: other.id, clientId: f.client.id })).rejects.toThrow("provider down");

    const persisted = await prisma.appointment.findUniqueOrThrow({ where: { id: other.id } });
    expect(persisted.id).toBe(other.id);
    expect(persisted.providerPaymentId).toBeNull();
    expect(persisted.paymentStatus).toBe(PaymentStatus.PENDING);
  });

  it("processes the first paid webhook once and ignores duplicate deliveries", async () => {
    const f = await createOnboardedShop(prisma, `webhook-${Date.now()}`);
    const appointment = await createBooking(prisma, { clientId: f.client.id, now: NOW }, { serviceId: f.service.id, barberId: f.barber.id, startsAt: SLOT });
    await prisma.appointment.update({ where: { id: appointment.id }, data: { providerPaymentId: "pay_1" } });
    const provider = fakeProvider({}, { appointmentId: appointment.id, providerId: "pay_1", raw: { id: "pay_1" } });

    const first = await applyWebhookPayment(prisma, provider, {
      dataId: "pay_1",
      providerEventId: "evt_1",
      secret: "secret",
      xRequestId: "req_1",
      xSignature: "ts=1,v1=abc",
    });

    expect(first.duplicate).toBe(false);
    const paid = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
    expect(paid.paymentStatus).toBe(PaymentStatus.PAID);
    expect(paid.status).toBe("CONFIRMED");

    const duplicate = await applyWebhookPayment(prisma, provider, {
      dataId: "pay_1",
      providerEventId: "evt_1",
      secret: "secret",
      xRequestId: "req_1",
      xSignature: "ts=1,v1=abc",
    });

    expect(duplicate.duplicate).toBe(true);
    expect(await prisma.paymentWebhookEvent.count({ where: { providerEventId: "evt_1" } })).toBe(1);
  });

  it("marks manual in-shop payment as paid and rejects replaying the same manual payment", async () => {
    const f = await createOnboardedShop(prisma, `manual-${Date.now()}`, "MANUAL");
    const appointment = await createBooking(prisma, { clientId: f.client.id, now: NOW }, { serviceId: f.service.id, barberId: f.barber.id, startsAt: SLOT });

    const paid = await markAppointmentPaidManually(prisma, {
      appointmentId: appointment.id,
      barbershopId: f.shop.id,
      now: NOW,
    });

    expect(paid.paymentStatus).toBe("paid");
    expect(paid.status).toBe("pending");

    await expect(
      markAppointmentPaidManually(prisma, {
        appointmentId: appointment.id,
        barbershopId: f.shop.id,
        now: NOW,
      }),
    ).rejects.toThrow(ManualPaymentAlreadyProcessedError);
  });

  it("sends persisted confirmation emails on the next outbox scan after a crash", async () => {
    const f = await createOnboardedShop(prisma, `outbox-${Date.now()}`);
    const appointment = await createBooking(prisma, { clientId: f.client.id, now: NOW }, { serviceId: f.service.id, barberId: f.barber.id, startsAt: SLOT });
    const send = vi.fn().mockResolvedValue({ id: "email_1" });
    const deps: WorkerDependencies = { db: prisma, now: NOW, sendEmail: send, paymentProviderFactory: () => fakeProvider() };

    const result = await outboxScan(deps);

    expect(result.handled).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
    const rows = await prisma.emailNotification.findMany({ where: { appointmentId: appointment.id } });
    expect(rows[0]?.status).toBe("SENT");
  });

  it("retries a failed outbox delivery on the next eligible scan and eventually marks it sent", async () => {
    const f = await createOnboardedShop(prisma, `retry-${Date.now()}`);
    const appointment = await createBooking(
      prisma,
      { clientId: f.client.id, now: NOW },
      { serviceId: f.service.id, barberId: f.barber.id, startsAt: SLOT },
    );
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary provider failure"))
      .mockResolvedValueOnce({ id: "email_retry" });

    const first = await outboxScan({
      db: prisma,
      now: NOW,
      sendEmail: send,
      paymentProviderFactory: () => fakeProvider(),
    });

    expect(first.handled).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);

    const failed = await prisma.emailNotification.findFirstOrThrow({
      where: { appointmentId: appointment.id, type: "CONFIRMATION" },
    });
    expect(failed.status).toBe("FAILED");
    expect(failed.retryCount).toBe(1);
    expect(failed.nextAttemptAt.toISOString()).toBe(new Date(NOW.getTime() + 5 * 60_000).toISOString());

    const retryAt = new Date(NOW.getTime() + 5 * 60_000);
    const second = await outboxScan({
      db: prisma,
      now: retryAt,
      sendEmail: send,
      paymentProviderFactory: () => fakeProvider(),
    });

    expect(second.handled).toBe(1);
    expect(send).toHaveBeenCalledTimes(2);

    const sent = await prisma.emailNotification.findFirstOrThrow({
      where: { appointmentId: appointment.id, type: "CONFIRMATION" },
    });
    expect(sent.status).toBe("SENT");
    expect(sent.sentAt?.toISOString()).toBe(retryAt.toISOString());
  });

  it("queues and sends each reminder at most once across repeated scans", async () => {
    const f = await createOnboardedShop(prisma, `reminder-${Date.now()}`);
    const appointment = await createBooking(prisma, { clientId: f.client.id, now: NOW }, { serviceId: f.service.id, barberId: f.barber.id, startsAt: SLOT });
    await prisma.appointment.update({ where: { id: appointment.id }, data: { status: "CONFIRMED" } });

    const send = vi.fn().mockResolvedValue({ id: "email_2" });
    const deps: WorkerDependencies = {
      db: prisma,
      now: new Date("2026-10-06T13:05:00.000Z"),
      sendEmail: send,
      paymentProviderFactory: () => fakeProvider(),
    };

    const first = await reminderScan(deps);
    const second = await reminderScan(deps);
    const outbox = await outboxScan(deps);

    expect(first.handled).toBe(1);
    expect(second.handled).toBe(0);
    expect(outbox.handled).toBe(2);
    expect(send).toHaveBeenCalledTimes(2);
    const reminders = await prisma.emailNotification.findMany({ where: { appointmentId: appointment.id, type: "REMINDER" } });
    expect(reminders).toHaveLength(1);
  });

  it("does not queue reminders for appointments whose start time has already passed", async () => {
    const f = await createOnboardedShop(prisma, `late-reminder-${Date.now()}`);
    const appointment = await createBooking(
      prisma,
      { clientId: f.client.id, now: NOW },
      { serviceId: f.service.id, barberId: f.barber.id, startsAt: SLOT },
    );

    await prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        status: "CONFIRMED",
        startsAt: new Date("2026-10-06T10:00:00.000Z"),
        endsAt: new Date("2026-10-06T10:30:00.000Z"),
      },
    });

    const result = await reminderScan({
      db: prisma,
      now: NOW,
      sendEmail: vi.fn(),
      paymentProviderFactory: () => fakeProvider(),
    });

    expect(result.handled).toBe(0);
    const reminders = await prisma.emailNotification.findMany({ where: { appointmentId: appointment.id, type: "REMINDER" } });
    expect(reminders).toHaveLength(0);
  });

  it("does not queue reminders for users who withdrew consent", async () => {
    const f = await createOnboardedShop(prisma, `withdrawn-reminder-${Date.now()}`);
    const appointment = await createBooking(
      prisma,
      { clientId: f.client.id, now: NOW },
      { serviceId: f.service.id, barberId: f.barber.id, startsAt: SLOT },
    );

    await prisma.user.update({
      where: { id: f.client.id },
      data: { consentWithdrawnAt: NOW },
    });
    await prisma.appointment.update({ where: { id: appointment.id }, data: { status: "CONFIRMED" } });

    const result = await reminderScan({
      db: prisma,
      now: new Date("2026-10-06T13:05:00.000Z"),
      sendEmail: vi.fn(),
      paymentProviderFactory: () => fakeProvider(),
    });

    expect(result.handled).toBe(0);
    const reminders = await prisma.emailNotification.findMany({ where: { appointmentId: appointment.id, type: "REMINDER" } });
    expect(reminders).toHaveLength(0);
  });

  it("suppresses already-queued reminders after consent withdrawal", async () => {
    const f = await createOnboardedShop(prisma, `withdrawn-outbox-${Date.now()}`);
    const appointment = await createBooking(
      prisma,
      { clientId: f.client.id, now: NOW },
      { serviceId: f.service.id, barberId: f.barber.id, startsAt: SLOT },
    );

    await prisma.appointment.update({ where: { id: appointment.id }, data: { status: "CONFIRMED" } });
    await prisma.emailNotification.create({
      data: {
        appointmentId: appointment.id,
        type: "REMINDER",
        status: "QUEUED",
        nextAttemptAt: NOW,
        payload: { appointmentId: appointment.id },
      },
    });
    await prisma.user.update({
      where: { id: f.client.id },
      data: { consentWithdrawnAt: NOW },
    });

    const send = vi.fn();
    const result = await outboxScan({
      db: prisma,
      now: NOW,
      sendEmail: send,
      paymentProviderFactory: () => fakeProvider(),
    });

    expect(result.handled).toBe(2);
    expect(send).toHaveBeenCalledTimes(1);
    const reminders = await prisma.emailNotification.findMany({ where: { appointmentId: appointment.id, type: "REMINDER" } });
    expect(reminders).toHaveLength(0);
  });

});
