import Link from "next/link";
import { translations } from "@/lib/i18n";
import { onboardingStatus, type OnboardingSnapshot, type SetupArea } from "@/lib/onboarding";

/**
 * Admin page per onboarding area. Areas without an admin page in this change
 * (pix) render as plain text instead of a dead link.
 */
const AREA_HREFS: Partial<Record<SetupArea, string>> = {
  services: "/services",
  barbers: "/barbers",
  schedules: "/schedules",
};

/**
 * Server presentational card (design: dashboard home). Renders the tenant's
 * onboarding status — the list of missing setup areas with links, or a
 * completion message — computed from the snapshot by the pure
 * `onboardingStatus` helper.
 */
export function OnboardingCard({ snapshot }: { snapshot: OnboardingSnapshot }) {
  const status = onboardingStatus(snapshot);
  const t = translations.admin.dashboard.onboarding;

  if (status.complete) {
    return (
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
        <h2 className="font-semibold text-emerald-800">{t.completeTitle}</h2>
        <p className="mt-1 text-sm text-emerald-700">{t.completeMessage}</p>
      </section>
    );
  }

  const nextHref = status.nextStep ? AREA_HREFS[status.nextStep] : undefined;

  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <h2 className="font-semibold text-amber-900">{t.missingTitle}</h2>
      <ul className="mt-2 space-y-1 text-sm">
        {status.missing.map((area) => {
          const href = AREA_HREFS[area];
          const label = t.areas[area];
          return (
            <li key={area}>
              {href ? (
                <Link className="font-medium text-amber-800 underline underline-offset-2" href={href}>
                  {label}
                </Link>
              ) : (
                <span className="font-medium text-amber-800">{label}</span>
              )}
            </li>
          );
        })}
      </ul>
      {status.nextStep && (
        <p className="mt-3 text-sm text-amber-900">
          {t.nextStep}:{" "}
          {nextHref ? (
            <Link className="font-medium underline underline-offset-2" href={nextHref}>
              {t.areas[status.nextStep]}
            </Link>
          ) : (
            <span className="font-medium">{t.areas[status.nextStep]}</span>
          )}
        </p>
      )}
    </section>
  );
}