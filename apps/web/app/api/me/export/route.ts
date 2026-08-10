import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { exportPersonalData, PersonalDataNotFoundError } from "@/lib/me-privacy";
import { guardBookingSession } from "@/lib/route-auth";

export const dynamic = "force-dynamic";

export async function POST(_request: Request) {
  const session = await auth();
  const guard = guardBookingSession(session);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.code }, { status: guard.status });
  }

  try {
    const payload = await exportPersonalData(getPrisma(), guard.clientId);
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof PersonalDataNotFoundError) {
      return NextResponse.json({ error: error.code }, { status: 404 });
    }

    throw error;
  }
}
