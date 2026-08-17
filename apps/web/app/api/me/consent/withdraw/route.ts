import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { guardBookingSession } from "@/lib/route-auth";
import { InvalidWithdrawalInputError, withdrawConsent } from "@/lib/withdraw-consent";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await auth();
  const guard = guardBookingSession(session);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.code }, { status: guard.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  try {
    await withdrawConsent(getPrisma(), guard.clientId, body);
    return NextResponse.json({ status: "withdrawn" });
  } catch (error) {
    if (error instanceof InvalidWithdrawalInputError) {
      return NextResponse.json({ error: error.code }, { status: 400 });
    }
    throw error;
  }
}
