"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { translations } from "@/lib/i18n";

/** Persistent admin navigation (design D6) — 7 links; Exceções is cross-linked
 * from the Schedules page. */
const NAV_LINKS = [
  { href: "/dashboard", label: translations.admin.nav.dashboard },
  { href: "/services", label: translations.admin.nav.services },
  { href: "/barbers", label: translations.admin.nav.barbers },
  { href: "/schedules", label: translations.admin.nav.schedules },
  { href: "/reports", label: translations.admin.nav.reports },
  { href: "/invites", label: translations.admin.nav.invites },
  { href: "/agenda", label: translations.admin.nav.agenda },
] as const;

export default function Nav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label={translations.admin.nav.navLabel}
      className="border-b border-slate-200 bg-white"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
        <ul className="flex flex-wrap items-center gap-1">
          {NAV_LINKS.map((link) => {
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={
                    active
                      ? "rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white"
                      : "rounded-full px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                  }
                >
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          onClick={() => void signOut({ callbackUrl: "/login" })}
          aria-label={translations.admin.nav.signOutLabel}
          className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-900 hover:text-slate-900"
        >
          {translations.admin.nav.signOut}
        </button>
      </div>
    </nav>
  );
}