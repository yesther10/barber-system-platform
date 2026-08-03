import { z } from "zod";

/** Appointment lifecycle — any other transition is rejected by domain rules. */
export const AppointmentStatus = z.enum([
  "pending",
  "confirmed",
  "completed",
  "cancelled",
]);

export type AppointmentStatus = z.infer<typeof AppointmentStatus>;

export const PaymentStatus = z.enum(["pending", "paid", "expired", "refunded"]);

export type PaymentStatus = z.infer<typeof PaymentStatus>;

/**
 * Booking creation payload. Barbershop comes from the session; the price and
 * duration are snapshotted server-side from the active service.
 */
export const CreateBookingInput = z.object({
  serviceId: z.string().min(1),
  barberId: z.string().min(1),
  startsAt: z.string().datetime(),
});

export type CreateBookingInput = z.infer<typeof CreateBookingInput>;

export const RescheduleInput = z.object({
  startsAt: z.string().datetime(),
});

export type RescheduleInput = z.infer<typeof RescheduleInput>;

export const CancelInput = z.object({
  reason: z.string().min(1).max(500).optional(),
});

export type CancelInput = z.infer<typeof CancelInput>;

/** Appointment as exposed to clients and admins (no internal columns). */
export const AppointmentView = z.object({
  id: z.string().min(1),
  barbershopId: z.string().min(1),
  barberId: z.string().min(1),
  clientId: z.string().min(1),
  serviceId: z.string().min(1),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  status: AppointmentStatus,
  priceSnapshot: z.number().nonnegative(),
  paymentStatus: PaymentStatus,
  noShowAt: z.string().datetime().nullable(),
  cancelReason: z.string().nullable(),
});

export type AppointmentView = z.infer<typeof AppointmentView>;

/** Public slot projection query — resolves the tenant by slug. */
export const SlotQuery = z.object({
  barbershopSlug: z.string().min(1),
  serviceId: z.string().min(1),
  barberId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type SlotQuery = z.infer<typeof SlotQuery>;

export const SlotGrid = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slots: z.array(z.string().datetime()),
});

export type SlotGrid = z.infer<typeof SlotGrid>;
