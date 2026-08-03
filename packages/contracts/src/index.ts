/**
 * @barber/contracts — shared Zod contracts for the barbershop platform.
 *
 * This package is the single source of truth for request/response shapes,
 * validated at the API edge and later reused by native apps. Domain schemas
 * are grouped per domain and re-exported here.
 */
import { z } from "zod";

/** Bumped whenever the public contract surface changes incompatibly. */
export const CONTRACT_VERSION = "0.0.1" as const;

/** Health envelope returned by `/api/health` on the web app. */
export const HealthResponse = z.object({
  ok: z.literal(true),
  version: z.string(),
  time: z.string().datetime(),
});

export type HealthResponse = z.infer<typeof HealthResponse>;

export function okHealth(): HealthResponse {
  return {
    ok: true,
    version: CONTRACT_VERSION,
    time: new Date().toISOString(),
  };
}

export * from "./auth.js";
export * from "./booking.js";
export * from "./catalog.js";
export * from "./lgpd.js";
export * from "./payments.js";
export * from "./reporting.js";