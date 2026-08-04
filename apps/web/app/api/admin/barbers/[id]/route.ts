import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { guardAdmin } from "@/lib/route-auth";
import { BarberNotFoundError, InvalidInputError, updateBarber } from "@/lib/catalog";

export const dynamic = "force-dynamic";

/**
 * PUT /api/admin/barbers/:id — update a tenant barber profile (specialties,
 * bio, active). Deactivating a barber makes them unbookable.
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
    const barber = await updateBarber(getPrisma(), guard.barbershopId, id, body);
    return NextResponse.json(barber);
  } catch (err) {
    if (err instanceof InvalidInputError) return NextResponse.json({ error: err.code }, { status: 400 });
    if (err instanceof BarberNotFoundError) return NextResponse.json({ error: err.code }, { status: 404 });
    throw err;
  }
}
