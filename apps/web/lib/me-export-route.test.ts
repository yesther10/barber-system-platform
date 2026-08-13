import { afterEach, describe, expect, it, vi } from "vitest";

describe("me export route", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns the authenticated user's structured export", async () => {
    const exportPersonalData = vi.fn().mockResolvedValue({
      user: { id: "usr_1", email: "maria@example.com", name: "Maria", phone: null },
      appointments: [],
      consent: { acceptedAt: "2026-10-01T12:00:00.000Z", policyVersion: "2026-08-07" },
      generatedAt: "2026-10-06T12:00:00.000Z",
    });

    vi.doMock("@/lib/auth", () => ({
      auth: vi.fn().mockResolvedValue({ user: { id: "usr_1", role: "client", barbershopId: "shop_1" } }),
    }));
    vi.doMock("@/lib/db", () => ({ getPrisma: () => ({}) }));
    vi.doMock("@/lib/route-auth", () => ({
      guardBookingSession: vi.fn().mockReturnValue({ ok: true, clientId: "usr_1" }),
    }));
    vi.doMock("@/lib/me-privacy", () => ({
      exportPersonalData,
      PersonalDataNotFoundError: class PersonalDataNotFoundError extends Error {
        code = "USER_NOT_FOUND" as const;
      },
    }));

    const { POST } = await import("../app/api/me/export/route.js");
    const response = await POST(new Request("https://barber.test/api/me/export", { method: "POST" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      user: { id: "usr_1", email: "maria@example.com", name: "Maria", phone: null },
      appointments: [],
      consent: { acceptedAt: "2026-10-01T12:00:00.000Z", policyVersion: "2026-08-07" },
      generatedAt: "2026-10-06T12:00:00.000Z",
    });
    expect(exportPersonalData).toHaveBeenCalledWith({}, "usr_1");
  });

  it("returns 401 when the session is missing", async () => {
    const exportPersonalData = vi.fn();

    vi.doMock("@/lib/auth", () => ({ auth: vi.fn().mockResolvedValue(null) }));
    vi.doMock("@/lib/db", () => ({ getPrisma: () => ({}) }));
    vi.doMock("@/lib/route-auth", () => ({
      guardBookingSession: vi.fn().mockReturnValue({ ok: false, status: 401, code: "SESSION_REQUIRED" }),
    }));
    vi.doMock("@/lib/me-privacy", () => ({
      exportPersonalData,
      PersonalDataNotFoundError: class PersonalDataNotFoundError extends Error {
        code = "USER_NOT_FOUND" as const;
      },
    }));

    const { POST } = await import("../app/api/me/export/route.js");
    const response = await POST(new Request("https://barber.test/api/me/export", { method: "POST" }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "SESSION_REQUIRED" });
    expect(exportPersonalData).not.toHaveBeenCalled();
  });
});
