import { AppointmentStatus, PaymentStatus, type PrismaClient } from "@barber/db";
import { ReportQuery, ReportResponse, type ReportRow, type ReportResponse as ReportResponseType } from "@barber/contracts";
import { TenantNotFoundError } from "./onboarding";
import { zonedToUtc } from "./slots";

export class ReportInvalidInputError extends Error {
  readonly code = "INVALID_INPUT" as const;

  constructor(message = "Invalid reporting query") {
    super(message);
    this.name = "ReportInvalidInputError";
  }
}

function nextDateKey(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

function zeroRow(groupKey = "all"): ReportRow {
  return {
    groupKey,
    total: 0,
    pending: 0,
    confirmed: 0,
    completed: 0,
    cancelled: 0,
    completionRate: 0,
    cancellationRate: 0,
    revenueBRL: 0,
  };
}

function finalizeRow(row: ReportRow): ReportRow {
  return {
    ...row,
    completionRate: row.total === 0 ? 0 : row.completed / row.total,
    cancellationRate: row.total === 0 ? 0 : row.cancelled / row.total,
  };
}

function escapeCsv(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

function mapGroupKey(
  groupBy: "barber" | "service" | "none",
  appointment: { barber: { user: { name: string | null } }; service: { name: string } },
): string {
  if (groupBy === "barber") return appointment.barber.user.name ?? "Sem nome";
  if (groupBy === "service") return appointment.service.name;
  return "all";
}

export async function generateReport(
  db: PrismaClient,
  barbershopId: string,
  input: unknown,
): Promise<ReportResponseType> {
  const parsed = ReportQuery.safeParse(input);
  if (!parsed.success || parsed.data.from > parsed.data.to) {
    throw new ReportInvalidInputError();
  }

  const shop = await db.barbershop.findUnique({ where: { id: barbershopId }, select: { timezone: true } });
  if (!shop) throw new TenantNotFoundError();

  const fromUtc = zonedToUtc(parsed.data.from, "00:00", shop.timezone);
  const toExclusive = zonedToUtc(nextDateKey(parsed.data.to), "00:00", shop.timezone);
  const appointments = await db.appointment.findMany({
    where: {
      barbershopId,
      startsAt: { gte: fromUtc, lt: toExclusive },
      ...(parsed.data.barberId ? { barberId: parsed.data.barberId } : {}),
      ...(parsed.data.serviceId ? { serviceId: parsed.data.serviceId } : {}),
    },
    include: {
      barber: { include: { user: { select: { name: true } } } },
      service: { select: { name: true } },
    },
    orderBy: [{ startsAt: "asc" }],
  });

  const buckets = new Map<string, ReportRow>();
  for (const appointment of appointments) {
    const key = mapGroupKey(parsed.data.groupBy, appointment);
    const row = buckets.get(key) ?? zeroRow(key);
    row.total += 1;
    if (appointment.status === AppointmentStatus.PENDING) row.pending += 1;
    if (appointment.status === AppointmentStatus.CONFIRMED) row.confirmed += 1;
    if (appointment.status === AppointmentStatus.COMPLETED) row.completed += 1;
    if (appointment.status === AppointmentStatus.CANCELLED) row.cancelled += 1;
    if (appointment.paymentStatus === PaymentStatus.PAID) {
      row.revenueBRL += Number(appointment.priceSnapshot);
    }
    buckets.set(key, row);
  }

  const rows = (buckets.size === 0 ? [zeroRow()] : [...buckets.values()].map(finalizeRow)).sort((a, b) =>
    a.groupKey.localeCompare(b.groupKey, "pt-BR"),
  );

  return ReportResponse.parse({
    from: parsed.data.from,
    to: parsed.data.to,
    rows,
  });
}

export function renderReportCsv(report: ReportResponseType): string {
  const header = [
    "groupKey",
    "total",
    "pending",
    "confirmed",
    "completed",
    "cancelled",
    "completionRate",
    "cancellationRate",
    "revenueBRL",
  ].join(",");
  const lines = report.rows.map((row) =>
    [
      escapeCsv(row.groupKey),
      row.total,
      row.pending,
      row.confirmed,
      row.completed,
      row.cancelled,
      row.completionRate.toFixed(2),
      row.cancellationRate.toFixed(2),
      row.revenueBRL.toFixed(2),
    ].join(","),
  );
  return `\uFEFF${[header, ...lines].join("\n")}\n`;
}
