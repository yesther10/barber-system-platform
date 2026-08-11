import { PRIVACY_POLICY_SECTIONS, PRIVACY_POLICY_VERSION } from "../../../lib/privacy-policy";

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 px-6 py-12 text-slate-900">
      <header className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">LGPD · versão {PRIVACY_POLICY_VERSION}</p>
        <h1 className="text-4xl font-semibold tracking-tight">Política de privacidade</h1>
        <p className="max-w-3xl text-pretty text-base text-slate-600">
          Transparência primeiro: esta política em PT-BR fica disponível antes de qualquer captura de consentimento para que você saiba exatamente como a barbearia e a plataforma tratam seus dados conforme a Lei Geral de Proteção de Dados.
        </p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-700">
        <p>
          Base legal principal: consentimento para comunicações não essenciais e execução do contrato para cadastro, agendamento, pagamento e suporte operacional.
        </p>
      </section>

      <div className="space-y-6">
        {PRIVACY_POLICY_SECTIONS.map((section) => (
          <section key={section.title} className="space-y-3">
            <h2 className="text-2xl font-semibold">{section.title}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph} className="text-pretty leading-7 text-slate-700">
                {paragraph}
              </p>
            ))}
          </section>
        ))}
      </div>

      <footer className="border-t border-slate-200 pt-6 text-sm text-slate-600">
        <p>Para exercer seus direitos, use os endpoints de LGPD da sua conta autenticada ou solicite atendimento pelo canal informado pela barbearia.</p>
      </footer>
    </main>
  );
}
