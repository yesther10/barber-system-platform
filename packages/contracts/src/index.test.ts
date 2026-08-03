import { describe, expect, it } from "vitest";
import { CONTRACT_VERSION, HealthResponse, RegisterInput, okHealth } from "./index.js";

describe("contracts package", () => {
  it("exposes a pinned contract version", () => {
    expect(CONTRACT_VERSION).toBe("0.0.1");
  });

  it("builds a conformant health payload", () => {
    const payload = HealthResponse.safeParse(okHealth());
    expect(payload.success).toBe(true);
  });

  it("re-exports every domain schema from the barrel", () => {
    const parsed = RegisterInput.safeParse({
      email: "maria@example.com",
      password: "s3nh4-segura",
      name: "Maria",
      consent: true,
      consentPolicyVersion: "2026-07-31",
    });
    expect(parsed.success).toBe(true);
  });
});