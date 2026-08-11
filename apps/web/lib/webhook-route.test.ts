import { afterEach, describe, expect, it, vi } from "vitest";

describe("mercadopago webhook route", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns 401 for invalid signatures and skips payment mutation", async () => {
    const applyWebhookPayment = vi.fn();
    const resolveWebhookProvider = vi.fn().mockResolvedValue(null);

    vi.doMock("@/lib/db", () => ({ getPrisma: () => ({}) }));
    vi.doMock("@/lib/payments", () => ({ resolveWebhookProvider }));
    vi.doMock("@barber/payments", async () => {
      const actual = await vi.importActual<typeof import("@barber/payments")>("@barber/payments");
      return {
        ...actual,
        applyWebhookPayment,
      };
    });

    const { POST } = await import("../app/api/webhooks/mercadopago/route.js");
    const response = await POST(
      new Request("https://barber.test/api/webhooks/mercadopago?data.id=pay_1", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-signature": "ts=1,v1=invalid",
          "x-request-id": "req_1",
        },
        body: JSON.stringify({ id: "evt_1", data: { id: "pay_1" } }),
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "INVALID_SIGNATURE" });
    expect(resolveWebhookProvider).toHaveBeenCalledTimes(1);
    expect(applyWebhookPayment).not.toHaveBeenCalled();
  });
});
