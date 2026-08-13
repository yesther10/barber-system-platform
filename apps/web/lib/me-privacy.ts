import { AppointmentStatus, NotificationStatus, type PrismaClient } from "@barber/db";
import { DeletionRequest, ExportResponse } from "@barber/contracts";
import { mapAppointmentStatusToContract } from "./booking";

export class PersonalDataNotFoundError extends Error {
  readonly code = "USER_NOT_FOUND" as const;

  constructor(message = "User not found") {
    super(message);
    this.name = "PersonalDataNotFoundError";
  }
}

export class InvalidDeletionRequestError extends Error {
  readonly code = "INVALID_INPUT" as const;

  constructor(message = "Invalid deletion request payload") {
    super(message);
    this.name = "InvalidDeletionRequestError";
  }
}

export function anonymizedEmailFor(userId: string): string {
  return `deleted+${userId}@deleted.local`;
}

function toConsentRecord(user: {
  consentAcceptedAt: Date | null;
  consentPolicyVersion: string | null;
}) {
  if (!user.consentAcceptedAt || !user.consentPolicyVersion) {
    return null;
  }

  return {
    acceptedAt: user.consentAcceptedAt.toISOString(),
    policyVersion: user.consentPolicyVersion,
  };
}

export async function exportPersonalData(db: PrismaClient, userId: string, now: Date = new Date()) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      phone: true,
      consentAcceptedAt: true,
      consentPolicyVersion: true,
    },
  });

  if (!user) throw new PersonalDataNotFoundError();

  const appointments = await db.appointment.findMany({
    where: { clientId: userId },
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      barbershopId: true,
      serviceId: true,
      startsAt: true,
      status: true,
      priceSnapshot: true,
    },
  });

  return ExportResponse.parse({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
    },
    appointments: appointments.map((appointment) => ({
      id: appointment.id,
      barbershopId: appointment.barbershopId,
      serviceId: appointment.serviceId,
      startsAt: appointment.startsAt.toISOString(),
      status: mapAppointmentStatusToContract(appointment.status),
      priceSnapshot: Number(appointment.priceSnapshot),
    })),
    consent: toConsentRecord(user),
    generatedAt: now.toISOString(),
  });
}

export async function deletePersonalData(
  db: PrismaClient,
  userId: string,
  input: unknown,
  now: Date = new Date(),
) {
  const parsed = DeletionRequest.safeParse(input);
  if (!parsed.success) throw new InvalidDeletionRequestError();

  const existing = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!existing) throw new PersonalDataNotFoundError();

  const result = await db.$transaction(async (tx) => {
    const appointments = await tx.appointment.findMany({
      where: { clientId: userId },
      select: { id: true },
    });

    if (appointments.length > 0) {
      await tx.emailNotification.deleteMany({
        where: {
          appointmentId: { in: appointments.map((appointment) => appointment.id) },
          status: { in: [NotificationStatus.QUEUED, NotificationStatus.FAILED] },
        },
      });
    }

    const cancelled = await tx.appointment.updateMany({
      where: {
        clientId: userId,
        startsAt: { gt: now },
        status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] },
      },
      data: {
        status: AppointmentStatus.CANCELLED,
        cancelReason: "LGPD account deletion request",
      },
    });

    await tx.user.update({
      where: { id: userId },
      data: {
        email: anonymizedEmailFor(userId),
        name: null,
        phone: null,
        passwordHash: null,
        consentAcceptedAt: null,
        consentPolicyVersion: null,
        consentWithdrawnAt: now,
      },
    });

    return { cancelledAppointments: cancelled.count };
  });

  return {
    userId,
    anonymizedEmail: anonymizedEmailFor(userId),
    cancelledAppointments: result.cancelledAppointments,
    deletedAt: now.toISOString(),
  };
}
