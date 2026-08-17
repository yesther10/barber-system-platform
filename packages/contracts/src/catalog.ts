import { z } from "zod";

/** Slot grid granularity in minutes (catalog + tenant-management specs). */
export const SlotGranularity = z.union([z.literal(15), z.literal(30)]);

export type SlotGranularity = z.infer<typeof SlotGranularity>;

export const ConfirmationMode = z.enum(["auto", "manual"]);

export type ConfirmationMode = z.infer<typeof ConfirmationMode>;

export const LateCancelPolicy = z.enum(["reject", "allow"]);

export type LateCancelPolicy = z.infer<typeof LateCancelPolicy>;

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const hhmmPattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const yyyymmddPattern = /^\d{4}-\d{2}-\d{2}$/;

/** Barbershop onboarding input — per-tenant policies with platform defaults. */
export const BarbershopInput = z.object({
  name: z.string().min(1),
  slug: z.string().regex(slugPattern, "Slug must be lowercase kebab-case"),
  timezone: z.string().min(1),
  slotGranularity: SlotGranularity.default(30),
  confirmationMode: ConfirmationMode.default("auto"),
  freeCancelWindowHours: z.number().int().positive().default(24),
  lateCancelPolicy: LateCancelPolicy.default("reject"),
  rescheduleWindowHours: z.number().int().positive().default(24),
  reminderLeadHours: z.number().int().positive().default(24),
  pixProvider: z.string().min(1).nullable().optional(),
  pixCredentials: z.record(z.string(), z.unknown()).nullable().optional(),
});

export type BarbershopInput = z.infer<typeof BarbershopInput>;

/** Full barbershop entity returned to admins. */
export const BarbershopView = BarbershopInput.extend({
  id: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type BarbershopView = z.infer<typeof BarbershopView>;

/** Tenant-scoped service definition. Deactivation makes it unbookable. */
export const ServiceInput = z.object({
  name: z.string().min(1),
  description: z.string().min(1).optional(),
  priceBRL: z.number().nonnegative(),
  durationMinutes: z.number().int().positive(),
  active: z.boolean().default(true),
});

export type ServiceInput = z.infer<typeof ServiceInput>;

export const ServiceUpdate = ServiceInput.partial();

export type ServiceUpdate = z.infer<typeof ServiceUpdate>;

/** Barber profile — specialties power the service assignment lists. */
export const BarberInput = z.object({
  specialties: z.array(z.string().min(1)).min(1),
  bio: z.string().min(1).optional(),
  active: z.boolean().default(true),
});

export type BarberInput = z.infer<typeof BarberInput>;

/** Weekly recurring availability. dayOfWeek: 1=Monday … 7=Sunday. */
export const ScheduleInput = z.object({
  dayOfWeek: z.number().int().min(1).max(7),
  startTime: z.string().regex(hhmmPattern, "Use 24h HH:MM"),
  endTime: z.string().regex(hhmmPattern, "Use 24h HH:MM"),
});

export type ScheduleInput = z.infer<typeof ScheduleInput>;

/** One-off availability override (holiday / day off) for a single date. */
export const ScheduleExceptionInput = z.object({
  date: z.string().regex(yyyymmddPattern, "Use YYYY-MM-DD"),
  startTime: z.string().regex(hhmmPattern, "Use 24h HH:MM"),
  endTime: z.string().regex(hhmmPattern, "Use 24h HH:MM"),
  reason: z.string().min(1).optional(),
});

export type ScheduleExceptionInput = z.infer<typeof ScheduleExceptionInput>;
