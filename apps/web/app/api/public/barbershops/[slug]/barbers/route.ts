import { NextResponse } from "next/server";
import { PublicBarberQuery } from "@barber/contracts";
import { getPrisma } from "@/lib/db";
import { getPublicBarbersByService, InvalidInputError, ServiceNotFoundError } from "@/lib/catalog";
import { TenantNotFoundError } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

/**
 * GET /api/public/barbershops/:slug/barbers?serviceId= — public barber browse
 * (catalog spec). No session required. Returns only ACTIVE barbers assigned
 * to the requested service as `PublicBarberView` (no userId). Missing or
 * invalid serviceId → 400; unknown slug → 404 TENANT_NOT_FOUND; deactivated
 * or unknown service → 404 SERVICE_NOT_FOUND.
 */
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const search = new URL(request.url).searchParams;
  const parsed = PublicBarberQuery.safeParse({
    barbershopSlug: slug,
    serviceId: search.get("serviceId"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  try {
    const barbers = await getPublicBarbersByService(
      getPrisma(),
      parsed.data.barbershopSlug,
      parsed.data.serviceId,
    );
    return NextResponse.json(barbers);
  } catch (err) {
    if (err instanceof TenantNotFoundError || err instanceof ServiceNotFoundError) {
      return NextResponse.json({ error: err.code }, { status: 404 });
    }
    if (err instanceof InvalidInputError) {
      return NextResponse.json({ error: err.code }, { status: 400 });
    }
    throw err;
  }
}