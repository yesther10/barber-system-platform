import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db";
import { getPublicServices } from "@/lib/catalog";
import { TenantNotFoundError } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

/**
 * GET /api/public/barbershops/:slug/services — public catalog browse (catalog
 * spec). Returns only ACTIVE services of the tenant; a deactivated service
 * disappears from public booking while its appointments stay unchanged.
 */
export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  try {
    const services = await getPublicServices(getPrisma(), slug);
    return NextResponse.json(services);
  } catch (err) {
    if (err instanceof TenantNotFoundError) {
      return NextResponse.json({ error: err.code }, { status: 404 });
    }
    throw err;
  }
}
