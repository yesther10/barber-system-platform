import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { GenericContainer } from "testcontainers";
import {
  AppointmentStatus,
  PaymentStatus,
  Role,
  createClient,
  type PrismaClient,
} from "../../../packages/db/src/index.js";
import { hashPassword } from "../lib/password.js";

const ROOT = resolve(process.cwd(), "../..");
const PORT = process.env.PORT ?? "3000";
const FIXTURE_PATH = "/tmp/opencode/barber-system-platform-e2e.json";
const SLOT = {
  date: "2026-10-07",
  startsAt: "2026-10-07T13:00:00.000Z",
};
const ADMIN_SLOT = {
  date: "2026-10-08",
  dayOfWeek: 4,
  startsAt: "2026-10-08T13:00:00.000Z",
};
const CONFLICT_SLOT = {
  startsAt: "2026-10-07T14:00:00.000Z",
};

function deployMigrations(connectionString: string) {
  execFileSync(resolve(ROOT, "packages/db/node_modules/.bin/prisma"), ["migrate", "deploy"], {
    cwd: resolve(ROOT, "packages/db"),
    env: { ...process.env, DATABASE_URL: connectionString },
    stdio: "pipe",
  });
}

async function seedE2EFixture(prisma: PrismaClient) {
  const now = new Date();
  const cancelableStartsAt = new Date(now.getTime() + 26 * 60 * 60 * 1000);
  const lateCancelStartsAt = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const clientPassword = "cliente-seguro-123";
  const clientHash = await hashPassword(clientPassword);
  const clientTwoPassword = "cliente-seguro-456";
  const clientTwoHash = await hashPassword(clientTwoPassword);
  const adminPassword = "admin-seguro-123";
  const adminHash = await hashPassword(adminPassword);

  await prisma.$transaction([
    prisma.paymentWebhookEvent.deleteMany(),
    prisma.emailNotification.deleteMany(),
    prisma.appointment.deleteMany(),
    prisma.scheduleException.deleteMany(),
    prisma.schedule.deleteMany(),
    prisma.barberService.deleteMany(),
    prisma.barber.deleteMany(),
    prisma.service.deleteMany(),
    prisma.user.deleteMany(),
    prisma.barbershop.deleteMany(),
  ]);

  const shop = await prisma.barbershop.create({
    data: {
      slug: "e2e-tesoura",
      name: "Tesoura E2E",
      timezone: "America/Sao_Paulo",
      confirmationMode: "AUTO",
      pixProvider: "mercado_pago",
      pixCredentials: { accessToken: "fake-e2e-token", webhookSecret: "fake-e2e-secret" },
      freeCancelWindowHours: 24,
      lateCancelPolicy: "REJECT",
      rescheduleWindowHours: 24,
    },
  });

  const barberUser = await prisma.user.create({
    data: {
      email: "barbeiro.e2e@example.com",
      name: "Carlos E2E",
      role: Role.BARBER,
      barbershopId: shop.id,
      consentAcceptedAt: new Date("2026-08-01T09:00:00.000Z"),
      consentPolicyVersion: "2026-07-31",
    },
  });

  const barberCandidateUser = await prisma.user.create({
    data: {
      email: "barbeiro.candidato.e2e@example.com",
      name: "Rafa E2E",
      role: Role.BARBER,
      barbershopId: shop.id,
      consentAcceptedAt: new Date("2026-08-01T09:00:00.000Z"),
      consentPolicyVersion: "2026-07-31",
    },
  });

  const admin = await prisma.user.create({
    data: {
      email: "admin.e2e@example.com",
      passwordHash: adminHash,
      name: "Alice Admin",
      role: Role.BARBERSHOP_ADMIN,
      barbershopId: shop.id,
      consentAcceptedAt: new Date("2026-08-01T09:00:00.000Z"),
      consentPolicyVersion: "2026-07-31",
    },
  });

  const client = await prisma.user.create({
    data: {
      email: "cliente.e2e@example.com",
      passwordHash: clientHash,
      name: "Maria E2E",
      role: Role.CLIENT,
      barbershopId: shop.id,
      consentAcceptedAt: new Date("2026-08-01T09:00:00.000Z"),
      consentPolicyVersion: "2026-07-31",
    },
  });

  const clientTwo = await prisma.user.create({
    data: {
      email: "cliente2.e2e@example.com",
      passwordHash: clientTwoHash,
      name: "João E2E",
      role: Role.CLIENT,
      barbershopId: shop.id,
      consentAcceptedAt: new Date("2026-08-01T09:00:00.000Z"),
      consentPolicyVersion: "2026-07-31",
    },
  });

  const barber = await prisma.barber.create({
    data: {
      barbershopId: shop.id,
      userId: barberUser.id,
      specialties: ["corte"],
    },
  });

  const service = await prisma.service.create({
    data: {
      barbershopId: shop.id,
      name: "Corte",
      priceBRL: 45,
      durationMinutes: 30,
    },
  });

  await prisma.barberService.create({ data: { barberId: barber.id, serviceId: service.id } });
  await prisma.schedule.create({
    data: {
      barberId: barber.id,
      dayOfWeek: 3,
      startTime: "09:00",
      endTime: "17:00",
    },
  });

  await prisma.appointment.create({
    data: {
      barbershopId: shop.id,
      barberId: barber.id,
      clientId: client.id,
      serviceId: service.id,
      startsAt: new Date(CONFLICT_SLOT.startsAt),
      endsAt: new Date(new Date(CONFLICT_SLOT.startsAt).getTime() + 30 * 60 * 1000),
      status: AppointmentStatus.CONFIRMED,
      priceSnapshot: 45,
      paymentStatus: PaymentStatus.PENDING,
    },
  });

  const cancelableAppointment = await prisma.appointment.create({
    data: {
      barbershopId: shop.id,
      barberId: barber.id,
      clientId: client.id,
      serviceId: service.id,
      startsAt: cancelableStartsAt,
      endsAt: new Date(cancelableStartsAt.getTime() + 30 * 60 * 1000),
      status: AppointmentStatus.CONFIRMED,
      priceSnapshot: 45,
      paymentStatus: PaymentStatus.PENDING,
    },
  });

  const lateCancelAppointment = await prisma.appointment.create({
    data: {
      barbershopId: shop.id,
      barberId: barber.id,
      clientId: client.id,
      serviceId: service.id,
      startsAt: lateCancelStartsAt,
      endsAt: new Date(lateCancelStartsAt.getTime() + 30 * 60 * 1000),
      status: AppointmentStatus.CONFIRMED,
      priceSnapshot: 45,
      paymentStatus: PaymentStatus.PENDING,
    },
  });

  mkdirSync(dirname(FIXTURE_PATH), { recursive: true });
  writeFileSync(
    FIXTURE_PATH,
    JSON.stringify(
      {
        shop: { slug: shop.slug, name: shop.name },
        barber: { id: barber.id },
        service: { id: service.id },
        admin: { email: admin.email, password: adminPassword },
        client: { email: client.email, password: clientPassword },
        clientTwo: { email: clientTwo.email, password: clientTwoPassword },
        barberCandidate: { userId: barberCandidateUser.id },
        slot: SLOT,
        adminSlot: ADMIN_SLOT,
        conflictSlot: CONFLICT_SLOT,
        appointments: {
          cancelableId: cancelableAppointment.id,
          lateCancelId: lateCancelAppointment.id,
        },
      },
      null,
      2,
    ),
  );
}

async function main() {
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
  deployMigrations(connectionString);

  const prisma = createClient(connectionString);
  await seedE2EFixture(prisma);

  const child = spawn(
    "pnpm",
    ["--filter", "@barber/web", "dev"],
    {
      cwd: ROOT,
      stdio: "inherit",
      env: {
        ...process.env,
        PORT,
        DATABASE_URL: connectionString,
        AUTH_SECRET: "barber-e2e-auth-secret",
        AUTH_TRUST_HOST: "true",
        BARBER_FAKE_PIX: "1",
      },
    },
  );

  let cleaningUp = false;
  const cleanup = async () => {
    if (cleaningUp) return;
    cleaningUp = true;
    child.kill("SIGTERM");
    await prisma.$disconnect().catch(() => undefined);
    await container.stop().catch(() => undefined);
    rmSync(FIXTURE_PATH, { force: true });
  };

  process.on("SIGINT", () => {
    void cleanup().finally(() => process.exit(130));
  });

  process.on("SIGTERM", () => {
    void cleanup().finally(() => process.exit(0));
  });

  child.on("exit", (code) => {
    void cleanup().finally(() => process.exit(code ?? 0));
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
