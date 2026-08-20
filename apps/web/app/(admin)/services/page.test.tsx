import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Services page (admin-dashboard design: services page, D1). Thin server
 * component following the dashboard-home pattern (D2): `requireAdminPage`
 * guard + server-side `listServices(db, barbershopId, {includeInactive})`
 * → `<ServicesManager initialServices=.../>`. The manager module is mocked
 * here (its own behavior is covered by the container suite); this suite
 * proves the page's data flow — the loaded services reach the manager, and
 * a tenant with no services reaches the PT-BR empty state.
 */

const adminSession = { user: { id: "u1", role: "barbershop_admin", barbershopId: "bshp_1" } };

const loadedServices = [
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
  vi.doMock("@/lib/db", () => ({ getPrisma: vi.fn() }));
  vi.doMock("@/lib/catalog", () => ({
    listServices: vi.fn().mockResolvedValue(listResult),
  }));
}

describe("services page", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("renders the manager with the services loaded server-side under the admin guard", async () => {
    mockPageDeps(loadedServices);
    mockManager();

    const { default: ServicesPage } = await import("./page");
    const html = renderToStaticMarkup(await ServicesPage());

    expect(html).toContain('data-testid="services-manager"');
    expect(html).toContain("Corte");
    expect(html).toContain("Barba");
  });

  it("renders the PT-BR empty state when the tenant has no services", async () => {
    mockPageDeps([]);
    mockManager();

    const { default: ServicesPage } = await import("./page");
    const html = renderToStaticMarkup(await ServicesPage());

    expect(html).toContain("Nenhum serviço cadastrado ainda.");
  });
});