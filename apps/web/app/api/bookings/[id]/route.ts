import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { guardBookingSession } from "@/lib/route-auth";
import {
  AppointmentNotFoundError,
  BookingInvalidInputError,
  BookingSlotConflictError,
  InvalidTransitionError,
  rescheduleAppointment,
  RescheduleWindowRejectedError,
  SlotOutsideScheduleError,
} from "@/lib/booking";
import { PastDateError } from "@/lib/slots";

export const dynamic = "force-dynamic";

/**
 * PUT /api/bookings/:id — reschedules the caller's appointment to a new slot
 * (single transaction: old slot freed, new slot taken under the barber lock).
 * Rejected inside the tenant reschedule window (409) and for completed or
 * cancelled appointments (invalid transition). Unknown ids → 404, no leak.
 */
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
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
    const appointment = await rescheduleAppointment(
      getPrisma(),
      {
        clientId: guard.clientId,
        appointmentId: id,
        barbershopId: session?.user?.barbershopId ?? undefined,
      },
      body,
    );
    return NextResponse.json(appointment);
  } catch (err) {
    if (err instanceof BookingInvalidInputError || err instanceof PastDateError) {
      return NextResponse.json({ error: err.code }, { status: 400 });
    }
    if (err instanceof AppointmentNotFoundError) {
      return NextResponse.json({ error: err.code }, { status: 404 });
    }
    if (
      err instanceof BookingSlotConflictError ||
      err instanceof SlotOutsideScheduleError ||
      err instanceof RescheduleWindowRejectedError ||
      err instanceof InvalidTransitionError
    ) {
      return NextResponse.json({ error: err.code }, { status: 409 });
    }
    throw err;
  }
}
