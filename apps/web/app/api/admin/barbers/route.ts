import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { guardAdmin } from "@/lib/route-auth";
import { createBarber, InvalidInputError, BarberUserError, listBarbers } from "@/lib/catalog";

export const dynamic = "force-dynamic";

/**
 * GET/POST /api/admin/barbers — tenant-scoped barber profiles (catalog
 * spec). Profiles link an invited BARBER user to specialties/bio; the barber
 * then appears in the booking flow and service assignment lists.
 */
export async function GET() {
  const session = await auth();
  const guard = guardAdmin(session);
  if (!guard.ok) return NextResponse.json({ error: guard.code }, { status: guard.status });
  const barbers = await listBarbers(getPrisma(), guard.barbershopId, { includeInactive: true });
  return NextResponse.json(barbers);
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
    const barber = await createBarber(getPrisma(), guard.barbershopId, body);
    return NextResponse.json(barber, { status: 201 });
  } catch (err) {
    if (err instanceof InvalidInputError || err instanceof BarberUserError) {
      return NextResponse.json({ error: err.code }, { status: 400 });
    }
    throw err;
  }
}
