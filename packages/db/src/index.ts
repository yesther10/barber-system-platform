/**
 * @barber/db — data access for the barbershop platform.
 *
 * Holds the Prisma schema, migrations (including the btree_gist exclusion
 * constraint for slot-conflict prevention) and seed data. Those are added in
 * the data-layer work unit. This bootstrap establishes the package, the
 * tenant-scoping posture helpers it will rely on, and a connectivity probe.
 */
import { z } from "zod";

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