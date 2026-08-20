import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { guardAdmin } from "@/lib/route-auth";
import { BarberNotFoundError, getBarberAssignmentMatrix } from "@/lib/catalog";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/barbers/:id/services — read-only assignment matrix for a
 * tenant barber (catalog delta): every service of the tenant with whether
 * the barber is assigned to it. Never modifies assignments; an unknown or
 * foreign barber resolves to 404 with no assignment data leaked.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const session = await auth();
  const guard = guardAdmin(session);
  if (!guard.ok) return NextResponse.json({ error: guard.code }, { status: guard.status });

  try {
    const matrix = await getBarberAssignmentMatrix(getPrisma(), guard.barbershopId, id);
    return NextResponse.json(matrix);
  } catch (err) {
    if (err instanceof BarberNotFoundError) {
      return NextResponse.json({ error: err.code }, { status: 404 });
    }
    throw err;
  }
}