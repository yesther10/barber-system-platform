import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Unit tests for GET /api/admin/barbers/:id/services — the read-only
 * assignment matrix route (catalog delta). Uses the reports-route.test.ts
 * vi.doMock pattern: auth/db/catalog are mocked so every branch (200 mixed,
 * 200 all-unassigned, 404 unknown/foreign, 401/403 guard, read-only proof)
 * runs without a database.
 */
describe("admin barber assignment matrix route", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  const mixedMatrix = [
    { serviceId: "svc_1", name: "Corte", assigned: true },
    { serviceId: "svc_2", name: "Barba", assigned: false },
    { serviceId: "svc_3", name: "Sobrancelha", assigned: true },
  ];

  /**
   * Installs the route's module mocks. `notFound` makes the matrix lib
   * reject with the SAME BarberNotFoundError class the route imports, so
   * the 404 branch is exercised for real.
   */
  function mockDeps(opts: {
    guard?: { ok: boolean; status?: number; code?: string; barbershopId?: string };
    matrix?: typeof mixedMatrix;
    notFound?: boolean;
  }) {
    const auth = vi.fn().mockResolvedValue({ user: { role: "barbershop_admin", barbershopId: "shop_1" } });
    const guardAdmin = vi.fn().mockReturnValue(
      opts.guard ?? { ok: true, status: 200, code: "", barbershopId: "shop_1" },
    );
    const BarberNotFoundError = class BarberNotFoundError extends Error {
      code = "BARBER_NOT_FOUND" as const;
    };
    const getBarberAssignmentMatrix = vi.fn().mockImplementation(() =>
      opts.notFound ? Promise.reject(new BarberNotFoundError()) : Promise.resolve(opts.matrix ?? []),
    );
    // mutation-capable catalog functions — the route must never call them
    const assignServiceToBarber = vi.fn();
    const unassignServiceFromBarber = vi.fn();
    const createBarber = vi.fn();
    const updateBarber = vi.fn();

    vi.doMock("@/lib/auth", () => ({ auth }));
    vi.doMock("@/lib/db", () => ({ getPrisma: () => ({}) }));
    vi.doMock("@/lib/route-auth", () => ({ guardAdmin }));
    vi.doMock("@/lib/catalog", () => ({
      getBarberAssignmentMatrix,
      BarberNotFoundError,
      assignServiceToBarber,
      unassignServiceFromBarber,
      createBarber,
      updateBarber,
    }));

    return {
      getBarberAssignmentMatrix,
      assignServiceToBarber,
      unassignServiceFromBarber,
      createBarber,
      updateBarber,
    };
  }

  function getMatrix(id: string): Promise<Response> {
    return import("./route.js").then(({ GET }) =>
      GET(new Request(`https://barber.test/api/admin/barbers/${id}/services`), {
        params: Promise.resolve({ id }),
      }),
    );
  }

  it("returns 200 with a mixed assignment matrix for the tenant barber", async () => {
    mockDeps({ matrix: mixedMatrix });

    const response = await getMatrix("brb_1");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(mixedMatrix);
  });

  it("returns 200 with every service unassigned for a barber with no assignments", async () => {
    mockDeps({
      matrix: [
        { serviceId: "svc_1", name: "Corte", assigned: false },
        { serviceId: "svc_2", name: "Barba", assigned: false },
      ],
    });

    const response = await getMatrix("brb_1");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      { serviceId: "svc_1", name: "Corte", assigned: false },
      { serviceId: "svc_2", name: "Barba", assigned: false },
    ]);
  });

  it("returns 404 BARBER_NOT_FOUND for an unknown or foreign barber", async () => {
    mockDeps({ notFound: true });

    const response = await getMatrix("brb_estranho");

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "BARBER_NOT_FOUND" });
  });

  it("returns 401 SESSION_REQUIRED without a session and never reads the matrix", async () => {
    const getBarberAssignmentMatrix = vi.fn();
    const BarberNotFoundError = class BarberNotFoundError extends Error {
      code = "BARBER_NOT_FOUND" as const;
    };
    vi.doMock("@/lib/auth", () => ({ auth: vi.fn().mockResolvedValue(null) }));
    vi.doMock("@/lib/db", () => ({ getPrisma: () => ({}) }));
    vi.doMock("@/lib/route-auth", () => ({
      guardAdmin: vi.fn().mockReturnValue({ ok: false, status: 401, code: "SESSION_REQUIRED" }),
    }));
    vi.doMock("@/lib/catalog", () => ({ getBarberAssignmentMatrix, BarberNotFoundError }));

    const response = await getMatrix("brb_1");

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "SESSION_REQUIRED" });
    expect(getBarberAssignmentMatrix).not.toHaveBeenCalled();
  });

  it("returns 403 FORBIDDEN_ROLE for a non-admin session", async () => {
    const getBarberAssignmentMatrix = vi.fn();
    const BarberNotFoundError = class BarberNotFoundError extends Error {
      code = "BARBER_NOT_FOUND" as const;
    };
    vi.doMock("@/lib/auth", () => ({ auth: vi.fn().mockResolvedValue({ user: { role: "client" } }) }));
    vi.doMock("@/lib/db", () => ({ getPrisma: () => ({}) }));
    vi.doMock("@/lib/route-auth", () => ({
      guardAdmin: vi.fn().mockReturnValue({ ok: false, status: 403, code: "FORBIDDEN_ROLE" }),
    }));
    vi.doMock("@/lib/catalog", () => ({ getBarberAssignmentMatrix, BarberNotFoundError }));

    const response = await getMatrix("brb_1");

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "FORBIDDEN_ROLE" });
  });

  it("is read-only: the GET never calls any assignment mutation function", async () => {
    const { getBarberAssignmentMatrix, assignServiceToBarber, unassignServiceFromBarber, createBarber, updateBarber } =
      mockDeps({ matrix: mixedMatrix });

    const response = await getMatrix("brb_1");

    expect(response.status).toBe(200);
    expect(getBarberAssignmentMatrix).toHaveBeenCalledTimes(1);
    expect(assignServiceToBarber).not.toHaveBeenCalled();
    expect(unassignServiceFromBarber).not.toHaveBeenCalled();
    expect(createBarber).not.toHaveBeenCalled();
    expect(updateBarber).not.toHaveBeenCalled();
  });
});