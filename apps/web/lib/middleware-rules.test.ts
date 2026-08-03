import { describe, expect, it } from "vitest";
import { decideProtection } from "./middleware-rules.js";

describe("decideProtection", () => {
  it("allows barbershop_admin on /api/admin/* routes", () => {
    expect(decideProtection("/api/admin/barbers", { role: "barbershop_admin" })).toEqual({ kind: "pass" });
  });

  it("blocks a client role on /api/admin/* with 403 and performs nothing", () => {
    expect(decideProtection("/api/admin/services", { role: "client" })).toEqual({
      kind: "block",
      status: 403,
      code: "FORBIDDEN_ROLE",
    });
  });

  it("blocks an unauthenticated /api/admin/* call with 403 (no role)", () => {
    expect(decideProtection("/api/admin/services", null)).toEqual({
      kind: "block",
      status: 403,
      code: "FORBIDDEN_ROLE",
    });
  });

  it("rejects a booking request without a session with 401", () => {
    expect(decideProtection("/api/bookings", null)).toEqual({
      kind: "block",
      status: 401,
      code: "SESSION_REQUIRED",
    });
  });

  it("allows a booking request for any authenticated role", () => {
    expect(decideProtection("/api/bookings", { role: "client" })).toEqual({ kind: "pass" });
    expect(decideProtection("/api/bookings/abc/cancel", { role: "barber" })).toEqual({ kind: "pass" });
  });

  it("leaves public routes unprotected", () => {
    expect(decideProtection("/api/health", null)).toEqual({ kind: "pass" });
    expect(decideProtection("/api/public/barbershops/x/services", null)).toEqual({ kind: "pass" });
  });

  it("treats the exact /api/admin path as admin-protected", () => {
    expect(decideProtection("/api/admin", { role: "barbershop_admin" })).toEqual({ kind: "pass" });
    expect(decideProtection("/api/admin", { role: "barber" })).toEqual({
      kind: "block",
      status: 403,
      code: "FORBIDDEN_ROLE",
    });
  });
});
