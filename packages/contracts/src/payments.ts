import { z } from "zod";
import { PaymentStatus } from "./booking.js";

export type { PaymentStatus } from "./booking.js";

/** Pix payment returned for display (QR payload) on the client. */
export const PixPaymentView = z.object({
  id: z.string().min(1),
  appointmentId: z.string().min(1),
  status: PaymentStatus,
  qrCode: z.string().min(1).nullable(),
  expiresAt: z.string().datetime(),
  providerPaymentId: z.string().min(1).nullable(),
});

export type PixPaymentView = z.infer<typeof PixPaymentView>;

/** Admin records an in-shop Pix payment (manual fallback). */
export const ManualPaymentInput = z.object({
  appointmentId: z.string().min(1),
});

export type ManualPaymentInput = z.infer<typeof ManualPaymentInput>;

export const RefundInput = z.object({
  appointmentId: z.string().min(1),
  reason: z.string().min(1).optional(),
});

export type RefundInput = z.infer<typeof RefundInput>;

/**
 * Provider webhook payload after HMAC verification. `providerEventId` is the
 * idempotency key — a duplicate delivery MUST NOT change state.
 */
export const PaymentWebhook = z.object({
  provider: z.literal("mercadopago"),
  providerEventId: z.string().min(1),
  providerPaymentId: z.string().min(1),
  status: PaymentStatus,
  rawPayload: z.unknown().optional(),
});

export type PaymentWebhook = z.infer<typeof PaymentWebhook>;
