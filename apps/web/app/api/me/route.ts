import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { deletePersonalData, InvalidDeletionRequestError, PersonalDataNotFoundError } from "@/lib/me-privacy";
import { guardBookingSession } from "@/lib/route-auth";

export const dynamic = "force-dynamic";

export async function DELETE(request: Request) {
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
    const payload = await deletePersonalData(getPrisma(), guard.clientId, body);
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof InvalidDeletionRequestError) {
      return NextResponse.json({ error: error.code }, { status: 400 });
    }
    if (error instanceof PersonalDataNotFoundError) {
      return NextResponse.json({ error: error.code }, { status: 404 });
    }

    throw error;
  }
}
