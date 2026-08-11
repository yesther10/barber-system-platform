import { NotificationStatus, NotificationType, PaymentStatus } from "@barber/db";

export interface NotificationEmailDetails {
  appointmentId: string;
  appointmentStatus: string;
  barberName: string | null;
  clientEmail: string;
  clientName: string | null;
  paymentStatus: "pending" | "paid" | "expired" | "refunded";
  serviceName: string;
  startsAt: Date;
  timezone: string;
}

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
}

function formatDate(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: timezone,
  }).format(date);
}

function paymentStatusPtBr(status: NotificationEmailDetails["paymentStatus"]): string {
  switch (status) {
    case "paid":
      return "Pago";
    case "expired":
      return "Expirado";
    case "refunded":
      return "Estornado";
    default:
      return "Pendente";
  }
}

function titleFor(type: keyof typeof NotificationType): string {
  switch (type) {
    case "REMINDER":
      return "Lembrete do seu horário";
    case "RESCHEDULE":
      return "Seu agendamento foi remarcado";
    case "CANCELLATION":
      return "Seu agendamento foi cancelado";
    default:
      return "Agendamento confirmado";
  }
}

export function buildNotificationEmail(
  type: keyof typeof NotificationType,
  details: NotificationEmailDetails,
): Omit<EmailMessage, "to" | "idempotencyKey"> {
  const when = formatDate(details.startsAt, details.timezone);
  const payment = paymentStatusPtBr(details.paymentStatus);
  const subject = `${titleFor(type)} · ${details.serviceName}`;
  const greeting = details.clientName ? `Olá, ${details.clientName}!` : "Olá!";
  const body = [
    greeting,
    titleFor(type),
    `Serviço: ${details.serviceName}`,
    `Barbeiro: ${details.barberName ?? "Equipe da barbearia"}`,
    `Data: ${when}`,
    `Pagamento: ${payment}`,
  ].join("\n");

  return {
    subject,
    text: body,
    html: `<p>${greeting}</p><p><strong>${titleFor(type)}</strong></p><ul><li>Serviço: ${details.serviceName}</li><li>Barbeiro: ${details.barberName ?? "Equipe da barbearia"}</li><li>Data: ${when}</li><li>Pagamento: ${payment}</li></ul>`,
  };
}

export function computeRetryBackoff(retryCount: number): number {
  if (retryCount >= 6) return 6 * 60 * 60_000;
  return 5 * 60_000 * 2 ** retryCount;
}

export function mapPaymentStatus(status: PaymentStatus): NotificationEmailDetails["paymentStatus"] {
  switch (status) {
    case PaymentStatus.PAID:
      return "paid";
    case PaymentStatus.EXPIRED:
      return "expired";
    case PaymentStatus.REFUNDED:
      return "refunded";
    default:
      return "pending";
  }
}

export const DELIVERABLE_STATUSES = [NotificationStatus.QUEUED, NotificationStatus.FAILED] as const;
