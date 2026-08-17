import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { guardAdmin } from "@/lib/route-auth";
import { deleteException, ExceptionNotFoundError } from "@/lib/catalog";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/admin/exceptions/:id — remove a one-off exception, restoring
 * the weekly schedule for that date.
 */
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const session = await auth();
  const guard = guardAdmin(session);
  if (!guard.ok) return NextResponse.json({ error: guard.code }, { status: guard.status });

  try {
    await deleteException(getPrisma(), guard.barbershopId, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ExceptionNotFoundError) {
      return NextResponse.json({ error: err.code }, { status: 404 });
    }
    throw err;
  }
}
