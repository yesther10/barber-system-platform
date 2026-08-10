import { NextResponse } from "next/server";
import {
  ManualPaymentAlreadyProcessedError,
  markAppointmentPaidManually,
  PaymentAppointmentNotFoundError,
} from "@barber/payments";
import { auth } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { guardAdmin } from "@/lib/route-auth";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const session = await auth();
  const guard = guardAdmin(session);
  if (!guard.ok) return NextResponse.json({ error: guard.code }, { status: guard.status });

  try {
    const result = await markAppointmentPaidManually(getPrisma(), {
      appointmentId: id,
      barbershopId: guard.barbershopId,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof PaymentAppointmentNotFoundError) {
      return NextResponse.json({ error: error.code }, { status: 404 });
    }
    if (error instanceof ManualPaymentAlreadyProcessedError) {
      return NextResponse.json({ error: error.code }, { status: 409 });
    }
    throw error;
  }
}
