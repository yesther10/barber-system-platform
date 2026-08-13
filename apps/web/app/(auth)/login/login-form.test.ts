import { describe, expect, it, vi } from "vitest";
import { submitCredentials } from "./login-form";

describe("submitCredentials", () => {
  it("validates required credentials before calling signIn", async () => {
    const signIn = vi.fn();

    await expect(
      submitCredentials(signIn, { email: "", password: "", nextPath: "/booking" }),
    ).resolves.toEqual({ ok: false, error: "Informá e-mail e senha." });
    expect(signIn).not.toHaveBeenCalled();
  });

  it("shows a clear inline error for invalid credentials", async () => {
    const signIn = vi.fn().mockResolvedValue({ error: "CredentialsSignin" });

    await expect(
      submitCredentials(signIn, {
        email: "maria@example.com",
        password: "senha-errada",
        nextPath: "/booking",
      }),
    ).resolves.toEqual({ ok: false, error: "E-mail ou senha inválidos." });
    expect(signIn).toHaveBeenCalledWith("credentials", {
      email: "maria@example.com",
      password: "senha-errada",
      redirect: false,
    });
  });

  it("returns the sanitized destination after a successful sign-in", async () => {
    const signIn = vi.fn().mockResolvedValue({ ok: true, error: undefined });

    await expect(
      submitCredentials(signIn, {
        email: "maria@example.com",
        password: "s3nh4-segura",
        nextPath: "/booking?step=confirm",
      }),
    ).resolves.toEqual({ ok: true, destination: "/booking?step=confirm" });
  });

  it("passes redirect false to Auth.js so the client can control the post-login redirect", async () => {
    const signIn = vi.fn().mockResolvedValue({ ok: true, error: undefined });

    await submitCredentials(signIn, {
      email: "maria@example.com",
      password: "s3nh4-segura",
      nextPath: "/booking",
    });

    expect(signIn).toHaveBeenCalledWith("credentials", {
      email: "maria@example.com",
      password: "s3nh4-segura",
      redirect: false,
    });
  });
});
