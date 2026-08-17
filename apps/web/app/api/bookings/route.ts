import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { guardBookingSession } from "@/lib/route-auth";
import {
  AppointmentNotFoundError,
  BarberInactiveError,
  BookingInvalidInputError,
  BookingSlotConflictError,
  createBooking,
  ServiceInactiveError,
  ServiceNotAssignedError,
  SlotOutsideScheduleError,
} from "@/lib/booking";
import { BarberNotFoundError, ServiceNotFoundError } from "@/lib/catalog";
import { OnboardingIncompleteError, TenantNotFoundError } from "@/lib/onboarding";
import { PastDateError } from "@/lib/slots";

export const dynamic = "force-dynamic";

/**
 * POST /api/bookings — authenticated booking (booking spec). The service is
 * resolved by id; its tenant must be onboarded; the service price is
 * snapshotted and the appointment + confirmation outbox row are written in
 * one transaction under the barber row lock (app-level conflict prevention).
 * 401 without a session (middleware + this guard); 409 on slot conflict.
 */
export async function POST(request: Request) {
  const session = await auth();
  const guard = guardBookingSession(session);
  if (!guard.ok) return NextResponse.json({ error: guard.code }, { status: guard.status });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  try {
    const appointment = await createBooking(getPrisma(), { clientId: guard.clientId }, body);
    return NextResponse.json(appointment, { status: 201 });
  } catch (err) {
    if (err instanceof BookingInvalidInputError || err instanceof PastDateError) {
      return NextResponse.json({ error: err.code }, { status: 400 });
    }
    if (err instanceof ServiceNotFoundError || err instanceof BarberNotFoundError || err instanceof TenantNotFoundError || err instanceof AppointmentNotFoundError) {
      return NextResponse.json({ error: err.code }, { status: 404 });
    }
    if (
      err instanceof ServiceInactiveError ||
      err instanceof BarberInactiveError ||
      err instanceof ServiceNotAssignedError ||
      err instanceof BookingSlotConflictError ||
      err instanceof SlotOutsideScheduleError ||
      err instanceof OnboardingIncompleteError
    ) {
      return NextResponse.json({ error: err.code }, { status: 409 });
    }
    throw err;
  }
}
