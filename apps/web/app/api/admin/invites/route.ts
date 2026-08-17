import { NextResponse } from "next/server";
import { InviteInput } from "@barber/contracts";
import { auth } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { requireTenant, TenantContextError } from "@/lib/tenant";
import { createInvite } from "@/lib/invites";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/invites — issue a single-use barber invite (user-auth spec).
 *
 * Middleware already blocks non-`barbershop_admin` callers with 403; this
 * handler re-checks the session and derives the tenant from it, so the invite
 * is always scoped to the caller's own barbershop.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "SESSION_REQUIRED" }, { status: 401 });
  }
  if (session.user.role !== "barbershop_admin") {
    return NextResponse.json({ error: "FORBIDDEN_ROLE" }, { status: 403 });
  }
  let barbershopId: string;
  try {
    barbershopId = requireTenant(session.user);
  } catch (err) {
    if (err instanceof TenantContextError) {
      return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 403 });
    }
    throw err;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }
  const parsed = InviteInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  const secret = process.env.INVITE_SECRET ?? process.env.AUTH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "INVITE_SECRET_MISSING" }, { status: 500 });
  }

  const token = await createInvite(getPrisma(), {
    email: parsed.data.email,
    barbershopId,
    secret,
  });
  return NextResponse.json({ token }, { status: 201 });
}
