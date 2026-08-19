import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { requireAdminPage } from "@/lib/route-auth";
import { adminLoginPath } from "@/lib/auth-redirect";
import Nav from "./nav";

export const dynamic = "force-dynamic";

/**
 * Admin shell guard (design D1) — single enforcement point for every admin
 * route. Guests go to the login page keeping the requested path as `next`;
 * sessions without the `barbershop_admin` role or a tenant go home.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session?.user) {
    const headerList = await headers();
    redirect(adminLoginPath(headerList.get("x-pathname")));
  }

  const guard = requireAdminPage(session);
  if (!guard.ok) {
    redirect(guard.redirectTo);
  }

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}