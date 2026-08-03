import { z } from "zod";
import { AppointmentStatus } from "./booking.js";

export type { AppointmentStatus } from "./booking.js";

/** Consent capture — only an explicit accept is accepted. */
export const ConsentInput = z.object({
  accepted: z.literal(true),
  policyVersion: z.string().min(1),
});

export type ConsentInput = z.infer<typeof ConsentInput>;

/** Stored consent record (timestamp + policy version) attached to the user. */
export const ConsentRecord = z.object({
  acceptedAt: z.string().datetime(),
  policyVersion: z.string().min(1),
});

export type ConsentRecord = z.infer<typeof ConsentRecord>;

/** Client data deletion — explicit confirmation required before anonymizing. */
export const DeletionRequest = z.object({
  confirm: z.literal(true),
});

export type DeletionRequest = z.infer<typeof DeletionRequest>;

/** Consent withdrawal — stops non-essential processing for the user. */
export const WithdrawalInput = z.object({
  withdraw: z.literal(true),
});

export type WithdrawalInput = z.infer<typeof WithdrawalInput>;

const ExportAppointment = z.object({
  id: z.string().min(1),
  barbershopId: z.string().min(1),
  serviceId: z.string().min(1),
  startsAt: z.string().datetime(),
  status: AppointmentStatus,
  priceSnapshot: z.number().nonnegative(),
});

/** Structured portable export of the client's PII and appointment history. */
export const ExportResponse = z.object({
  user: z.object({
    id: z.string().min(1),
    email: z.string().email(),
    name: z.string().min(1).nullable(),
    phone: z.string().min(1).nullable(),
  }),
  appointments: z.array(ExportAppointment),
  consent: ConsentRecord.nullable(),
  generatedAt: z.string().datetime(),
});

export type ExportResponse = z.infer<typeof ExportResponse>;
