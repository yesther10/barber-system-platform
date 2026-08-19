/**
 * Route-level session guards (defense-in-depth; the edge middleware already
 * blocks unauthenticated/unprivileged callers). Kept free of Next/Auth
 * imports so the decision logic is unit-testable and routes stay thin.
 */
export interface RouteSessionLike {
  user?: { id?: string; role?: string; barbershopId?: string | null } | null;
}

export type GuardResult =
  | { ok: true; barbershopId: string }
  | { ok: false; status: 401 | 403; code: string };

/**
 * Admin guard: session present, role `barbershop_admin`, and a tenant id.
 * Any miss returns the status/code the route maps to a JSON error.
 */
export function guardAdmin(session: RouteSessionLike | null): GuardResult {
  if (!session?.user) return { ok: false, status: 401, code: "SESSION_REQUIRED" };
  if (session.user.role !== "barbershop_admin") {
    return { ok: false, status: 403, code: "FORBIDDEN_ROLE" };
  }
  if (!session.user.barbershopId) {
    return { ok: false, status: 403, code: "TENANT_REQUIRED" };
  }
  return { ok: true, barbershopId: session.user.barbershopId };
}

export type BookingGuardResult =
  | { ok: true; clientId: string }
  | { ok: false; status: 401; code: string };

/** Booking guard: any authenticated session may book (login is required). */
export function guardBookingSession(session: RouteSessionLike | null): BookingGuardResult {
  if (!session?.user?.id) return { ok: false, status: 401, code: "SESSION_REQUIRED" };
  return { ok: true, clientId: session.user.id };
}

export type PageGuardResult =
  | { ok: true; barbershopId: string }
  | { ok: false; redirectTo: string };

/**
 * Admin page guard (design D1): the `(admin)/layout.tsx` enforcement point.
 * Mirrors `guardAdmin` but returns the page redirect target instead of an API
 * status/code — missing session → login; wrong role or no tenant → home.
 */
export function requireAdminPage(session: RouteSessionLike | null): PageGuardResult {
  if (!session?.user) return { ok: false, redirectTo: "/login" };
  if (session.user.role !== "barbershop_admin") return { ok: false, redirectTo: "/" };
  if (!session.user.barbershopId) return { ok: false, redirectTo: "/" };
  return { ok: true, barbershopId: session.user.barbershopId };
}
