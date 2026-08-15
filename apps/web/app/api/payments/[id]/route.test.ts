import { afterEach, describe, expect, it, vi } from "vitest";

describe("payment status route", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  function getStatus(id: string): Promise<Response> {
    return import("./route.js").then(({ GET }) =>
      GET(new Request(`https://barber.test/api/payments/${id}`), { params: Promise.resolve({ id }) }),
    );
  }

  it("returns the PaymentStatusView for the caller's appointment", async () => {
    const getPaymentStatusView = vi.fn().mockResolvedValue({
      appointmentId: "apt_1",
      paymentStatus: "paid",
      appointmentStatus: "confirmed",
    });
    vi.doMock("@/lib/auth", () => ({
      auth: vi.fn().mockResolvedValue({ user: { id: "usr_1", role: "client" } }),
    }));
    vi.doMock("@/lib/db", () => ({ getPrisma: () => ({}) }));
    vi.doMock("@/lib/payments", () => ({ getPaymentStatusView }));

    const response = await getStatus("provider_abc");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      appointmentId: "apt_1",
      paymentStatus: "paid",
      appointmentStatus: "confirmed",
    });
    expect(getPaymentStatusView).toHaveBeenCalledWith({}, "usr_1", "provider_abc");
  });

  it("returns 401 SESSION_REQUIRED without a session and never resolves status", async () => {
    const getPaymentStatusView = vi.fn();
    vi.doMock("@/lib/auth", () => ({ auth: vi.fn().mockResolvedValue(null) }));
    vi.doMock("@/lib/db", () => ({ getPrisma: () => ({}) }));
    vi.doMock("@/lib/payments", () => ({ getPaymentStatusView }));

    const response = await getStatus("apt_1");

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "SESSION_REQUIRED" });
    expect(getPaymentStatusView).not.toHaveBeenCalled();
  });

  it("returns 404 PAYMENT_APPOINTMENT_NOT_FOUND for unknown or foreign ids", async () => {
    const { PaymentAppointmentNotFoundError } = await import("@barber/payments");
    const getPaymentStatusView = vi.fn().mockRejectedValue(new PaymentAppointmentNotFoundError());
    vi.doMock("@/lib/auth", () => ({
      auth: vi.fn().mockResolvedValue({ user: { id: "usr_1", role: "client" } }),
    }));
    vi.doMock("@/lib/db", () => ({ getPrisma: () => ({}) }));
    vi.doMock("@/lib/payments", () => ({ getPaymentStatusView }));

    const response = await getStatus("nao-existe");

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "PAYMENT_APPOINTMENT_NOT_FOUND" });
  });
});