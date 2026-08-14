/**
 * A/B tenant seed — dev/demo data and the fixture for the tenant-isolation
 * integration suite. Creates two tenants with distinct services, barbers,
 * schedules and one appointment each, so cross-tenant queries have real data
 * to leak and scoped queries have a real result set.
 *
 * Idempotent: wipes tenant-scoped tables first (safe for dev databases).
 * Run with `pnpm --filter @barber/db db:seed` (needs DATABASE_URL).
 */
import "dotenv/config";
import { pathToFileURL } from "node:url";
import { createClient } from "../src/index.js";
import type { PrismaClient } from "../src/index.js";

/**
 * Demo password for every seeded user: `Barberia2026!`.
 * Precomputed bcrypt hash (bcryptjs, cost 10, `$2b$` format — interoperable
 * with apps/web/lib/password.ts). Stored as a constant so packages/db does not
 * need a bcrypt dependency at seed time.
 */
const DEMO_PASSWORD_HASH =
  "$2b$10$NcbkV6qycx9bTrrVfEp/t.KucWZKISbeBXeDE6hooYLZDphPriJU6";

export interface SeedSummary {
  barbershopA: { id: string; slug: string };
  barbershopB: { id: string; slug: string };
  serviceA: { id: string };
  serviceB: { id: string };
  barberA: { id: string };
  barberB: { id: string };
  appointmentA: { id: string; barbershopId: string };
  appointmentB: { id: string; barbershopId: string };
}

export async function seedDatabase(prisma: PrismaClient): Promise<SeedSummary> {
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

  // --- Tenant A: Tesoura de Ouro ---
  const barbershopA = await prisma.barbershop.create({
    data: { slug: "tesoura-de-ouro", name: "Tesoura de Ouro", timezone: "America/Sao_Paulo" },
  });
  await prisma.user.create({
    data: {
      email: "admin@tesoura.example",
      name: "Admin Tesoura",
      role: "BARBERSHOP_ADMIN",
      barbershopId: barbershopA.id,
      passwordHash: DEMO_PASSWORD_HASH,
      consentAcceptedAt: new Date("2026-07-31T10:00:00.000Z"),
      consentPolicyVersion: "2026-07-31",
    },
  });
  const barberUserA = await prisma.user.create({
    data: {
      email: "barbeiro@tesoura.example",
      name: "Carlos Ferreira",
      role: "BARBER",
      barbershopId: barbershopA.id,
      passwordHash: DEMO_PASSWORD_HASH,
      consentAcceptedAt: new Date("2026-07-31T10:00:00.000Z"),
      consentPolicyVersion: "2026-07-31",
    },
  });
  const clientA = await prisma.user.create({
    data: {
      email: "cliente@tesoura.example",
      name: "Maria Silva",
      role: "CLIENT",
      barbershopId: barbershopA.id,
      passwordHash: DEMO_PASSWORD_HASH,
      consentAcceptedAt: new Date("2026-08-01T09:00:00.000Z"),
      consentPolicyVersion: "2026-07-31",
    },
  });
  const serviceA = await prisma.service.create({
    data: { barbershopId: barbershopA.id, name: "Corte", priceBRL: 45, durationMinutes: 30 },
  });
  const barberA = await prisma.barber.create({
    data: { barbershopId: barbershopA.id, userId: barberUserA.id, specialties: ["corte", "barba"] },
  });
  await prisma.barberService.create({ data: { barberId: barberA.id, serviceId: serviceA.id } });
  await prisma.schedule.create({
    data: { barberId: barberA.id, dayOfWeek: 2, startTime: "09:00", endTime: "18:00" },
  });
  const appointmentA = await prisma.appointment.create({
    data: {
      barbershopId: barbershopA.id,
      barberId: barberA.id,
      clientId: clientA.id,
      serviceId: serviceA.id,
      startsAt: new Date("2026-08-11T13:00:00.000Z"),
      endsAt: new Date("2026-08-11T13:30:00.000Z"),
      priceSnapshot: 45,
    },
  });

  // --- Tenant B: Barba & Navalha (distinct data) ---
  const barbershopB = await prisma.barbershop.create({
    data: { slug: "barba-e-navalha", name: "Barba & Navalha", timezone: "America/Sao_Paulo" },
  });
  const barberUserB = await prisma.user.create({
    data: {
      email: "barbeiro@navalha.example",
      name: "Renato Alves",
      role: "BARBER",
      barbershopId: barbershopB.id,
      passwordHash: DEMO_PASSWORD_HASH,
      consentAcceptedAt: new Date("2026-07-31T11:00:00.000Z"),
      consentPolicyVersion: "2026-07-31",
    },
  });
  const clientB = await prisma.user.create({
    data: {
      email: "cliente@navalha.example",
      name: "João Pereira",
      role: "CLIENT",
      barbershopId: barbershopB.id,
      passwordHash: DEMO_PASSWORD_HASH,
      consentAcceptedAt: new Date("2026-08-01T10:00:00.000Z"),
      consentPolicyVersion: "2026-07-31",
    },
  });
  const serviceB = await prisma.service.create({
    data: { barbershopId: barbershopB.id, name: "Corte Degradê", priceBRL: 60, durationMinutes: 40 },
  });
  const barberB = await prisma.barber.create({
    data: { barbershopId: barbershopB.id, userId: barberUserB.id, specialties: ["degrade"] },
  });
  await prisma.barberService.create({ data: { barberId: barberB.id, serviceId: serviceB.id } });
  await prisma.schedule.create({
    data: { barberId: barberB.id, dayOfWeek: 3, startTime: "10:00", endTime: "19:00" },
  });
  const appointmentB = await prisma.appointment.create({
    data: {
      barbershopId: barbershopB.id,
      barberId: barberB.id,
      clientId: clientB.id,
      serviceId: serviceB.id,
      startsAt: new Date("2026-08-12T14:00:00.000Z"),
      endsAt: new Date("2026-08-12T14:40:00.000Z"),
      priceSnapshot: 60,
    },
  });

  return {
    barbershopA: { id: barbershopA.id, slug: barbershopA.slug },
    barbershopB: { id: barbershopB.id, slug: barbershopB.slug },
    serviceA: { id: serviceA.id },
    serviceB: { id: serviceB.id },
    barberA: { id: barberA.id },
    barberB: { id: barberB.id },
    appointmentA: { id: appointmentA.id, barbershopId: appointmentA.barbershopId },
    appointmentB: { id: appointmentB.id, barbershopId: appointmentB.barbershopId },
  };
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required to seed");
  const prisma = createClient(url);
  try {
    const summary = await seedDatabase(prisma);
    console.log(
      `Seeded tenants: ${summary.barbershopA.slug} (A), ${summary.barbershopB.slug} (B)`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

// ESM main detection — importing `seedDatabase` (e.g. from integration tests)
// must not execute the CLI flow.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
