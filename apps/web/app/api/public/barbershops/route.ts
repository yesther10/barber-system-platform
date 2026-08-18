import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db";
import { listPublicBarbershops } from "@/lib/catalog";

export const dynamic = "force-dynamic";

/**
 * GET /api/public/barbershops — public barbershop directory (catalog spec).
 * No session required. Returns every tenant with at least one ACTIVE service
 * as `PublicBarbershopView` ({ slug, name } only). Bare GET with no params in
 * v1, so there are no 400/404 branches; unexpected errors propagate → 500.
 */
export async function GET() {
  try {
    const barbershops = await listPublicBarbershops(getPrisma());
    return NextResponse.json(barbershops);
  } catch (err) {
    throw err;
  }
}
