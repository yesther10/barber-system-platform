import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { guardAdmin } from "@/lib/route-auth";
import {
  BarberNotFoundError,
  createException,
  InvalidInputError,
  listExceptions,
  WindowOrderError,
} from "@/lib/catalog";

export const dynamic = "force-dynamic";

/**
 * GET/POST /api/admin/exceptions — one-off availability overrides (holiday,
 * day off) per barber (catalog spec). An exception covering a full shift
 * makes that date produce no slots.
 */
export async function GET(request: Request) {
  const session = await auth();
  const guard = guardAdmin(session);
  if (!guard.ok) return NextResponse.json({ error: guard.code }, { status: guard.status });
  const url = new URL(request.url);
  const filter = {
    barberId: url.searchParams.get("barberId") ?? undefined,
    date: url.searchParams.get("date") ?? undefined,
  };
  const exceptions = await listExceptions(getPrisma(), guard.barbershopId, filter);
  return NextResponse.json(exceptions);
}

export async function POST(request: Request) {
  const session = await auth();
  const guard = guardAdmin(session);
  if (!guard.ok) return NextResponse.json({ error: guard.code }, { status: guard.status });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  try {
    const exception = await createException(getPrisma(), guard.barbershopId, body);
    return NextResponse.json(exception, { status: 201 });
  } catch (err) {
    if (err instanceof InvalidInputError || err instanceof WindowOrderError) {
      return NextResponse.json({ error: err.code }, { status: 400 });
    }
    if (err instanceof BarberNotFoundError) return NextResponse.json({ error: err.code }, { status: 404 });
    throw err;
  }
}
