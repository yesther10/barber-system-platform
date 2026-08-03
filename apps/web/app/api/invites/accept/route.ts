import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db";
import {
  acceptInvite,
  InviteAlreadyUsedError,
  InviteConsentRequiredError,
  InviteTokenError,
} from "@/lib/invites";

export const dynamic = "force-dynamic";

/**
 * POST /api/invites/accept — consume a single-use invite (user-auth spec).
 *
 * Public by design: the invitee has no account yet, so there is no session
 * to check — the signed token IS the credential. The service re-checks
 * single-use inside a transaction, creates the tenant-scoped `barber`
 * account, and consumes the token atomically. A reused token returns 409.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  const secret = process.env.INVITE_SECRET ?? process.env.AUTH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "INVITE_SECRET_MISSING" }, { status: 500 });
  }

  try {
    const result = await acceptInvite(getPrisma(), body, secret);
    return NextResponse.json({ user: result }, { status: 201 });
  } catch (err) {
    if (err instanceof InviteConsentRequiredError || err instanceof InviteTokenError) {
      return NextResponse.json({ error: err.code }, { status: 400 });
    }
    if (err instanceof InviteAlreadyUsedError) {
      return NextResponse.json({ error: err.code }, { status: 409 });
    }
    throw err;
  }
}
