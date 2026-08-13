import type { PrismaClient } from "@barber/db";
import {
  AppointmentStatus,
  NotificationStatus,
  NotificationType,
  PaymentStatus,
  Prisma,
} from "@barber/db";
import type { PixPaymentView } from "@barber/contracts";
import type { PaymentRecord, PixProvider, VerifyWebhookInput } from "./index.js";

export class PaymentAppointmentNotFoundError extends Error {
  readonly code = "PAYMENT_APPOINTMENT_NOT_FOUND" as const;
}

export class PaymentConfigurationError extends Error {
  readonly code = "PAYMENT_CONFIGURATION_ERROR" as const;
}

export class InvalidPaymentWebhookSignatureError extends Error {
  readonly code = "INVALID_WEBHOOK_SIGNATURE" as const;
}

export class ManualPaymentAlreadyProcessedError extends Error {
  readonly code = "MANUAL_PAYMENT_ALREADY_PROCESSED" as const;
}

function toContractPaymentStatus(status: PaymentStatus): PixPaymentView["status"] {
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

function shouldAutoConfirm(mode: string): boolean {
  return mode === "AUTO";
}

async function queueConfirmation(tx: Prisma.TransactionClient, appointmentId: string, now: Date): Promise<void> {
  await tx.emailNotification.create({
    data: {
      appointmentId,
      type: NotificationType.CONFIRMATION,
      status: NotificationStatus.QUEUED,
      nextAttemptAt: now,
      payload: { appointmentId },
    },
  });
}

export async function createPixPayment(
  db: PrismaClient,
  provider: PixProvider,
  input: { appointmentId: string; clientId: string; notificationUrl?: string },
): Promise<PixPaymentView> {
  const appointment = await db.appointment.findFirst({
    where: { id: input.appointmentId, clientId: input.clientId },
    include: { client: true, service: true },
  });
  if (!appointment) throw new PaymentAppointmentNotFoundError();

  const payment = await provider.createPayment({
    appointmentId: appointment.id,
    amountBRL: Number(appointment.priceSnapshot),
    description: appointment.service.name,
    payerEmail: appointment.client.email,
    notificationUrl: input.notificationUrl,
  });

  await db.appointment.update({
    where: { id: appointment.id },
    data: {
      providerPaymentId: payment.providerId,
      paymentStatus: PaymentStatus.PENDING,
    },
  });

  return {
    id: payment.id,
    appointmentId: appointment.id,
    status: "pending",
    qrCode: payment.qrCode,
    expiresAt: payment.expiresAt ?? new Date(Date.now() + 30 * 60_000).toISOString(),
    providerPaymentId: payment.providerId,
  };
}

async function applyFetchedPayment(
  db: PrismaClient,
  payment: PaymentRecord,
  providerEventId: string,
  now: Date,
): Promise<{ duplicate: boolean; appointmentId: string | null }> {
  try {
    return await db.$transaction(async (tx) => {
      const appointment = await tx.appointment.findFirst({
        where: {
          OR: [{ providerPaymentId: payment.providerId }, { id: payment.appointmentId }],
        },
        include: { barbershop: true },
      });

      await tx.paymentWebhookEvent.create({
        data: {
          providerEventId,
          providerPaymentId: payment.providerId,
          appointmentId: appointment?.id ?? null,
          payload: payment.raw ?? payment,
          processedAt: now,
        },
      });

      if (!appointment) return { duplicate: false, appointmentId: null };

      if (payment.status === "approved") {
        const nextStatus = shouldAutoConfirm(appointment.barbershop.confirmationMode)
          ? AppointmentStatus.CONFIRMED
          : appointment.status;
        await tx.appointment.update({
          where: { id: appointment.id },
          data: {
            paymentStatus: PaymentStatus.PAID,
            providerPaymentId: payment.providerId,
            status: nextStatus,
          },
        });
        await queueConfirmation(tx, appointment.id, now);
      }

      if (payment.status === "expired") {
        await tx.appointment.update({
          where: { id: appointment.id },
          data: { paymentStatus: PaymentStatus.EXPIRED, providerPaymentId: payment.providerId },
        });
      }

      return { duplicate: false, appointmentId: appointment.id };
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { duplicate: true, appointmentId: payment.appointmentId || null };
    }
    throw error;
  }
}

export async function applyWebhookPayment(
  db: PrismaClient,
  provider: PixProvider,
  input: VerifyWebhookInput & { providerEventId: string; now?: Date },
): Promise<{ duplicate: boolean; appointmentId: string | null }> {
  const verified = await provider.verifyWebhook(input);
  if (!verified) {
    throw new InvalidPaymentWebhookSignatureError("Invalid webhook signature");
  }
  const payment = await provider.getPayment(input.dataId);
  return applyFetchedPayment(db, payment, input.providerEventId, input.now ?? new Date());
}

export async function markAppointmentPaidManually(
  db: PrismaClient,
  input: { appointmentId: string; barbershopId: string; now?: Date },
): Promise<{ id: string; status: string; paymentStatus: PixPaymentView["status"] }> {
  const appointment = await db.appointment.findFirst({
    where: { id: input.appointmentId, barbershopId: input.barbershopId },
    include: { barbershop: true },
  });
  if (!appointment) throw new PaymentAppointmentNotFoundError();
  if (appointment.paymentStatus === PaymentStatus.PAID) {
    throw new ManualPaymentAlreadyProcessedError();
  }

  const updated = await db.$transaction(async (tx) => {
    const nextStatus = shouldAutoConfirm(appointment.barbershop.confirmationMode)
      ? AppointmentStatus.CONFIRMED
      : appointment.status;
    const row = await tx.appointment.update({
      where: { id: appointment.id },
      data: { paymentStatus: PaymentStatus.PAID, status: nextStatus },
    });
    await queueConfirmation(tx, appointment.id, input.now ?? new Date());
    return row;
  });

  return {
    id: updated.id,
    status: updated.status.toLowerCase(),
    paymentStatus: toContractPaymentStatus(updated.paymentStatus),
  };
}

export async function reconcilePayment(
  db: PrismaClient,
  provider: PixProvider,
  input: { providerPaymentId: string; now?: Date },
): Promise<{ duplicate: boolean; appointmentId: string | null } | null> {
  const payment = await provider.getPayment(input.providerPaymentId);
  if (payment.status !== "approved") return null;
  return applyFetchedPayment(
    db,
    payment,
    `reconcile:${payment.providerId}:${payment.status}`,
    input.now ?? new Date(),
  );
}
