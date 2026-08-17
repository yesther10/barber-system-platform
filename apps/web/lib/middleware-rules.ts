/**
 * Middleware protection rules (user-auth spec, task 3.3).
 *
 * Pure decision function used by `middleware.ts` — kept free of Next/Auth
 * imports so the rules are unit-testable and the middleware stays thin.
 *
 * - `/api/admin/*` → requires role `barbershop_admin`, otherwise 403
 *   (an authenticated client calling an admin endpoint gets 403 and the
 *   operation never runs — spec "Admin-only operation").
 * - `/api/bookings*` → requires a session, otherwise 401
 *   (spec "Login Required to Book").
 * - Everything else is public.
 */
export type SessionLike = { role?: string } | null;

export type ProtectionDecision =
  | { kind: "pass" }
  | { kind: "block"; status: 401 | 403; code: "SESSION_REQUIRED" | "FORBIDDEN_ROLE" };

/** True when the path is an admin API route (exact or nested). */
export function isAdminPath(pathname: string): boolean {
  return pathname === "/api/admin" || pathname.startsWith("/api/admin/");
}

/** True when the path is a booking API route (create or lifecycle). */
export function isBookingPath(pathname: string): boolean {
  return pathname.startsWith("/api/bookings");
}

/** Returns the protection decision for a request path and session. */
export function decideProtection(pathname: string, session: SessionLike): ProtectionDecision {
  if (isAdminPath(pathname)) {
    if (session?.role !== "barbershop_admin") {
      return { kind: "block", status: 403, code: "FORBIDDEN_ROLE" };
    }
    return { kind: "pass" };
  }
  if (isBookingPath(pathname)) {
    if (!session?.role) {
      return { kind: "block", status: 401, code: "SESSION_REQUIRED" };
    }
    return { kind: "pass" };
  }
  return { kind: "pass" };
}
