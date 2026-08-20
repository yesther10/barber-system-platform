import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Services page (admin-dashboard design: services page, D1). Thin server
 * component: `requireAdminPage` guard + server-side `listAdminServices`
 * fetch → `<ServicesManager initialServices=.../>`. The manager module is
 * mocked here (its own behavior is covered by the container suite); this
 * suite proves the page's data flow — the fetched services reach the
 * manager, and a failed server fetch degrades to the empty list.
 */

const adminSession = { user: { id: "u1", role: "barbershop_admin", barbershopId: "bshp_1" } };

const fetchedServices = [
  { id: "svc_1", name: "Corte" },
  { id: "svc_2", name: "Barba" },
];

function mockManager() {
  vi.doMock("./services-manager", () => ({
    default: ({ initialServices }: { initialServices: Array<{ name: string }> }) =>
      createElement(
        "div",
        { "data-testid": "services-manager" },
        initialServices.length === 0
          ? "Nenhum serviço cadastrado ainda."
          : initialServices.map((s) => s.name).join(", "),
      ),
  }));
}

function mockPageDeps(listResult: unknown) {
  vi.doMock("@/lib/auth", () => ({ auth: vi.fn().mockResolvedValue(adminSession) }));
  vi.doMock("next/navigation", () => ({ redirect: vi.fn() }));
  vi.doMock("@/lib/admin-api", () => ({
    listAdminServices: vi.fn().mockResolvedValue(listResult),
  }));
}

describe("services page", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("renders the manager with the services fetched server-side under the admin guard", async () => {
    mockPageDeps({ ok: true, data: fetchedServices });
    mockManager();

    const { default: ServicesPage } = await import("./page");
    const html = renderToStaticMarkup(await ServicesPage());

    expect(html).toContain('data-testid="services-manager"');
    expect(html).toContain("Corte");
    expect(html).toContain("Barba");
  });

  it("renders the PT-BR empty state when the server-side fetch fails", async () => {
    mockPageDeps({ ok: false, code: "NETWORK", message: "Falha" });
    mockManager();

    const { default: ServicesPage } = await import("./page");
    const html = renderToStaticMarkup(await ServicesPage());

    expect(html).toContain("Nenhum serviço cadastrado ainda.");
  });
});