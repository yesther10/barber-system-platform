"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

interface LoginFormProps {
  nextPath: string;
  googleEnabled: boolean;
}

interface CredentialsPayload {
  email: string;
  password: string;
  nextPath: string;
}

type SignInLike = typeof signIn;

export async function submitCredentials(signInFn: SignInLike, payload: CredentialsPayload) {
  if (!payload.email.trim() || !payload.password.trim()) {
    return { ok: false as const, error: "Informá e-mail e senha." };
  }

  const result = await signInFn("credentials", {
    email: payload.email,
    password: payload.password,
    redirect: false,
  });

  if (result?.error) {
    return { ok: false as const, error: "E-mail ou senha inválidos." };
  }

  return { ok: true as const, destination: payload.nextPath };
}

export default function LoginForm({ nextPath, googleEnabled }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setLoading(true);
    setError(null);

    const result = await submitCredentials(signIn, { email, password, nextPath });

    if (!result.ok) {
      setError(result.error);
      setLoading(false);
      return;
    }

    router.replace(result.destination);
  }

  return (
    <div className="space-y-4">
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}
      >
        <div className="space-y-2 text-left">
          <label className="text-sm font-medium text-slate-700" htmlFor="email">
            E-mail
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-900"
          />
        </div>

        <div className="space-y-2 text-left">
          <label className="text-sm font-medium text-slate-700" htmlFor="password">
            Senha
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-900"
          />
        </div>

        {error ? (
          <p role="alert" className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>

      {googleEnabled ? (
        <button
          type="button"
          disabled={loading}
          onClick={() => void signIn("google", { callbackUrl: nextPath })}
          className="w-full rounded-full border border-slate-300 px-5 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-900 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-70"
        >
          Entrar com Google
        </button>
      ) : null}
    </div>
  );
}
