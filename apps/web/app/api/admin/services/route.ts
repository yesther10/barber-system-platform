import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { guardAdmin } from "@/lib/route-auth";
import { createService, InvalidInputError, listServices } from "@/lib/catalog";

export const dynamic = "force-dynamic";

/**
 * GET/POST /api/admin/services — tenant-scoped service catalog (catalog
 * spec). Admin-only via middleware + session guard. Deactivated services
 * stay listed here (includeInactive) but disappear from the public catalog.
 */
export async function GET() {
  const session = await auth();
  const guard = guardAdmin(session);
  if (!guard.ok) return NextResponse.json({ error: guard.code }, { status: guard.status });
  const services = await listServices(getPrisma(), guard.barbershopId, { includeInactive: true });
  return NextResponse.json(services);
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
    const service = await createService(getPrisma(), guard.barbershopId, body);
    return NextResponse.json(service, { status: 201 });
  } catch (err) {
    if (err instanceof InvalidInputError) {
      return NextResponse.json({ error: err.code }, { status: 400 });
    }
    throw err;
  }
}
