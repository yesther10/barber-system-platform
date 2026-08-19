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
    default: ({
      href,
      "aria-current": ariaCurrent,
      children,
    }: {
      href: string;
      "aria-current"?: string;
      children: unknown;
    }) => createElement("a", { href, "aria-current": ariaCurrent }, children as never),
  }));
}

describe("(admin) layout guard", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("redirects guests to /login with the requested admin path as next", async () => {
    const redirect = vi.fn((location: string) => {
      throw new RedirectError(location);
    });

    vi.doMock("@/lib/auth", () => ({ auth: vi.fn().mockResolvedValue(null) }));
    vi.doMock("next-auth/react", () => ({ signOut: vi.fn() }));
    vi.doMock("next/navigation", () => ({ redirect, usePathname: () => "/dashboard" }));
    vi.doMock("next/headers", () => ({
      headers: async () => new Headers({ "x-pathname": "/services" }),
    }));
    mockNextLink();

    const { default: AdminLayout } = await import("./layout");
    const children = createElement("main", null, "admin content");

    await expect(AdminLayout({ children })).rejects.toMatchObject({ location: "/login?next=%2Fservices" });
    expect(redirect).toHaveBeenCalledWith("/login?next=%2Fservices");
  });

  it("blocks non-admin sessions and redirects to /", async () => {
    const redirect = vi.fn((location: string) => {
      throw new RedirectError(location);
    });

    vi.doMock("@/lib/auth", () => ({
      auth: vi.fn().mockResolvedValue({ user: { id: "u2", role: "client", barbershopId: null } }),
    }));
    vi.doMock("next-auth/react", () => ({ signOut: vi.fn() }));
    vi.doMock("next/navigation", () => ({ redirect, usePathname: () => "/dashboard" }));
    vi.doMock("next/headers", () => ({
      headers: async () => new Headers({ "x-pathname": "/services" }),
    }));
    mockNextLink();

    const { default: AdminLayout } = await import("./layout");
    const children = createElement("main", null, "admin content");

    await expect(AdminLayout({ children })).rejects.toMatchObject({ location: "/" });
    expect(redirect).toHaveBeenCalledWith("/");
  });

  it("renders the nav with 7 links and children for an authorized admin", async () => {
    vi.doMock("@/lib/auth", () => ({
      auth: vi.fn().mockResolvedValue({
        user: { id: "u1", role: "barbershop_admin", barbershopId: "bshp_1" },
      }),
    }));
    vi.doMock("next-auth/react", () => ({ signOut: vi.fn() }));
    vi.doMock("next/navigation", () => ({ redirect: vi.fn(), usePathname: () => "/services" }));
    vi.doMock("next/headers", () => ({
      headers: async () => new Headers({ "x-pathname": "/services" }),
    }));
    mockNextLink();

    const { default: AdminLayout } = await import("./layout");
    const children = createElement("main", null, "admin content");

    const html = renderToStaticMarkup(await AdminLayout({ children }));

    expect(html).toContain("admin content");

    const navLabels = ["Início", "Serviços", "Barbeiros", "Horários", "Relatórios", "Convites", "Agenda"];
    for (const label of navLabels) {
      expect(html).toContain(label);
    }

    expect(html).toContain("Sair");
    expect(html).toContain('aria-label="Sair da conta"');
    expect(html).toContain('aria-label="Navegação do painel administrativo"');

    // Active state follows usePathname ("/services") — exactly one link marked.
    expect(html).toContain('aria-current="page"');
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);

    // Exceptions stays reachable from the Schedules page (design D6), not the nav.
    expect(html).not.toContain('href="/exceptions"');
    expect(html).not.toContain("/login?next=");
  });
});