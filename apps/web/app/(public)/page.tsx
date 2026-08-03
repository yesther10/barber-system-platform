import Link from "next/link";
import { t, translations } from "@/lib/i18n";

export default function PublicHomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
        {translations.common.appName}
      </h1>
      <p className="max-w-xl text-pretty text-lg text-slate-600">
        {translations.common.tagline}
      </p>
      <Link
        href="/booking"
        className="rounded-full bg-slate-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-slate-700"
      >
        {t("ctaBooking")}
      </Link>
    </main>
  );
}