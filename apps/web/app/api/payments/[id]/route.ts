import { NextResponse } from "next/server";
import { PaymentAppointmentNotFoundError } from "@barber/payments";
import { auth } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { getPaymentStatusView } from "@/lib/payments";
import { guardBookingSession } from "@/lib/route-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/payments/:id — session-gated payment status read (payments spec).
 * Resolves the caller's appointment by `providerPaymentId`, raw appointment
 * id, or the `pix_`-prefixed form; no session → 401 SESSION_REQUIRED; an id
 * matching no appointment or another client's appointment → 404.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const session = await auth();
  const guard = guardBookingSession(session);
  if (!guard.ok) return NextResponse.json({ error: guard.code }, { status: guard.status });

  try {
    const view = await getPaymentStatusView(getPrisma(), guard.clientId, id);
    return NextResponse.json(view);
  } catch (error) {
    if (error instanceof PaymentAppointmentNotFoundError) {
      return NextResponse.json({ error: error.code }, { status: 404 });
    }
    throw error;
  }
}