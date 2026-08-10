import { MercadoPagoConfig, Payment } from "mercadopago";

export type PixProviderName = "mercadopago";

export interface CreatePaymentInput {
  appointmentId: string;
  amountBRL: number;
  description?: string;
  payerEmail: string;
  notificationUrl?: string;
}

export interface PaymentRecord {
  id: string;
  appointmentId: string;
  providerId: string;
  status: "pending" | "approved" | "expired" | "rejected";
  qrCode: string | null;
  qrCodeBase64: string | null;
  ticketUrl: string | null;
  expiresAt: string | null;
  raw?: unknown;
}

export interface VerifyWebhookInput {
  secret: string;
  xSignature: string;
  xRequestId: string;
  dataId: string;
}

export interface PixRefundResult {
  id: string;
  refunded: boolean;
}

export interface PixProvider {
  readonly name: PixProviderName;
  createPayment(input: CreatePaymentInput): Promise<PaymentRecord>;
  getPayment(providerId: string): Promise<PaymentRecord>;
  refund(providerId: string, amountBRL: number): Promise<PixRefundResult>;
  verifyWebhook(input: VerifyWebhookInput): Promise<boolean>;
}

export interface MercadoPagoCredentials {
  accessToken: string;
  webhookSecret?: string | null;
}

interface MercadoPagoPaymentClient {
  create(args: Record<string, unknown>): Promise<unknown>;
  get(args: Record<string, unknown>): Promise<unknown>;
  refund(args: Record<string, unknown>): Promise<unknown>;
}

export interface MercadoPagoDeps {
  createPaymentClient?: (client: MercadoPagoConfig) => MercadoPagoPaymentClient;
  validateWebhook?: (input: VerifyWebhookInput) => void;
}

export class InvalidWebhookSignatureError extends Error {}

function mapMercadoPagoStatus(status: unknown): PaymentRecord["status"] {
  switch (status) {
    case "approved":
      return "approved";
    case "cancelled":
    case "rejected":
      return "rejected";
    case "expired":
      return "expired";
    default:
      return "pending";
  }
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function toPaymentRecord(value: unknown): PaymentRecord {
  const row = asObject(value);
  const poi = asObject(row.point_of_interaction);
  const transactionData = asObject(poi.transaction_data);
  return {
    id: String(row.id ?? ""),
    appointmentId: String(row.external_reference ?? ""),
    providerId: String(row.id ?? ""),
    status: mapMercadoPagoStatus(row.status),
    qrCode: typeof transactionData.qr_code === "string" ? transactionData.qr_code : null,
    qrCodeBase64: typeof transactionData.qr_code_base64 === "string" ? transactionData.qr_code_base64 : null,
    ticketUrl: typeof transactionData.ticket_url === "string" ? transactionData.ticket_url : null,
    expiresAt: typeof row.date_of_expiration === "string" ? row.date_of_expiration : null,
    raw: value,
  };
}

function defaultValidateWebhook(input: VerifyWebhookInput): void {
  const [tsPart, signaturePart] = input.xSignature.split(",");
  const ts = tsPart?.split("=")[1];
  const signature = signaturePart?.split("=")[1];
  if (!ts || !signature || !input.secret || !input.xRequestId || !input.dataId) {
    throw new InvalidWebhookSignatureError("Missing Mercado Pago webhook signature fields");
  }
  const manifest = `id:${input.dataId};request-id:${input.xRequestId};ts:${ts};`;
  const expected = BunCrypto.hmac(input.secret, manifest);
  if (expected !== signature) {
    throw new InvalidWebhookSignatureError("Invalid Mercado Pago webhook signature");
  }
}

const BunCrypto = {
  hmac(secret: string, manifest: string): string {
    return createHmac("sha256", secret).update(manifest).digest("hex");
  },
};

import { createHmac } from "node:crypto";

export function parseMercadoPagoCredentials(value: unknown): MercadoPagoCredentials | null {
  const row = asObject(value);
  if (typeof row.accessToken !== "string" || row.accessToken.length === 0) return null;
  return {
    accessToken: row.accessToken,
    webhookSecret: typeof row.webhookSecret === "string" ? row.webhookSecret : null,
  };
}

export function createMercadoPagoProvider(
  credentials: MercadoPagoCredentials,
  deps: MercadoPagoDeps = {},
): PixProvider {
  const client = new MercadoPagoConfig({ accessToken: credentials.accessToken, options: { timeout: 5_000 } });
  const payment = (deps.createPaymentClient?.(client) ?? (new Payment(client) as unknown)) as MercadoPagoPaymentClient;
  const validateWebhook = deps.validateWebhook ?? defaultValidateWebhook;

  return {
    name: "mercadopago",
    async createPayment(input) {
      const response = await payment.create({
        body: {
          transaction_amount: input.amountBRL,
          description: input.description,
          payment_method_id: "pix",
          external_reference: input.appointmentId,
          notification_url: input.notificationUrl,
          payer: { email: input.payerEmail },
        },
      });
      return toPaymentRecord(response);
    },
    async getPayment(providerId) {
      const response = await payment.get({ id: providerId });
      return toPaymentRecord(response);
    },
    async refund(providerId, amountBRL) {
      const response = asObject(await payment.refund({ payment_id: providerId, body: { amount: amountBRL } }));
      return { id: String(response.id ?? providerId), refunded: true };
    },
    async verifyWebhook(input) {
      try {
        validateWebhook(input);
        return true;
      } catch (error) {
        if (error instanceof InvalidWebhookSignatureError) return false;
        if (error instanceof Error && error.name === "InvalidWebhookSignatureError") return false;
        throw error;
      }
    },
  };
}

export const PIX_PROVIDER_CONTRACT = "0.0.2" as const;

export * from "./service.js";
