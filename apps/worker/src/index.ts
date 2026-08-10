import { createClient, type PrismaClient } from "@barber/db";
import { NotificationStatus, NotificationType } from "@barber/db";
import { createMercadoPagoProvider, type PixProvider } from "@barber/payments";
import { Resend } from "resend";
import { buildNotificationEmail, computeRetryBackoff, DELIVERABLE_STATUSES, mapPaymentStatus, type EmailMessage } from "./notifications.js";

function hasWithdrawnConsent(user: { consentWithdrawnAt: Date | null }) {
  return user.consentWithdrawnAt !== null;
}

export interface ScanResult {
  scan: "outbox" | "reminder" | "payment-reconcile";
  handled: number;
  ranAt: Date;
}

export interface WorkerDependencies {
  db: PrismaClient;
  now?: Date;
  sendEmail: (message: EmailMessage) => Promise<{ id: string }>;
  paymentProviderFactory: (credentials: { accessToken: string; webhookSecret?: string | null }) => PixProvider;
}

async function loadAppointmentDetails(db: PrismaClient, appointmentId: string) {
  return db.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      barbershop: true,
      barber: { include: { user: true } },
      client: true,
      service: true,
    },
  });
}

export async function outboxScan(deps?: WorkerDependencies): Promise<ScanResult> {
  if (!deps) return { scan: "outbox", handled: 0, ranAt: new Date() };
  const now = deps.now ?? new Date();
  const rows = await deps.db.emailNotification.findMany({
    where: { status: { in: [...DELIVERABLE_STATUSES] }, nextAttemptAt: { lte: now } },
    orderBy: { createdAt: "asc" },
  });

  for (const row of rows) {
    const details = await loadAppointmentDetails(deps.db, row.appointmentId);
    if (!details?.client.email) continue;
    if (row.type === NotificationType.REMINDER && hasWithdrawnConsent(details.client)) {
      await deps.db.emailNotification.delete({ where: { id: row.id } });
      continue;
    }
    const email = buildNotificationEmail(row.type, {
      appointmentId: details.id,
      appointmentStatus: details.status.toLowerCase(),
      barberName: details.barber.user.name,
      clientEmail: details.client.email,
      clientName: details.client.name,
      paymentStatus: mapPaymentStatus(details.paymentStatus),
      serviceName: details.service.name,
      startsAt: details.startsAt,
      timezone: details.barbershop.timezone,
    });
    try {
      await deps.sendEmail({
        to: details.client.email,
        idempotencyKey: row.id,
        ...email,
      });
      await deps.db.emailNotification.update({
        where: { id: row.id },
        data: { status: NotificationStatus.SENT, sentAt: now },
      });
    } catch {
      await deps.db.emailNotification.update({
        where: { id: row.id },
        data: {
          status: NotificationStatus.FAILED,
          retryCount: { increment: 1 },
          nextAttemptAt: new Date(now.getTime() + computeRetryBackoff(row.retryCount)),
        },
      });
    }
  }

  return { scan: "outbox", handled: rows.length, ranAt: now };
}

export async function reminderScan(deps?: WorkerDependencies): Promise<ScanResult> {
  if (!deps) return { scan: "reminder", handled: 0, ranAt: new Date() };
  const now = deps.now ?? new Date();
  const appointments = await deps.db.appointment.findMany({
    where: { status: "CONFIRMED", startsAt: { gt: now } },
    include: { barbershop: true, client: true, notifications: { where: { type: NotificationType.REMINDER } } },
  });

  let handled = 0;
  for (const appointment of appointments) {
    const dueAt = appointment.startsAt.getTime() - appointment.barbershop.reminderLeadHours * 3_600_000;
    if (dueAt > now.getTime()) continue;
    if (appointment.notifications.length > 0) continue;
    if (hasWithdrawnConsent(appointment.client)) continue;
    await deps.db.emailNotification.create({
      data: {
        appointmentId: appointment.id,
        type: NotificationType.REMINDER,
        status: NotificationStatus.QUEUED,
        nextAttemptAt: now,
        payload: { appointmentId: appointment.id },
      },
    });
    handled += 1;
  }
  return { scan: "reminder", handled, ranAt: now };
}

export async function paymentReconcileScan(deps?: WorkerDependencies): Promise<ScanResult> {
  return { scan: "payment-reconcile", handled: 0, ranAt: deps?.now ?? new Date() };
}

export async function runCronCycle(deps?: WorkerDependencies): Promise<ScanResult[]> {
  return Promise.all([outboxScan(deps), reminderScan(deps), paymentReconcileScan(deps)]);
}

/** Schedule the cycle every `intervalMs`, flushing immediately on start. */
export function startCron(
  intervalMs: number,
  runner: () => Promise<ScanResult[]> = () => runCronCycle(),
  logger: Pick<Console, "log"> = console,
): () => void {
  void runner().then((results) => logger.log("[worker] tick", results));
  const timer = setInterval(() => {
    void runner().then((results) => logger.log("[worker] tick", results));
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}

export function defaultPaymentProviderFactory(credentials: { accessToken: string; webhookSecret?: string | null }) {
  return createMercadoPagoProvider(credentials);
}

export function createResendSender(apiKey: string, from: string) {
  const resend = new Resend(apiKey);
  return async (message: EmailMessage) => {
    const result = await resend.emails.send(
      {
        from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      },
      { idempotencyKey: message.idempotencyKey },
    );
    if (result.error) {
      throw new Error(result.error.message);
    }
    return { id: result.data?.id ?? message.idempotencyKey };
  };
}

function createDefaultWorkerDependencies(): WorkerDependencies {
  const databaseUrl = process.env.DATABASE_URL;
  const resendApiKey = process.env.RESEND_API_KEY;
  const resendFromEmail = process.env.RESEND_FROM_EMAIL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");
  if (!resendApiKey) throw new Error("RESEND_API_KEY is not set");
  if (!resendFromEmail) throw new Error("RESEND_FROM_EMAIL is not set");

  return {
    db: createClient(databaseUrl),
    sendEmail: createResendSender(resendApiKey, resendFromEmail),
    paymentProviderFactory: defaultPaymentProviderFactory,
  };
}

const CRON_INTERVAL_MS = 15 * 60 * 1000;

if (import.meta.url === `file://${process.argv[1]}`) {
  const deps = createDefaultWorkerDependencies();
  startCron(CRON_INTERVAL_MS, () => runCronCycle(deps));
}
