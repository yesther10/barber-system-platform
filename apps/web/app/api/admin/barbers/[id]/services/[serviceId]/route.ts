import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { guardAdmin } from "@/lib/route-auth";
import {
  assignServiceToBarber,
  BarberNotFoundError,
  ServiceNotFoundError,
  unassignServiceFromBarber,
} from "@/lib/catalog";

export const dynamic = "force-dynamic";

/**
 * POST/DELETE /api/admin/barbers/:id/services/:serviceId — manage the
 * barber ↔ service assignment list (catalog spec: the barber appears in
 * service assignment lists). Both entities are resolved tenant-scoped.
 */
export async function POST(_request: Request, context: { params: Promise<{ id: string; serviceId: string }> }) {
  const { id, serviceId } = await context.params;
  const session = await auth();
  const guard = guardAdmin(session);
  if (!guard.ok) return NextResponse.json({ error: guard.code }, { status: guard.status });

  try {
    await assignServiceToBarber(getPrisma(), guard.barbershopId, id, serviceId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof BarberNotFoundError || err instanceof ServiceNotFoundError) {
      return NextResponse.json({ error: err.code }, { status: 404 });
    }
    throw err;
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string; serviceId: string }> }) {
  const { id, serviceId } = await context.params;
  const session = await auth();
  const guard = guardAdmin(session);
  if (!guard.ok) return NextResponse.json({ error: guard.code }, { status: guard.status });

  try {
    await unassignServiceFromBarber(getPrisma(), guard.barbershopId, id, serviceId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof BarberNotFoundError || err instanceof ServiceNotFoundError) {
      return NextResponse.json({ error: err.code }, { status: 404 });
    }
    throw err;
  }
}
