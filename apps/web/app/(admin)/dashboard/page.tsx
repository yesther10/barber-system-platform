import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireAdminPage } from "@/lib/route-auth";
import { getPrisma } from "@/lib/db";
import { getOnboardingSnapshot } from "@/lib/onboarding";
import { generateReport } from "@/lib/reporting";
import { todayInTz } from "@/lib/tz";
import { translations } from "@/lib/i18n";
import { OnboardingCard } from "./onboarding-card";

export const dynamic = "force-dynamic";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Dashboard home (design D2, D3): a thin server component calling libs
 * directly — onboarding snapshot → <OnboardingCard/>, and the reports lib
 * with today's BR date as a single-day, no-grouping query → the zeroed
 * ReportRow already produced for an empty day → the day-metrics tiles.
 */
export default async function DashboardPage() {
  const session = await auth();
  const guard = requireAdminPage(session);
  if (!guard.ok) redirect(guard.redirectTo);

  const db = getPrisma();
  const today = todayInTz();
  const [snapshot, report] = await Promise.all([
    getOnboardingSnapshot(db, guard.barbershopId),
    generateReport(db, guard.barbershopId, { from: today, to: today, groupBy: "none" }),
  ]);
  const day = report.rows[0] ?? { total: 0, pending: 0, revenueBRL: 0 };
  const t = translations.admin.dashboard;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">{t.title}</h1>

      <OnboardingCard snapshot={snapshot} />

      <section aria-labelledby="day-metrics-heading" className="space-y-3">
        <h2 id="day-metrics-heading" className="text-lg font-semibold">
          {t.metrics.title}
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 p-4">
            <p className="text-sm text-slate-600">{t.metrics.appointments}</p>
            <p className="mt-1 text-2xl font-semibold">{day.total}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 p-4">
            <p className="text-sm text-slate-600">{t.metrics.pendingConfirmations}</p>
            <p className="mt-1 text-2xl font-semibold">{day.pending}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 p-4">
            <p className="text-sm text-slate-600">{t.metrics.revenue}</p>
            <p className="mt-1 text-2xl font-semibold">{brl.format(day.revenueBRL)}</p>
          </div>
        </div>
        {day.total === 0 && <p className="text-sm text-slate-600">{t.metrics.emptyDay}</p>}
      </section>
    </div>
  );
}