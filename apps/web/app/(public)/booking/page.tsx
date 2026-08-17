import Link from "next/link";
import { translations } from "@/lib/i18n";

export default function BookingPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-3xl font-semibold">Agendamento</h1>
      <p className="max-w-md text-pretty text-slate-600">
        O fluxo de agendamento (serviços, barbeiros, horários e pagamento Pix)
        chega na fase de catálogo e agendamento.
      </p>
      <Link href="/" className="text-sm text-slate-500 underline">
        Voltar para {translations.common.appName}
      </Link>
    </main>
  );
}