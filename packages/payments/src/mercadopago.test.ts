import { describe, expect, it, vi } from "vitest";
import {
  InvalidWebhookSignatureError,
  createMercadoPagoProvider,
  type MercadoPagoDeps,
} from "./index.js";

describe("Mercado Pago Pix provider", () => {
  function createDeps(): MercadoPagoDeps {
    return {
      createPaymentClient: () => ({
        create: vi.fn().mockResolvedValue({
          id: 123,
          status: "pending",
          external_reference: "apt_123",
          date_of_expiration: "2026-10-07T15:30:00.000Z",
          point_of_interaction: {
            transaction_data: {
              qr_code: "000201pix",
              qr_code_base64: "base64-qr",
              ticket_url: "https://mp.test/ticket",
            },
          },
        }),
        get: vi.fn().mockResolvedValue({
          id: 123,
          status: "approved",
          external_reference: "apt_123",
          date_of_expiration: "2026-10-07T15:30:00.000Z",
          point_of_interaction: {
            transaction_data: {
              qr_code: "000201pix",
              qr_code_base64: "base64-qr",
              ticket_url: "https://mp.test/ticket",
            },
          },
        }),
        refund: vi.fn().mockResolvedValue({ id: 123 }),
      }),
      validateWebhook: vi.fn(),
    };
  }

  it("creates a Pix payment and maps Mercado Pago fields to the provider contract", async () => {
    const deps = createDeps();
    const provider = createMercadoPagoProvider({ accessToken: "token" }, deps);

    const payment = await provider.createPayment({
      appointmentId: "apt_123",
      amountBRL: 45,
      description: "Corte + barba",
      payerEmail: "cliente@example.com",
      notificationUrl: "https://barber.test/api/webhooks/mercadopago",
    });

    expect(payment).toMatchObject({
      id: "123",
      appointmentId: "apt_123",
      providerId: "123",
      status: "pending",
      qrCode: "000201pix",
      qrCodeBase64: "base64-qr",
      ticketUrl: "https://mp.test/ticket",
    });
    expect(payment.expiresAt).toBe("2026-10-07T15:30:00.000Z");
  });

  it("fetches a payment by id and preserves the appointment reference", async () => {
    const deps = createDeps();
    const provider = createMercadoPagoProvider({ accessToken: "token" }, deps);

    const payment = await provider.getPayment("123");

    expect(payment.status).toBe("approved");
    expect(payment.appointmentId).toBe("apt_123");
    expect(payment.providerId).toBe("123");
  });

  it("verifies webhooks with the Mercado Pago signature manifest", async () => {
    const validateWebhook = vi.fn();
    const provider = createMercadoPagoProvider(
      { accessToken: "token" },
      { createPaymentClient: createDeps().createPaymentClient, validateWebhook },
    );

    await expect(
      provider.verifyWebhook({
        secret: "secret",
        xRequestId: "req_123",
        xSignature: "ts=1704908010,v1=abc",
        dataId: "123",
      }),
    ).resolves.toBe(true);

    expect(validateWebhook).toHaveBeenCalledWith({
      xSignature: "ts=1704908010,v1=abc",
      xRequestId: "req_123",
      dataId: "123",
      secret: "secret",
    });
  });

  it("returns false for invalid webhook signatures", async () => {
    const provider = createMercadoPagoProvider(
      { accessToken: "token" },
      {
        createPaymentClient: createDeps().createPaymentClient,
        validateWebhook: vi.fn().mockImplementation(() => {
          throw new InvalidWebhookSignatureError("invalid");
        }),
      },
    );

    await expect(
      provider.verifyWebhook({
        secret: "secret",
        xRequestId: "req_123",
        xSignature: "ts=1704908010,v1=abc",
        dataId: "123",
      }),
    ).resolves.toBe(false);
  });
});
