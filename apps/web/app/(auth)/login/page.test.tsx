import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

class RedirectError extends Error {
  constructor(readonly location: string) {
    super(`redirect:${location}`);
  }
}

function mockNextLink() {
  vi.doMock("next/link", () => ({
    default: ({ href, children }: { href: string; children: unknown }) =>
      createElement("a", { href }, children as never),
  }));
}

describe("login page", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("renders the guest page with a sanitized next path", async () => {
    vi.doMock("@/lib/auth", () => ({ auth: vi.fn().mockResolvedValue(null) }));
    vi.doMock("@/lib/auth.config", () => ({ authConfig: { providers: [] } }));
    vi.doMock("next/navigation", () => ({ redirect: vi.fn() }));
    mockNextLink();
    vi.doMock("./login-form", () => ({
      default: ({ nextPath, googleEnabled }: { nextPath: string; googleEnabled: boolean }) =>
        createElement("mock-login-form", {
          "data-next-path": nextPath,
          "data-google-enabled": String(googleEnabled),
        }),
    }));

    const { default: LoginPage } = await import("./page");
    const html = renderToStaticMarkup(
      await LoginPage({ searchParams: Promise.resolve({ next: "https://evil.example" }) }),
    );

    expect(html).toContain('data-next-path="/booking"');
    expect(html).toContain('data-google-enabled="false"');
  });

  it("redirects authenticated users away from the guest login flow", async () => {
    const redirect = vi.fn((location: string) => {
      throw new RedirectError(location);
    });

    vi.doMock("@/lib/auth", () => ({
      auth: vi.fn().mockResolvedValue({ user: { id: "usr_1", role: "client", barbershopId: null } }),
    }));
    vi.doMock("@/lib/auth.config", () => ({ authConfig: { providers: [{ id: "google" }] } }));
    vi.doMock("next/navigation", () => ({ redirect }));
    mockNextLink();
    vi.doMock("./login-form", () => ({
      default: () => createElement("mock-login-form"),
    }));

    const { default: LoginPage } = await import("./page");

    await expect(
      LoginPage({ searchParams: Promise.resolve({ next: "/dashboard" }) }),
    ).rejects.toMatchObject({ location: "/dashboard" });
    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });

  it("hides the Google action when the provider is unavailable", async () => {
    vi.doMock("@/lib/auth", () => ({ auth: vi.fn().mockResolvedValue(null) }));
    vi.doMock("@/lib/auth.config", () => ({ authConfig: { providers: [] } }));
    vi.doMock("next/navigation", () => ({ redirect: vi.fn() }));
    mockNextLink();
    vi.doMock("./login-form", () => ({
      default: ({ googleEnabled }: { googleEnabled: boolean }) =>
        createElement("mock-login-form", {
          "data-google-enabled": String(googleEnabled),
        }),
    }));

    const { default: LoginPage } = await import("./page");
    const html = renderToStaticMarkup(await LoginPage({ searchParams: Promise.resolve({}) }));

    expect(html).toContain('data-google-enabled="false"');
  });

  it("offers a create-account link to /register below the form", async () => {
    vi.doMock("@/lib/auth", () => ({ auth: vi.fn().mockResolvedValue(null) }));
    vi.doMock("@/lib/auth.config", () => ({ authConfig: { providers: [] } }));
    vi.doMock("next/navigation", () => ({ redirect: vi.fn() }));
    mockNextLink();
    vi.doMock("./login-form", () => ({
      default: () => createElement("mock-login-form"),
    }));

    const { default: LoginPage } = await import("./page");
    const html = renderToStaticMarkup(await LoginPage({ searchParams: Promise.resolve({}) }));

    expect(html).toContain('href="/register"');
    expect(html).toContain("Criar conta");
    expect(html.indexOf("mock-login-form")).toBeLessThan(html.indexOf('href="/register"'));
  });
});