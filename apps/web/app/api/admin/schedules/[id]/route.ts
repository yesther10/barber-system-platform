import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { guardAdmin } from "@/lib/route-auth";
import {
  deleteSchedule,
  InvalidInputError,
  ScheduleNotFoundError,
  updateSchedule,
  WindowOrderError,
} from "@/lib/catalog";

export const dynamic = "force-dynamic";

/**
 * PUT/DELETE /api/admin/schedules/:id — edit or remove a weekly schedule
 * entry. Both operations are scoped through the owning barber's tenant.
 */
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
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
    const schedule = await updateSchedule(getPrisma(), guard.barbershopId, id, body);
    return NextResponse.json(schedule);
  } catch (err) {
    if (err instanceof InvalidInputError || err instanceof WindowOrderError) {
      return NextResponse.json({ error: err.code }, { status: 400 });
    }
    if (err instanceof ScheduleNotFoundError) return NextResponse.json({ error: err.code }, { status: 404 });
    throw err;
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const session = await auth();
  const guard = guardAdmin(session);
  if (!guard.ok) return NextResponse.json({ error: guard.code }, { status: guard.status });

  try {
    await deleteSchedule(getPrisma(), guard.barbershopId, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ScheduleNotFoundError) return NextResponse.json({ error: err.code }, { status: 404 });
    throw err;
  }
}
