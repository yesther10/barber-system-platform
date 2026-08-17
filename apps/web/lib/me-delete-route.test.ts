import { afterEach, describe, expect, it, vi } from "vitest";

describe("me delete route", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("anonymizes the authenticated user and cancels future appointments", async () => {
    const deletePersonalData = vi.fn().mockResolvedValue({
      userId: "usr_1",
      anonymizedEmail: "deleted+usr_1@deleted.local",
      cancelledAppointments: 1,
      deletedAt: "2026-10-06T12:00:00.000Z",
    });

    vi.doMock("@/lib/auth", () => ({
      auth: vi.fn().mockResolvedValue({ user: { id: "usr_1", role: "client", barbershopId: "shop_1" } }),
    }));
    vi.doMock("@/lib/db", () => ({ getPrisma: () => ({}) }));
    vi.doMock("@/lib/route-auth", () => ({
      guardBookingSession: vi.fn().mockReturnValue({ ok: true, clientId: "usr_1" }),
    }));
    vi.doMock("@/lib/me-privacy", () => ({
      deletePersonalData,
      InvalidDeletionRequestError: class InvalidDeletionRequestError extends Error {
        code = "INVALID_INPUT" as const;
      },
      PersonalDataNotFoundError: class PersonalDataNotFoundError extends Error {
        code = "USER_NOT_FOUND" as const;
      },
    }));

    const { DELETE } = await import("../app/api/me/route.js");
    const response = await DELETE(
      new Request("https://barber.test/api/me", {
        method: "DELETE",
        body: JSON.stringify({ confirm: true }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      userId: "usr_1",
      anonymizedEmail: "deleted+usr_1@deleted.local",
      cancelledAppointments: 1,
      deletedAt: "2026-10-06T12:00:00.000Z",
    });
    expect(deletePersonalData).toHaveBeenCalledWith({}, "usr_1", { confirm: true });
  });

  it("rejects an invalid deletion confirmation with 400", async () => {
    const InvalidDeletionRequestError = class InvalidDeletionRequestError extends Error {
      code = "INVALID_INPUT" as const;
    };
    const deletePersonalData = vi.fn().mockRejectedValue(new InvalidDeletionRequestError());

    vi.doMock("@/lib/auth", () => ({
      auth: vi.fn().mockResolvedValue({ user: { id: "usr_1", role: "client", barbershopId: "shop_1" } }),
    }));
    vi.doMock("@/lib/db", () => ({ getPrisma: () => ({}) }));
    vi.doMock("@/lib/route-auth", () => ({
      guardBookingSession: vi.fn().mockReturnValue({ ok: true, clientId: "usr_1" }),
    }));
    vi.doMock("@/lib/me-privacy", () => ({
      deletePersonalData,
      InvalidDeletionRequestError,
      PersonalDataNotFoundError: class PersonalDataNotFoundError extends Error {
        code = "USER_NOT_FOUND" as const;
      },
    }));

    const { DELETE } = await import("../app/api/me/route.js");
    const response = await DELETE(
      new Request("https://barber.test/api/me", {
        method: "DELETE",
        body: JSON.stringify({ confirm: false }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "INVALID_INPUT" });
    expect(deletePersonalData).toHaveBeenCalledWith({}, "usr_1", { confirm: false });
  });
});
