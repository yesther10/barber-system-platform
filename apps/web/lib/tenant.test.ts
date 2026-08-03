import { describe, expect, it } from "vitest";
import { TenantContextError, requireTenant, scope } from "./tenant.js";

describe("requireTenant", () => {
  it("returns the tenant id from the session context", () => {
    expect(requireTenant({ barbershopId: "bshp_a" })).toBe("bshp_a");
  });

  it("throws when no tenant is present", () => {
    expect(() => requireTenant({})).toThrow(TenantContextError);
    expect(() => requireTenant(null)).toThrow(TenantContextError);
    expect(() => requireTenant(undefined)).toThrow(TenantContextError);
  });

  it("throws on an empty tenant id instead of leaking an unbound query", () => {
    expect(() => requireTenant({ barbershopId: "" })).toThrow(TenantContextError);
  });

  it("marks the error with a stable TENANT_REQUIRED code for API mapping", () => {
    try {
      requireTenant({});
    } catch (err) {
      expect(err).toBeInstanceOf(TenantContextError);
      expect((err as TenantContextError).code).toBe("TENANT_REQUIRED");
    }
  });
});

describe("scope", () => {
  it("builds the barbershopId where-fragment for queries", () => {
    expect(scope("bshp_a")).toEqual({ barbershopId: "bshp_a" });
  });

  it("rejects an empty tenant id", () => {
    expect(() => scope("")).toThrow(TenantContextError);
  });

  it("scopes by the tenant returned from requireTenant", () => {
    const tenantId = requireTenant({ barbershopId: "bshp_b" });
    expect({ ...scope(tenantId) }).toEqual({ barbershopId: "bshp_b" });
  });
});
