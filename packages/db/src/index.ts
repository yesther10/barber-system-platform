/**
 * @barber/db — data access for the barbershop platform.
 *
 * Holds the Prisma schema, migrations (including the btree_gist exclusion
 * constraint for slot-conflict prevention) and seed data. This package owns
 * the generated Prisma client and the factory that wires it to Postgres via
 * the Prisma 7 pg driver adapter. Tenant isolation is enforced at the query
 * layer by lib/tenant.ts (apps/web) injecting `where: { barbershopId }`.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { z } from "zod";
import { Prisma, PrismaClient } from "./generated/prisma/client.js";

export { Prisma, PrismaClient };
export type {
  Appointment,
  Barber,
  BarberService,
  Barbershop,
  EmailNotification,
  PaymentWebhookEvent,
  Schedule,
  ScheduleException,
  Service,
  User,
} from "./generated/prisma/client.js";
export {
  AppointmentStatus,
  ConfirmationMode,
  LateCancelPolicy,
  NotificationStatus,
  NotificationType,
  PaymentStatus,
  Role,
} from "./generated/prisma/enums.js";

/**
 * Creates a PrismaClient wired to Postgres through the pg driver adapter
 * (Prisma 7 no longer embeds a query engine — the adapter is mandatory).
 */
export function createClient(connectionString: string): PrismaClient {
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

/** How every tenant-scoped query MUST slice the dataset. */
export interface TenantScope {
  barbershopId: string;
}

/** Where builder entry point expressed as the shared isolation predicate. */
export const TENANT_SCOPE_FIELD = "barbershopId" as const;

/** Concrete type of a numeric id from the database (string until Prisma emits it). */
export const DatabaseId = z.string().min(1);

export type DatabaseId = z.infer<typeof DatabaseId>;

/**
 * Connectivity probe used by the Testcontainers smoke test. Returns true when
 * the Postgres client can reach the configured server.
 */
export async function pingDatabase(
  connect: () => Promise<{ query: (sql: string) => Promise<unknown>; end: () => Promise<void> }>,
): Promise<boolean> {
  let client: Awaited<ReturnType<typeof connect>>;
  try {
    client = await connect();
  } catch {
    return false;
  }
  try {
    await client.query("SELECT 1");
    return true;
  } finally {
    await client.end();
  }
}
