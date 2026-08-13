import { redirect } from "next/navigation";
import { authConfig } from "@/lib/auth.config";
import { auth } from "@/lib/auth";
import { sanitizeNextPath } from "@/lib/auth-redirect";
import LoginForm from "./login-form";

type SearchParams = Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>;

function pickFirst(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const params = (await searchParams) ?? {};
  const nextPath = sanitizeNextPath(pickFirst(params.next));
  const session = await auth();

  if (session?.user?.id) {
    redirect(nextPath);
  }

  const googleEnabled = authConfig.providers.some((provider) => provider.id === "google");

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-10">
      <div className="w-full max-w-md space-y-6 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-semibold">Entrar</h1>
          <p className="text-pretty text-sm text-slate-600">
            Acesse sua conta para continuar o agendamento com segurança.
          </p>
        </div>
        <LoginForm nextPath={nextPath} googleEnabled={googleEnabled} />
      </div>
    </main>
  );
}
