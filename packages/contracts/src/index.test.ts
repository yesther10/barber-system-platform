import { describe, expect, it } from "vitest";
import { CONTRACT_VERSION, HealthResponse, okHealth } from "./index.js";

describe("contracts package", () => {
  it("exposes a pinned contract version", () => {
    expect(CONTRACT_VERSION).toBe("0.0.1");
  });

  it("builds a conformant health payload", () => {
    const payload = HealthResponse.safeParse(okHealth());
    expect(payload.success).toBe(true);
  });
});