import { NextResponse } from "next/server";
import { createPixPayment, PaymentAppointmentNotFoundError, PaymentConfigurationError } from "@barber/payments";
import { auth } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { resolvePixProviderForAppointment } from "@/lib/payments";
import { guardBookingSession } from "@/lib/route-auth";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const session = await auth();
  const guard = guardBookingSession(session);
  if (!guard.ok) return NextResponse.json({ error: guard.code }, { status: guard.status });

  try {
    const provider = await resolvePixProviderForAppointment(getPrisma(), id);
    const payment = await createPixPayment(getPrisma(), provider, {
      appointmentId: id,
      clientId: guard.clientId,
      notificationUrl: process.env.MERCADO_PAGO_WEBHOOK_URL,
    });
    return NextResponse.json(payment, { status: 201 });
  } catch (error) {
    if (error instanceof PaymentAppointmentNotFoundError) {
      return NextResponse.json({ error: error.code }, { status: 404 });
    }
    if (error instanceof PaymentConfigurationError) {
      return NextResponse.json({ error: error.code }, { status: 409 });
    }
    if (error instanceof Error) {
      return NextResponse.json({ error: "PROVIDER_UNAVAILABLE", message: error.message }, { status: 502 });
    }
    throw error;
  }
}
