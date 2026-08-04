import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db";
import { SlotQuery } from "@barber/contracts";
import { getSlotGrid, PastDateError } from "@/lib/slots";
import { TenantNotFoundError } from "@/lib/onboarding";
import { BarberNotFoundError, ServiceNotFoundError } from "@/lib/catalog";

export const dynamic = "force-dynamic";

/**
 * GET /api/public/barbershops/:slug/slots?serviceId=&barberId=&date= — public
 * slot projection (booking spec): weekly schedule − exceptions − appointments
 * at the tenant granularity. Inactive services/barbers and past dates are
 * rejected (past date → 400; invisible resources → 404).
 */
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const search = new URL(request.url).searchParams;
  const parsed = SlotQuery.safeParse({
    barbershopSlug: slug,
    serviceId: search.get("serviceId"),
    barberId: search.get("barberId"),
    date: search.get("date"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  try {
    const grid = await getSlotGrid(getPrisma(), parsed.data);
    return NextResponse.json(grid);
  } catch (err) {
    if (err instanceof TenantNotFoundError || err instanceof ServiceNotFoundError || err instanceof BarberNotFoundError) {
      return NextResponse.json({ error: err.code }, { status: 404 });
    }
    if (err instanceof PastDateError) {
      return NextResponse.json({ error: err.code }, { status: 400 });
    }
    throw err;
  }
}
