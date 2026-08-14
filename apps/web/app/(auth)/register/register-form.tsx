"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { RegisterInput } from "@barber/contracts";
import { CURRENT_CONSENT_POLICY_VERSION } from "@/lib/consent";
import { sanitizeNextPath } from "@/lib/auth-redirect";

export interface RegistrationPayload {
  name: string;
  email: string;
  phone?: string;
  password: string;
  confirmPassword: string;
  consent: boolean;
  nextPath: string;
}

export type RegistrationResult =
  | { ok: true; destination: string }
  | { ok: false; field: "email" | "consent" | "confirmPassword" | "form"; message: string };

interface SubmitRegistrationDeps {
  fetchFn: typeof fetch;
  signInFn: typeof signIn;
}

const CONSENT_MESSAGE = "É preciso aceitar a política de privacidade para continuar.";
const GENERIC_FORM_MESSAGE = "Verifique os dados informados.";

/**
 * Registers a client through the existing consent-gated API route, then signs
 * the user in automatically via Auth.js credentials. Field-level failures
 * (mismatch, consent, contract) are blocked client-side before any request;
 * server errors are mapped to PT-BR messages per the user-auth spec.
 */
export async function submitRegistration(
  deps: SubmitRegistrationDeps,
  payload: RegistrationPayload,
): Promise<RegistrationResult> {
  if (payload.confirmPassword !== payload.password) {
    return { ok: false, field: "confirmPassword", message: "As senhas não coincidem." };
  }

  if (!payload.consent) {
    return { ok: false, field: "consent", message: CONSENT_MESSAGE };
  }

  const body = {
    email: payload.email,
    password: payload.password,
    name: payload.name,
    phone: payload.phone?.trim() || undefined,
    consent: true,
    consentPolicyVersion: CURRENT_CONSENT_POLICY_VERSION,
  };

  const contract = RegisterInput.safeParse(body);
  if (!contract.success) {
    return { ok: false, field: "form", message: GENERIC_FORM_MESSAGE };
  }

  const response = await deps.fetchFn("/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (response.status === 409) {
    return { ok: false, field: "email", message: "e-mail já cadastrado" };
  }

  if (response.status === 400) {
    let errorCode: string | undefined;
    try {
      const data = (await response.json()) as { error?: string };
      errorCode = data.error;
    } catch {
      errorCode = undefined;
    }
    if (errorCode === "CONSENT_REQUIRED") {
      return { ok: false, field: "consent", message: CONSENT_MESSAGE };
    }
    return { ok: false, field: "form", message: GENERIC_FORM_MESSAGE };
  }

  if (response.status !== 201) {
    return { ok: false, field: "form", message: GENERIC_FORM_MESSAGE };
  }

  const signInResult = await deps.signInFn("credentials", {
    email: payload.email,
    password: payload.password,
    redirect: false,
  });

  if (signInResult?.error) {
    return {
      ok: false,
      field: "form",
      message: "Não foi possível entrar automaticamente. Entre pela tela de login.",
    };
  }

  return { ok: true, destination: sanitizeNextPath(payload.nextPath) };
}

interface RegisterFormProps {
  nextPath: string;
}

type FieldError = Extract<RegistrationResult, { ok: false }>;

const inputClassName =
  "w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-900";

function FieldErrorText({ children }: { children: string }) {
  return <p className="text-sm text-rose-600">{children}</p>;
}

export default function RegisterForm({ nextPath }: RegisterFormProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<FieldError | null>(null);
  const [loading, setLoading] = useState(false);

  const fieldError = (field: FieldError["field"]) =>
    error?.field === field ? error.message : null;

  async function handleSubmit() {
    setLoading(true);
    setError(null);

    const result = await submitRegistration(
      { fetchFn: (input, init) => fetch(input, init), signInFn: signIn },
      { name, email, phone, password, confirmPassword, consent, nextPath },
    );

    if (!result.ok) {
      setError(result);
      setLoading(false);
      return;
    }

    router.replace(result.destination);
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit();
      }}
    >
      <div className="space-y-2 text-left">
        <label className="text-sm font-medium text-slate-700" htmlFor="name">
          Nome
        </label>
        <input
          id="name"
          name="name"
          type="text"
          autoComplete="name"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={inputClassName}
        />
      </div>

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
          className={inputClassName}
          aria-invalid={fieldError("email") ? true : undefined}
          aria-describedby={fieldError("email") ? "email-error" : undefined}
        />
        {fieldError("email") ? (
          <FieldErrorText>{fieldError("email")!}</FieldErrorText>
        ) : null}
      </div>

      <div className="space-y-2 text-left">
        <label className="text-sm font-medium text-slate-700" htmlFor="phone">
          Telefone <span className="font-normal text-slate-400">(opcional)</span>
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          className={inputClassName}
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
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={inputClassName}
          aria-invalid={fieldError("confirmPassword") ? true : undefined}
        />
      </div>

      <div className="space-y-2 text-left">
        <label className="text-sm font-medium text-slate-700" htmlFor="confirm-password">
          Confirmar senha
        </label>
        <input
          id="confirm-password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          className={inputClassName}
          aria-invalid={fieldError("confirmPassword") ? true : undefined}
        />
        {fieldError("confirmPassword") ? (
          <FieldErrorText>{fieldError("confirmPassword")!}</FieldErrorText>
        ) : null}
      </div>

      <div className="space-y-2 text-left">
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="consent"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300"
            aria-invalid={fieldError("consent") ? true : undefined}
          />
          <span>
            Li e aceito a{" "}
            <Link href="/privacidade" className="underline underline-offset-2 hover:text-slate-900">
              política de privacidade
            </Link>{" "}
            (versão {CURRENT_CONSENT_POLICY_VERSION}).
          </span>
        </label>
        {fieldError("consent") ? (
          <FieldErrorText>{fieldError("consent")!}</FieldErrorText>
        ) : null}
      </div>

      {fieldError("form") ? (
        <p role="alert" className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {fieldError("form")!}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {loading ? "Criando conta..." : "Criar conta"}
      </button>
    </form>
  );
}