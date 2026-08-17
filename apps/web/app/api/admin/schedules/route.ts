import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { guardAdmin } from "@/lib/route-auth";
import {
  BarberNotFoundError,
  createSchedule,
  InvalidInputError,
  listSchedules,
  WindowOrderError,
} from "@/lib/catalog";

export const dynamic = "force-dynamic";

/**
 * GET/POST /api/admin/schedules — weekly recurring availability per barber
 * (catalog spec). The slot grid never offers times outside these windows.
 */
export async function GET(request: Request) {
  const session = await auth();
  const guard = guardAdmin(session);
  if (!guard.ok) return NextResponse.json({ error: guard.code }, { status: guard.status });
  const barberId = new URL(request.url).searchParams.get("barberId") ?? undefined;
  const schedules = await listSchedules(getPrisma(), guard.barbershopId, barberId);
  return NextResponse.json(schedules);
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
    const schedule = await createSchedule(getPrisma(), guard.barbershopId, body);
    return NextResponse.json(schedule, { status: 201 });
  } catch (err) {
    if (err instanceof InvalidInputError || err instanceof WindowOrderError) {
      return NextResponse.json({ error: err.code }, { status: 400 });
    }
    if (err instanceof BarberNotFoundError) return NextResponse.json({ error: err.code }, { status: 404 });
    throw err;
  }
}
