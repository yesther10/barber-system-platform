import { describe, expect, it, vi } from "vitest";
import {
  ConsentRequiredError,
  EmailAlreadyRegisteredError,
  InvalidInputError,
  registerClient,
} from "./register.js";

function fakeStore(existingByEmail: Record<string, { id: string }> = {}) {
  const created: unknown[] = [];
  const store = {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { email: string } }) => existingByEmail[where.email] ?? null),
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        created.push(args.data);
        return { id: "usr_new", email: String(args.data.email) };
      }),
    },
  };
  return { store, created };
}

const validInput = {
  email: "maria@example.com",
  password: "s3nh4-segura",
  name: "Maria Silva",
  consent: true,
  consentPolicyVersion: "2026-07-31",
};

describe("registerClient", () => {
  it("refuses registration without consent and creates no account", async () => {
    const { store, created } = fakeStore();
    const withoutConsent = { ...validInput, consent: false };

    await expect(registerClient(store, withoutConsent)).rejects.toThrow(ConsentRequiredError);
    expect(created).toHaveLength(0);
    expect(store.user.create).not.toHaveBeenCalled();
  });

  it("refuses an invalid email and creates no account", async () => {
    const { store, created } = fakeStore();
    await expect(registerClient(store, { ...validInput, email: "nope" })).rejects.toThrow(InvalidInputError);
    expect(created).toHaveLength(0);
  });

  it("creates a client account with hashed password and consent record", async () => {
    const { store, created } = fakeStore();
    const now = new Date("2026-08-03T12:00:00.000Z");

    const result = await registerClient(store, validInput, now);

    expect(result).toEqual({ id: "usr_new", email: "maria@example.com", role: "client" });
    const data = created[0] as Record<string, unknown>;
    expect(data).toMatchObject({
      email: "maria@example.com",
      name: "Maria Silva",
      role: "CLIENT",
      consentAcceptedAt: now,
      consentPolicyVersion: "2026-07-31",
    });
    expect(String(data.passwordHash)).not.toContain("s3nh4-segura");
    expect(String(data.passwordHash)).toMatch(/^\$2[aby]\$\d{2}\$/);
  });

  it("rejects a registration for an already-registered email", async () => {
    const { store, created } = fakeStore({ "maria@example.com": { id: "usr_existing" } });
    await expect(registerClient(store, validInput)).rejects.toThrow(EmailAlreadyRegisteredError);
    expect(created).toHaveLength(0);
  });

  it("stores the phone when provided", async () => {
    const { store, created } = fakeStore();
    await registerClient(store, { ...validInput, phone: "+55 11 99999-9999" });
    const data = created[0] as Record<string, unknown>;
    expect(data.phone).toBe("+55 11 99999-9999");
  });
});
