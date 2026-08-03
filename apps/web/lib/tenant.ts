/**
 * Tenant scoping helpers (tenant-management spec).
 *
 * Every tenant-scoped entity carries `barbershopId`; every query and write
 * MUST be scoped to the caller's tenant. `requireTenant` extracts the tenant
 * from the session context (throwing when absent) and `scope` builds the
 * `where` fragment to inject into every Prisma query. A scoped query for a
 * resource owned by another tenant matches nothing, which the API layer maps
 * to 404 — cross-tenant access never leaks data.
 */

export interface TenantContext {
  /** Tenant id attached to the session (may be null for clients/barbers without one). */
  barbershopId?: string | null;
}

/** Thrown when an operation requires a tenant context that is absent. */
export class TenantContextError extends Error {
  readonly code = "TENANT_REQUIRED" as const;

  constructor(message = "Tenant context is required") {
    super(message);
    this.name = "TenantContextError";
  }
}

/**
 * Returns the caller's tenant id or throws. Guards every tenant-scoped
 * operation: an empty or missing id must never produce an unbound query.
 */
export function requireTenant(context: TenantContext | null | undefined): string {
  const id = context?.barbershopId;
  if (!id) throw new TenantContextError();
  return id;
}

/** The `where` fragment every tenant-scoped query MUST inject. */
export interface TenantWhere {
  barbershopId: string;
}

/** Builds the tenant where-fragment for a Prisma query. */
export function scope(barbershopId: string): TenantWhere {
  if (!barbershopId) throw new TenantContextError();
  return { barbershopId };
}
