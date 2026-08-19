import { describe, expect, it } from "vitest";
import {
  DEFAULT_ADMIN_REDIRECT_PATH,
  DEFAULT_AUTH_REDIRECT_PATH,
  adminLoginPath,
  sanitizeNextPath,
} from "./auth-redirect";

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

describe("adminLoginPath", () => {
  it("wraps an internal admin path into a login next param", () => {
    expect(adminLoginPath("/services")).toBe("/login?next=%2Fservices");
    expect(adminLoginPath("/dashboard")).toBe("/login?next=%2Fdashboard");
  });

  it("falls back to /dashboard when the path header is absent", () => {
    expect(adminLoginPath(null)).toBe("/login?next=%2Fdashboard");
    expect(adminLoginPath(undefined)).toBe("/login?next=%2Fdashboard");
  });

  it("sanitizes external and protocol-relative paths to /dashboard", () => {
    expect(adminLoginPath("https://evil.example")).toBe("/login?next=%2Fdashboard");
    expect(adminLoginPath("//evil.example/path")).toBe("/login?next=%2Fdashboard");
  });

  it("preserves query strings and hashes in the next param", () => {
    expect(adminLoginPath("/services?page=2#horario")).toBe("/login?next=%2Fservices%3Fpage%3D2%23horario");
  });

  it("exposes the admin fallback constant", () => {
    expect(DEFAULT_ADMIN_REDIRECT_PATH).toBe("/dashboard");
  });
});
