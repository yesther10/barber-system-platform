/**
 * Unit tests for the route-level session guards (task 4.1/4.4). The edge
 * middleware (middleware-rules.ts) is the first line; these guards re-check
 * the session inside the route handler for defense-in-depth.
 */
import { describe, expect, it } from "vitest";
import { guardAdmin, guardBookingSession } from "./route-auth";

describe("guardAdmin", () => {
  it("passes a barbershop_admin session with a tenant", () => {
    const result = guardAdmin({ user: { id: "u1", role: "barbershop_admin", barbershopId: "bshp_1" } });
    expect(result).toEqual({ ok: true, barbershopId: "bshp_1" });
  });

  it("blocks anonymous, non-admin and tenant-less sessions", () => {
    expect(guardAdmin(null)).toEqual({ ok: false, status: 401, code: "SESSION_REQUIRED" });
    expect(guardAdmin({})).toEqual({ ok: false, status: 401, code: "SESSION_REQUIRED" });
    expect(guardAdmin({ user: { id: "u2", role: "client", barbershopId: null } })).toEqual({
      ok: false,
      status: 403,
      code: "FORBIDDEN_ROLE",
    });
    expect(guardAdmin({ user: { id: "u3", role: "barbershop_admin", barbershopId: null } })).toEqual({
      ok: false,
      status: 403,
      code: "TENANT_REQUIRED",
    });
  });
});

describe("guardBookingSession", () => {
  it("passes any authenticated session and returns the caller id", () => {
    expect(guardBookingSession({ user: { id: "u1", role: "client", barbershopId: null } })).toEqual({
      ok: true,
      clientId: "u1",
    });
  });

  it("blocks anonymous sessions with 401", () => {
    expect(guardBookingSession(null)).toEqual({ ok: false, status: 401, code: "SESSION_REQUIRED" });
    expect(guardBookingSession({})).toEqual({ ok: false, status: 401, code: "SESSION_REQUIRED" });
  });
});
