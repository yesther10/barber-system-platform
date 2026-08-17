import { describe, expect, it } from "vitest";
import { ManualPaymentInput, PaymentStatusView, PaymentWebhook, PixPaymentView, RefundInput } from "./payments.js";

describe("payments contracts", () => {
  it("parses a pix payment view with a QR payload", () => {
    const parsed = PixPaymentView.safeParse({
      id: "pay_1",
      appointmentId: "apt_1",
      status: "pending",
      qrCode: "00020126580014br.gov.bcb.pix0136abc...",
      expiresAt: "2026-08-10T14:59:00.000Z",
      providerPaymentId: null,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.status).toBe("pending");
  });

  it("rejects a pix payment with an unknown status", () => {
    expect(
      PixPaymentView.safeParse({
        id: "pay_1",
        appointmentId: "apt_1",
        status: "lost",
        qrCode: null,
        expiresAt: "2026-08-10T14:59:00.000Z",
        providerPaymentId: null,
      }).success,
    ).toBe(false);
  });

  it("parses manual payment and refund inputs", () => {
    expect(ManualPaymentInput.safeParse({ appointmentId: "apt_1" }).success).toBe(true);
    expect(RefundInput.safeParse({ appointmentId: "apt_1", reason: "Estorno" }).success).toBe(true);
  });

  it("parses a mercadopago webhook with provider ids and status", () => {
    const parsed = PaymentWebhook.safeParse({
      provider: "mercadopago",
      providerEventId: "evt_123",
      providerPaymentId: "pay_999",
      status: "paid",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.providerEventId).toBe("evt_123");
      expect(parsed.data.status).toBe("paid");
    }
  });

  it("rejects webhooks from unknown providers", () => {
    expect(
      PaymentWebhook.safeParse({
        provider: "pagseguro",
        providerEventId: "evt_1",
        providerPaymentId: "pay_1",
        status: "paid",
      }).success,
    ).toBe(false);
  });

  it("parses a payment status view with payment + appointment status", () => {
    const parsed = PaymentStatusView.safeParse({
      appointmentId: "apt_1",
      paymentStatus: "paid",
      appointmentStatus: "confirmed",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.appointmentId).toBe("apt_1");
      expect(parsed.data.paymentStatus).toBe("paid");
      expect(parsed.data.appointmentStatus).toBe("confirmed");
    }
  });

  it("rejects payment status views with unknown statuses", () => {
    expect(
      PaymentStatusView.safeParse({
        appointmentId: "apt_1",
        paymentStatus: "lost",
        appointmentStatus: "confirmed",
      }).success,
    ).toBe(false);
    expect(
      PaymentStatusView.safeParse({
        appointmentId: "apt_1",
        paymentStatus: "paid",
        appointmentStatus: "unknown",
      }).success,
    ).toBe(false);
  });
});
