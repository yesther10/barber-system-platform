import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

class RedirectError extends Error {
  constructor(readonly location: string) {
    super(`redirect:${location}`);
  }
}

describe("register page", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("renders the guest page with a sanitized next path", async () => {
    vi.doMock("@/lib/auth", () => ({ auth: vi.fn().mockResolvedValue(null) }));
    vi.doMock("next/navigation", () => ({ redirect: vi.fn() }));
    vi.doMock("./register-form", () => ({
      default: ({ nextPath }: { nextPath: string }) =>
        createElement("mock-register-form", { "data-next-path": nextPath }),
    }));

    const { default: RegisterPage } = await import("./page");
    const html = renderToStaticMarkup(
      await RegisterPage({ searchParams: Promise.resolve({ next: "https://evil.example" }) }),
    );

    expect(html).toContain('data-next-path="/booking"');
  });

  it("passes a safe internal next path to the form untouched", async () => {
    vi.doMock("@/lib/auth", () => ({ auth: vi.fn().mockResolvedValue(null) }));
    vi.doMock("next/navigation", () => ({ redirect: vi.fn() }));
    vi.doMock("./register-form", () => ({
      default: ({ nextPath }: { nextPath: string }) =>
        createElement("mock-register-form", { "data-next-path": nextPath }),
    }));

    const { default: RegisterPage } = await import("./page");
    const html = renderToStaticMarkup(
      await RegisterPage({ searchParams: Promise.resolve({ next: "/booking?step=confirm" }) }),
    );

    expect(html).toContain('data-next-path="/booking?step=confirm"');
  });

  it("redirects authenticated users away from the registration flow", async () => {
    const redirect = vi.fn((location: string) => {
      throw new RedirectError(location);
    });

    vi.doMock("@/lib/auth", () => ({
      auth: vi.fn().mockResolvedValue({ user: { id: "usr_1", role: "client", barbershopId: null } }),
    }));
    vi.doMock("next/navigation", () => ({ redirect }));
    vi.doMock("./register-form", () => ({
      default: () => createElement("mock-register-form"),
    }));

    const { default: RegisterPage } = await import("./page");

    await expect(
      RegisterPage({ searchParams: Promise.resolve({ next: "/dashboard" }) }),
    ).rejects.toMatchObject({ location: "/dashboard" });
    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });
});
