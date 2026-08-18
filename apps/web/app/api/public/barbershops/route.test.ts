import { afterEach, describe, expect, it, vi } from "vitest";

describe("public barbershops directory route", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  function getDirectory(url = "https://barber.test/api/public/barbershops"): Promise<Response> {
    return import("./route.js").then(({ GET }) => GET(new Request(url)));
  }

  it("returns listable barbershops as PublicBarbershopView without a session", async () => {
    const listPublicBarbershops = vi.fn().mockResolvedValue([
      { slug: "tesoura-de-ouro", name: "Tesoura de Ouro" },
    ]);
    vi.doMock("@/lib/db", () => ({ getPrisma: () => ({}) }));
    vi.doMock("@/lib/catalog", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@/lib/catalog")>();
      return { ...actual, listPublicBarbershops };
    });

    const response = await getDirectory();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      { slug: "tesoura-de-ouro", name: "Tesoura de Ouro" },
    ]);
    expect(listPublicBarbershops).toHaveBeenCalledWith({});
  });

  it("returns 200 with an empty array when no barbershop is listable", async () => {
    vi.doMock("@/lib/db", () => ({ getPrisma: () => ({}) }));
    vi.doMock("@/lib/catalog", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@/lib/catalog")>();
      return { ...actual, listPublicBarbershops: vi.fn().mockResolvedValue([]) };
    });

    const response = await getDirectory();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([]);
  });

  it("propagates unexpected service errors so Next.js returns 500", async () => {
    vi.doMock("@/lib/db", () => ({ getPrisma: () => ({}) }));
    vi.doMock("@/lib/catalog", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@/lib/catalog")>();
      return {
        ...actual,
        listPublicBarbershops: vi.fn().mockRejectedValue(new Error("db boom")),
      };
    });

    await expect(getDirectory()).rejects.toThrow("db boom");
  });
});
