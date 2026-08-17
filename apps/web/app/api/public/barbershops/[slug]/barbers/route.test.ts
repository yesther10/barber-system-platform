import { afterEach, describe, expect, it, vi } from "vitest";

describe("public barbers route", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  function getBarbers(
    url: string,
    slug: string,
  ): Promise<Response> {
    return import("./route.js").then(({ GET }) =>
      GET(new Request(url), { params: Promise.resolve({ slug }) }),
    );
  }

  it("returns service-assigned barbers as PublicBarberView", async () => {
    const getPublicBarbersByService = vi.fn().mockResolvedValue([
      { id: "brb_1", specialties: ["corte"], bio: "Especialista", active: true },
    ]);
    vi.doMock("@/lib/db", () => ({ getPrisma: () => ({}) }));
    vi.doMock("@/lib/catalog", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@/lib/catalog")>();
      return { ...actual, getPublicBarbersByService };
    });

    const response = await getBarbers(
      "https://barber.test/api/public/barbershops/tesoura/barbers?serviceId=svc_1",
      "tesoura",
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      { id: "brb_1", specialties: ["corte"], bio: "Especialista", active: true },
    ]);
    expect(getPublicBarbersByService).toHaveBeenCalledWith({}, "tesoura", "svc_1");
  });

  it("returns 400 INVALID_INPUT for a missing or empty serviceId", async () => {
    const getPublicBarbersByService = vi.fn();
    vi.doMock("@/lib/db", () => ({ getPrisma: () => ({}) }));
    vi.doMock("@/lib/catalog", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@/lib/catalog")>();
      return { ...actual, getPublicBarbersByService };
    });

    const missing = await getBarbers(
      "https://barber.test/api/public/barbershops/tesoura/barbers",
      "tesoura",
    );
    expect(missing.status).toBe(400);
    await expect(missing.json()).resolves.toEqual({ error: "INVALID_INPUT" });

    const empty = await getBarbers(
      "https://barber.test/api/public/barbershops/tesoura/barbers?serviceId=",
      "tesoura",
    );
    expect(empty.status).toBe(400);
    expect(getPublicBarbersByService).not.toHaveBeenCalled();
  });

  it("maps TENANT_NOT_FOUND and SERVICE_NOT_FOUND to 404", async () => {
    vi.doMock("@/lib/db", () => ({ getPrisma: () => ({}) }));
    vi.doMock("@/lib/catalog", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@/lib/catalog")>();
      const tenant = await import("@/lib/onboarding");
      return {
        ...actual,
        getPublicBarbersByService: vi.fn().mockRejectedValue(new tenant.TenantNotFoundError()),
      };
    });

    const tenant404 = await getBarbers(
      "https://barber.test/api/public/barbershops/nao-existe/barbers?serviceId=svc_1",
      "nao-existe",
    );
    expect(tenant404.status).toBe(404);
    await expect(tenant404.json()).resolves.toEqual({ error: "TENANT_NOT_FOUND" });

    vi.resetModules();
    vi.doMock("@/lib/db", () => ({ getPrisma: () => ({}) }));
    vi.doMock("@/lib/catalog", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@/lib/catalog")>();
      return {
        ...actual,
        getPublicBarbersByService: vi.fn().mockRejectedValue(new actual.ServiceNotFoundError()),
      };
    });

    const service404 = await getBarbers(
      "https://barber.test/api/public/barbershops/tesoura/barbers?serviceId=svc-inativa",
      "tesoura",
    );
    expect(service404.status).toBe(404);
    await expect(service404.json()).resolves.toEqual({ error: "SERVICE_NOT_FOUND" });
  });
});