import { z } from "zod";

const yyyymmddPattern = /^\d{4}-\d{2}-\d{2}$/;

export const ReportGroupBy = z.enum(["barber", "service", "none"]);

export type ReportGroupBy = z.infer<typeof ReportGroupBy>;

/** Tenant-scoped report request over an inclusive date period. */
export const ReportQuery = z.object({
  from: z.string().regex(yyyymmddPattern, "Use YYYY-MM-DD"),
  to: z.string().regex(yyyymmddPattern, "Use YYYY-MM-DD"),
  groupBy: ReportGroupBy.default("none"),
  barberId: z.string().min(1).optional(),
  serviceId: z.string().min(1).optional(),
});

export type ReportQuery = z.infer<typeof ReportQuery>;

/** One group's counts and rates. Rates are fractions in [0, 1]. */
export const ReportRow = z.object({
  groupKey: z.string().min(1),
  total: z.number().int().nonnegative(),
  pending: z.number().int().nonnegative(),
  confirmed: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  cancelled: z.number().int().nonnegative(),
  completionRate: z.number().min(0).max(1),
  cancellationRate: z.number().min(0).max(1),
  revenueBRL: z.number().nonnegative(),
});

export type ReportRow = z.infer<typeof ReportRow>;

/** Empty periods yield an empty rows array (zeroed counts, no error). */
export const ReportResponse = z.object({
  from: z.string().regex(yyyymmddPattern, "Use YYYY-MM-DD"),
  to: z.string().regex(yyyymmddPattern, "Use YYYY-MM-DD"),
  rows: z.array(ReportRow),
});

export type ReportResponse = z.infer<typeof ReportResponse>;
