import { describe, expect, it } from "vitest";
import {
  InviteAcceptInput,
  InviteInput,
  InviteToken,
  LoginInput,
  RegisterInput,
  RegisterResult,
  Role,
  SessionUser,
} from "./auth.js";

describe("auth contracts", () => {
  it("accepts a registration with explicit consent", () => {
    const parsed = RegisterInput.safeParse({
      email: "maria@example.com",
      password: "s3nh4-segura",
      name: "Maria Silva",
      consent: true,
      consentPolicyVersion: "2026-07-31",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.email).toBe("maria@example.com");
      expect(parsed.data.consent).toBe(true);
    }
  });

  it("rejects registration when consent is not given", () => {
    const parsed = RegisterInput.safeParse({
      email: "maria@example.com",
      password: "s3nh4-segura",
      name: "Maria Silva",
      consent: false,
      consentPolicyVersion: "2026-07-31",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects registration with an invalid email or weak password", () => {
    expect(
      RegisterInput.safeParse({
        email: "not-an-email",
        password: "s3nh4-segura",
        name: "Maria",
        consent: true,
        consentPolicyVersion: "2026-07-31",
      }).success,
    ).toBe(false);
    expect(
      RegisterInput.safeParse({
        email: "maria@example.com",
        password: "curta",
        name: "Maria",
        consent: true,
        consentPolicyVersion: "2026-07-31",
      }).success,
    ).toBe(false);
  });

  it("parses a session user with role and tenant", () => {
    const parsed = SessionUser.safeParse({
      id: "usr_123",
      email: "joao@example.com",
      name: "João",
      role: "barbershop_admin",
      barbershopId: "bshp_456",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.role).toBe("barbershop_admin");
  });

  it("accepts only the three known roles", () => {
    for (const role of ["client", "barber", "barbershop_admin"]) {
      expect(Role.safeParse(role).success).toBe(true);
    }
    expect(Role.safeParse("superuser").success).toBe(false);
  });

  it("parses login input and rejects empty passwords", () => {
    expect(
      LoginInput.safeParse({ email: "maria@example.com", password: "abc" }).success,
    ).toBe(true);
    expect(
      LoginInput.safeParse({ email: "maria@example.com", password: "" }).success,
    ).toBe(false);
  });

  it("parses a registration result scoped to the client role", () => {
    const parsed = RegisterResult.safeParse({
      id: "usr_1",
      email: "maria@example.com",
      role: "client",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.role).toBe("client");
  });

  it("parses a barber invite and rejects invalid tokens", () => {
    expect(InviteInput.safeParse({ email: "barbeiro@example.com" }).success).toBe(true);
    expect(InviteInput.safeParse({ email: "nope" }).success).toBe(false);
    expect(InviteToken.safeParse("a".repeat(24)).success).toBe(true);
    expect(InviteToken.safeParse("too-short").success).toBe(false);
  });

  it("parses an invite acceptance with explicit consent", () => {
    const parsed = InviteAcceptInput.safeParse({
      token: "a".repeat(64),
      name: "Carlos Ferreira",
      password: "s3nh4-segura",
      consent: true,
      consentPolicyVersion: "2026-07-31",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.token).toHaveLength(64);
  });

  it("rejects an invite acceptance without consent", () => {
    expect(
      InviteAcceptInput.safeParse({
        token: "a".repeat(64),
        name: "Carlos",
        password: "s3nh4-segura",
        consent: false,
        consentPolicyVersion: "2026-07-31",
      }).success,
    ).toBe(false);
  });
});
