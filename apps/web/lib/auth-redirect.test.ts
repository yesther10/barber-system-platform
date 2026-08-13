import { describe, expect, it } from "vitest";
import { DEFAULT_AUTH_REDIRECT_PATH, sanitizeNextPath } from "./auth-redirect";

describe("sanitizeNextPath", () => {
  it("keeps safe internal paths, including query strings", () => {
    expect(sanitizeNextPath("/booking?service=corte")).toBe("/booking?service=corte");
    expect(sanitizeNextPath("/dashboard")).toBe("/dashboard");
  });

  it("rejects external or protocol-relative targets", () => {
    expect(sanitizeNextPath("https://evil.example")).toBe(DEFAULT_AUTH_REDIRECT_PATH);
    expect(sanitizeNextPath("//evil.example/path")).toBe(DEFAULT_AUTH_REDIRECT_PATH);
  });

  it("falls back to /booking for missing or malformed values", () => {
    expect(sanitizeNextPath(undefined)).toBe(DEFAULT_AUTH_REDIRECT_PATH);
    expect(sanitizeNextPath("booking")).toBe(DEFAULT_AUTH_REDIRECT_PATH);
    expect(sanitizeNextPath("   ")).toBe(DEFAULT_AUTH_REDIRECT_PATH);
  });
});
