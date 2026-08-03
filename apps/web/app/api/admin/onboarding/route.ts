import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { requireTenant, TenantContextError } from "@/lib/tenant";
import { getOnboardingSnapshot, onboardingStatus, TenantNotFoundError } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/onboarding — setup status for the caller's tenant
 * (tenant-management spec, task 3.5).
 *
 * Returns whether the tenant is operational, what is missing (the guided
 * setup steps), and the configured policies (auto|manual confirmation +
 * cancellation/reminder windows). Admin-only via middleware + session check.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "SESSION_REQUIRED" }, { status: 401 });
  }
  if (session.user.role !== "barbershop_admin") {
    return NextResponse.json({ error: "FORBIDDEN_ROLE" }, { status: 403 });
  }
  let barbershopId: string;
  try {
    barbershopId = requireTenant(session.user);
  } catch (err) {
    if (err instanceof TenantContextError) {
      return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 403 });
    }
    throw err;
  }

  try {
    const snapshot = await getOnboardingSnapshot(getPrisma(), barbershopId);
    const status = onboardingStatus(snapshot);
    return NextResponse.json({
      status,
      policies: {
        confirmationMode: snapshot.confirmationMode,
        lateCancelPolicy: snapshot.lateCancelPolicy,
        freeCancelWindowHours: snapshot.freeCancelWindowHours,
        rescheduleWindowHours: snapshot.rescheduleWindowHours,
        reminderLeadHours: snapshot.reminderLeadHours,
      },
    });
  } catch (err) {
    if (err instanceof TenantNotFoundError) {
      return NextResponse.json({ error: err.code }, { status: 404 });
    }
    throw err;
  }
}
