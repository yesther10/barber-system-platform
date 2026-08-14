import { describe, expect, it, vi } from "vitest";
import { submitRegistration, type RegistrationPayload } from "./register-form";

const validPayload: RegistrationPayload = {
  name: "Maria Silva",
  email: "maria@example.com",
  password: "s3nh4-segura",
  confirmPassword: "s3nh4-segura",
  consent: true,
  nextPath: "/booking",
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("submitRegistration", () => {
  it("blocks submission when passwords do not match", async () => {
    const fetchFn = vi.fn();
    const signInFn = vi.fn();

    await expect(
      submitRegistration(
        { fetchFn, signInFn },
        { ...validPayload, confirmPassword: "senha-diferente" },
      ),
    ).resolves.toEqual({
      ok: false,
      field: "confirmPassword",
      message: "As senhas não coincidem.",
    });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(signInFn).not.toHaveBeenCalled();
  });

  it("blocks submission when consent is unchecked", async () => {
    const fetchFn = vi.fn();
    const signInFn = vi.fn();

    await expect(
      submitRegistration(
        { fetchFn, signInFn },
        { ...validPayload, consent: false },
      ),
    ).resolves.toEqual({
      ok: false,
      field: "consent",
      message: "É preciso aceitar a política de privacidade para continuar.",
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("blocks submission when the payload fails the RegisterInput contract", async () => {
    const fetchFn = vi.fn();
    const signInFn = vi.fn();

    await expect(
      submitRegistration(
        { fetchFn, signInFn },
        { ...validPayload, email: "não-é-email" },
      ),
    ).resolves.toEqual({
      ok: false,
      field: "form",
      message: "Verifique os dados informados.",
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("maps a 409 duplicate e-mail to a field error", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ error: "EMAIL_TAKEN" }, 409));
    const signInFn = vi.fn();

    await expect(
      submitRegistration({ fetchFn, signInFn }, validPayload),
    ).resolves.toEqual({
      ok: false,
      field: "email",
      message: "e-mail já cadastrado",
    });
    expect(signInFn).not.toHaveBeenCalled();
  });

  it("maps a 400 consent rejection to a consent field error", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ error: "CONSENT_REQUIRED" }, 400));
    const signInFn = vi.fn();

    await expect(
      submitRegistration({ fetchFn, signInFn }, validPayload),
    ).resolves.toEqual({
      ok: false,
      field: "consent",
      message: "É preciso aceitar a política de privacidade para continuar.",
    });
    expect(signInFn).not.toHaveBeenCalled();
  });

  it("maps an invalid body to a generic form alert", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ error: "INVALID_BODY" }, 400));
    const signInFn = vi.fn();

    await expect(
      submitRegistration({ fetchFn, signInFn }, validPayload),
    ).resolves.toEqual({
      ok: false,
      field: "form",
      message: "Verifique os dados informados.",
    });
    expect(signInFn).not.toHaveBeenCalled();
  });

  it("signs the user in and returns the sanitized destination on 201", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ id: "usr_1" }, 201));
    const signInFn = vi.fn().mockResolvedValue({ ok: true, error: undefined });

    await expect(
      submitRegistration(
        { fetchFn, signInFn },
        { ...validPayload, nextPath: "/booking?step=confirm" },
      ),
    ).resolves.toEqual({ ok: true, destination: "/booking?step=confirm" });
    expect(fetchFn).toHaveBeenCalledWith("/api/auth/register", expect.objectContaining({ method: "POST" }));
    expect(signInFn).toHaveBeenCalledWith("credentials", {
      email: "maria@example.com",
      password: "s3nh4-segura",
      redirect: false,
    });
  });

  it("falls back to the safe default when next is unsafe", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ id: "usr_1" }, 201));
    const signInFn = vi.fn().mockResolvedValue({ ok: true, error: undefined });

    await expect(
      submitRegistration(
        { fetchFn, signInFn },
        { ...validPayload, nextPath: "https://evil.example" },
      ),
    ).resolves.toEqual({ ok: true, destination: "/booking" });
  });

  it("sends the LGPD consent version on the registration payload", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ id: "usr_1" }, 201));
    const signInFn = vi.fn().mockResolvedValue({ ok: true, error: undefined });

    await submitRegistration({ fetchFn, signInFn }, validPayload);

    expect(fetchFn).toHaveBeenCalledWith(
      "/api/auth/register",
      expect.objectContaining({
        body: JSON.stringify({
          email: "maria@example.com",
          password: "s3nh4-segura",
          name: "Maria Silva",
          consent: true,
          consentPolicyVersion: "2026-08-03",
        }),
      }),
    );
  });
});
