import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { guardBookingSession } from "@/lib/route-auth";
import {
  AppointmentNotFoundError,
  BookingInvalidInputError,
  cancelAppointment,
  InvalidTransitionError,
  LateCancelRejectedError,
} from "@/lib/booking";

export const dynamic = "force-dynamic";

/**
 * POST /api/bookings/:id/cancel — cancels the caller's appointment: frees the
 * slot, enqueues a CANCELLATION outbox row. Late cancellation is rejected
 * (409) under the tenant reject policy; completed/cancelled appointments are
 * invalid transitions. Unknown ids → 404, no leak.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
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
    const appointment = await cancelAppointment(
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
    if (err instanceof BookingInvalidInputError) {
      return NextResponse.json({ error: err.code }, { status: 400 });
    }
    if (err instanceof AppointmentNotFoundError) {
      return NextResponse.json({ error: err.code }, { status: 404 });
    }
    if (err instanceof LateCancelRejectedError || err instanceof InvalidTransitionError) {
      return NextResponse.json({ error: err.code }, { status: 409 });
    }
    throw err;
  }
}
