/**
 * @barber/payments — provider-agnostic Pix payments boundary.
 *
 * Defines the PixProvider interface (createPayment / getPayment / refund /
 * verifyWebhook) that the Mercado Pago adapter implements in the payments work
 * unit. This layer keeps provider choice swappable (design decision #1) so
 * migration to another provider never leaks into booking or worker code.
 * Package scaffold only at bootstrap time.
 */

export type PixProviderName = "mercadopago";

export interface CreatePaymentInput {
  appointmentId: string;
  amountBRL: number;
  description?: string;
}

export interface PaymentStatus {
  id: string;
  providerId: string;
  status: "pending" | "approved" | "expired" | "rejected";
}

export interface PixRefundResult {
  id: string;
  refunded: boolean;
}

export interface PixProvider {
  readonly name: PixProviderName;
  createPayment(input: CreatePaymentInput): Promise<PaymentStatus>;
  getPayment(providerId: string): Promise<PaymentStatus>;
  refund(providerId: string, amountBRL: number): Promise<PixRefundResult>;
  verifyWebhook(signature: string, rawBody: string, secret: string): Promise<boolean>;
}

export const PIX_PROVIDER_CONTRACT = "0.0.1" as const;