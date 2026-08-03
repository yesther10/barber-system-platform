/**
 * Shared Prisma client for Next.js route handlers (node runtime).
 *
 * Cached on globalThis so dev HMR does not open a connection per request.
 * Never import this from edge code (middleware) — the MariaDB driver cannot
 * run in the edge runtime.
 */
import { createClient } from "@barber/db";
import type { PrismaClient } from "@barber/db";

const globalForPrisma = globalThis as unknown as {
  __barberPrisma?: PrismaClient;
};

export function getPrisma(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  if (!globalForPrisma.__barberPrisma) {
    globalForPrisma.__barberPrisma = createClient(url);
  }
  return globalForPrisma.__barberPrisma;
}
