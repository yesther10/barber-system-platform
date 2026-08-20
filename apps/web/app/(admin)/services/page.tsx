import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireAdminPage } from "@/lib/route-auth";
import { listAdminServices } from "@/lib/admin-api";
import ServicesManager from "./services-manager";

export const dynamic = "force-dynamic";

/**
 * Admin services page (design: services page, D1). Thin server component:
 * the layout already guards the route; this page re-checks the session for
 * the tenant id, fetches the full service list server-side through the
 * admin-api fetcher, and hands it to the client manager — a failed server
 * fetch degrades to an empty list so the manager's PT-BR empty state shows.
 */
export default async function ServicesPage() {
  const session = await auth();
  const guard = requireAdminPage(session);
  if (!guard.ok) redirect(guard.redirectTo);

  const result = await listAdminServices({ fetchFn: fetch });

  return <ServicesManager initialServices={result.ok ? result.data : []} />;
}