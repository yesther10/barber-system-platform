/**
 * Tenant onboarding (tenant-management spec, task 3.5).
 *
 * A barbershop is operational once its setup is complete: services, barbers,
 * schedules, confirmation/cancellation policies and Pix credentials. The
 * pure `onboardingStatus` computes what is missing (and the next step);
 * `getOnboardingSnapshot` loads the live counts + policy fields from the DB;
 * `requireOnboarded` is the guard admin routes use to restrict other areas
 * until setup finishes (spec "Incomplete setup" scenario). `confirmsImmediately`
 * encodes the auto-vs-manual confirmation rule the booking flow (WU5) applies.
 */
import type { PrismaClient } from "@barber/db";

/** Snapshot of a tenant's setup state, loaded from the DB. */
export interface OnboardingSnapshot {
  serviceCount: number;
  barberCount: number;
  scheduleCount: number;
  confirmationMode: "AUTO" | "MANUAL";
  lateCancelPolicy: "REJECT" | "ALLOW";
  freeCancelWindowHours: number;
  rescheduleWindowHours: number;
  reminderLeadHours: number;
  pixProvider: string | null;
}

/** Setup areas in the order the onboarding flow guides through them. */
export type SetupArea = "services" | "barbers" | "schedules" | "pix";

export interface OnboardingStatus {
  complete: boolean;
  missing: SetupArea[];
  nextStep: SetupArea | null;
}

/** Computes onboarding completeness and the next guided step (pure). */
export function onboardingStatus(snapshot: OnboardingSnapshot): OnboardingStatus {
  const missing: SetupArea[] = [];
  if (snapshot.serviceCount === 0) missing.push("services");
  if (snapshot.barberCount === 0) missing.push("barbers");
  if (snapshot.scheduleCount === 0) missing.push("schedules");
  if (snapshot.pixProvider == null) missing.push("pix");
  return { complete: missing.length === 0, missing, nextStep: missing[0] ?? null };
}

/**
 * AUTO tenants confirm appointments at booking time; MANUAL tenants keep
 * them `pending` until an admin confirms (tenant-management spec).
 */
export function confirmsImmediately(mode: "AUTO" | "MANUAL"): boolean {
  return mode === "AUTO";
}

/** Thrown when the tenant does not exist (mapped to 404). */
export class TenantNotFoundError extends Error {
  readonly code = "TENANT_NOT_FOUND" as const;
}

/** Thrown when an admin operation requires completed onboarding. */
export class OnboardingIncompleteError extends Error {
  readonly code = "ONBOARDING_INCOMPLETE" as const;
  readonly missing: SetupArea[];

  constructor(missing: SetupArea[]) {
    super(`Tenant onboarding incomplete: ${missing.join(", ")}`);
    this.name = "OnboardingIncompleteError";
    this.missing = missing;
  }
}

/** Loads a tenant's setup snapshot from the DB (counts + policies + pix). */
export async function getOnboardingSnapshot(
  db: PrismaClient,
  barbershopId: string,
): Promise<OnboardingSnapshot> {
  const [serviceCount, barberCount, scheduleCount, shop] = await Promise.all([
    db.service.count({ where: { barbershopId } }),
    db.barber.count({ where: { barbershopId } }),
    db.schedule.count({ where: { barber: { barbershopId } } }),
    db.barbershop.findUnique({
      where: { id: barbershopId },
      select: {
        confirmationMode: true,
        lateCancelPolicy: true,
        freeCancelWindowHours: true,
        rescheduleWindowHours: true,
        reminderLeadHours: true,
        pixProvider: true,
      },
    }),
  ]);
  if (!shop) throw new TenantNotFoundError();

  return {
    serviceCount,
    barberCount,
    scheduleCount,
    confirmationMode: shop.confirmationMode,
    lateCancelPolicy: shop.lateCancelPolicy,
    freeCancelWindowHours: shop.freeCancelWindowHours,
    rescheduleWindowHours: shop.rescheduleWindowHours,
    reminderLeadHours: shop.reminderLeadHours,
    pixProvider: shop.pixProvider,
  };
}

/**
 * Guard for admin operations: throws when the tenant has not finished
 * onboarding, restricting access to other areas (spec "Incomplete setup").
 */
export async function requireOnboarded(db: PrismaClient, barbershopId: string): Promise<void> {
  const snapshot = await getOnboardingSnapshot(db, barbershopId);
  const status = onboardingStatus(snapshot);
  if (!status.complete) throw new OnboardingIncompleteError(status.missing);
}
