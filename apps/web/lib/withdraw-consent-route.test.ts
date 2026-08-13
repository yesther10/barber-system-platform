import { afterEach, describe, expect, it, vi } from "vitest";

describe("withdraw consent route", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("withdraws consent for the authenticated user", async () => {
    const withdrawConsent = vi.fn().mockResolvedValue({ userId: "usr_1", withdrawnAt: "2026-10-06T12:00:00.000Z" });

    vi.doMock("@/lib/auth", () => ({
      auth: vi.fn().mockResolvedValue({ user: { id: "usr_1", role: "client", barbershopId: "shop_1" } }),
    }));
    vi.doMock("@/lib/db", () => ({ getPrisma: () => ({}) }));
    vi.doMock("@/lib/route-auth", () => ({
      guardBookingSession: vi.fn().mockReturnValue({ ok: true, clientId: "usr_1" }),
    }));
    vi.doMock("@/lib/withdraw-consent", () => ({
      withdrawConsent,
      InvalidWithdrawalInputError: class InvalidWithdrawalInputError extends Error {
        code = "INVALID_INPUT" as const;
      },
    }));

    const { POST } = await import("../app/api/me/consent/withdraw/route.js");
    const response = await POST(
      new Request("https://barber.test/api/me/consent/withdraw", {
        method: "POST",
        body: JSON.stringify({ withdraw: true }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "withdrawn" });
    expect(withdrawConsent).toHaveBeenCalledWith({}, "usr_1", { withdraw: true });
  });

  it("rejects an invalid withdrawal payload with 400", async () => {
    const InvalidWithdrawalInputError = class InvalidWithdrawalInputError extends Error {
      code = "INVALID_INPUT" as const;
    };
    const withdrawConsent = vi.fn().mockRejectedValue(new InvalidWithdrawalInputError());

    vi.doMock("@/lib/auth", () => ({
      auth: vi.fn().mockResolvedValue({ user: { id: "usr_1", role: "client", barbershopId: "shop_1" } }),
    }));
    vi.doMock("@/lib/db", () => ({ getPrisma: () => ({}) }));
    vi.doMock("@/lib/route-auth", () => ({
      guardBookingSession: vi.fn().mockReturnValue({ ok: true, clientId: "usr_1" }),
    }));
    vi.doMock("@/lib/withdraw-consent", () => ({
      withdrawConsent,
      InvalidWithdrawalInputError,
    }));

    const { POST } = await import("../app/api/me/consent/withdraw/route.js");
    const response = await POST(
      new Request("https://barber.test/api/me/consent/withdraw", {
        method: "POST",
        body: JSON.stringify({ withdraw: false }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "INVALID_INPUT" });
    expect(withdrawConsent).toHaveBeenCalledWith({}, "usr_1", { withdraw: false });
  });
});
