import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { guardAdmin } from "@/lib/route-auth";
import {
  deleteService,
  InvalidInputError,
  ServiceHasAppointmentsError,
  ServiceNotFoundError,
  updateService,
} from "@/lib/catalog";

export const dynamic = "force-dynamic";

/**
 * PUT/DELETE /api/admin/services/:id — update (incl. deactivate → unbookable)
 * and delete a tenant-scoped service. Deleting a service that still has
 * appointments is rejected (409): deactivation is the supported retirement
 * path and never alters existing appointments (catalog spec).
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
    const service = await updateService(getPrisma(), guard.barbershopId, id, body);
    return NextResponse.json(service);
  } catch (err) {
    if (err instanceof InvalidInputError) return NextResponse.json({ error: err.code }, { status: 400 });
    if (err instanceof ServiceNotFoundError) return NextResponse.json({ error: err.code }, { status: 404 });
    throw err;
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const session = await auth();
  const guard = guardAdmin(session);
  if (!guard.ok) return NextResponse.json({ error: guard.code }, { status: guard.status });

  try {
    await deleteService(getPrisma(), guard.barbershopId, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ServiceNotFoundError) return NextResponse.json({ error: err.code }, { status: 404 });
    if (err instanceof ServiceHasAppointmentsError) {
      return NextResponse.json({ error: err.code }, { status: 409 });
    }
    throw err;
  }
}
