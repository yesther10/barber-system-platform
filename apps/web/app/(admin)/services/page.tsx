import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireAdminPage } from "@/lib/route-auth";
import { getPrisma } from "@/lib/db";
import { listServices } from "@/lib/catalog";
import ServicesManager from "./services-manager";

export const dynamic = "force-dynamic";

/**
 * Admin services page (design: services page, D1). Thin server component
 * following the dashboard-home pattern (D2): the layout already guards the
 * route; this page re-checks the session for the tenant id, loads the full
 * service list (including inactive ones) server-side through the catalog
 * lib — the same source the `/api/admin/services` route uses — and hands it
 * to the client manager. A tenant with no services yields the empty list,
 * which renders the manager's PT-BR empty state.
 */
export default async function ServicesPage() {
  const session = await auth();
  const guard = requireAdminPage(session);
  if (!guard.ok) redirect(guard.redirectTo);

  const services = await listServices(getPrisma(), guard.barbershopId, { includeInactive: true });

  return <ServicesManager initialServices={services} />;
}