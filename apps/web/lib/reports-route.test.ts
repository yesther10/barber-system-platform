import { afterEach, describe, expect, it, vi } from "vitest";

describe("admin reports route", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns CSV with UTF-8 BOM for admin downloads", async () => {
    vi.doMock("@/lib/auth", () => ({
      auth: vi.fn().mockResolvedValue({ user: { role: "barbershop_admin", barbershopId: "shop_1" } }),
    }));
    vi.doMock("@/lib/db", () => ({ getPrisma: () => ({}) }));
    vi.doMock("@/lib/route-auth", () => ({ guardAdmin: vi.fn().mockReturnValue({ ok: true, barbershopId: "shop_1" }) }));
    vi.doMock("@/lib/onboarding", () => ({
      TenantNotFoundError: class TenantNotFoundError extends Error {
        code = "TENANT_NOT_FOUND" as const;
      },
    }));
    vi.doMock("@/lib/reporting", () => ({
      generateReport: vi.fn().mockResolvedValue({
        from: "2026-10-01",
        to: "2026-10-07",
        rows: [
          {
            groupKey: "Carlos",
            total: 2,
            pending: 0,
            confirmed: 1,
            completed: 1,
            cancelled: 0,
            completionRate: 0.5,
            cancellationRate: 0,
            revenueBRL: 90,
          },
        ],
      }),
      renderReportCsv: vi.fn().mockReturnValue("\uFEFFgroup,total\nCarlos,2\n"),
      ReportInvalidInputError: class ReportInvalidInputError extends Error {
        code = "INVALID_INPUT" as const;
      },
    }));

    const { GET } = await import("../app/api/admin/reports/route.js");
    const response = await GET(new Request("https://barber.test/api/admin/reports?from=2026-10-01&to=2026-10-07&format=csv"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/csv");
    expect(response.headers.get("content-disposition")).toContain('filename="report-2026-10-01-2026-10-07.csv"');
    await expect(response.text()).resolves.toBe("group,total\nCarlos,2\n");
  });

  it("rejects malformed queries with 400", async () => {
    const ReportInvalidInputError = class ReportInvalidInputError extends Error {
      code = "INVALID_INPUT" as const;
    };

    vi.doMock("@/lib/auth", () => ({
      auth: vi.fn().mockResolvedValue({ user: { role: "barbershop_admin", barbershopId: "shop_1" } }),
    }));
    vi.doMock("@/lib/db", () => ({ getPrisma: () => ({}) }));
    vi.doMock("@/lib/route-auth", () => ({ guardAdmin: vi.fn().mockReturnValue({ ok: true, barbershopId: "shop_1" }) }));
    vi.doMock("@/lib/onboarding", () => ({
      TenantNotFoundError: class TenantNotFoundError extends Error {
        code = "TENANT_NOT_FOUND" as const;
      },
    }));
    vi.doMock("@/lib/reporting", () => ({
      generateReport: vi.fn().mockRejectedValue(new ReportInvalidInputError()),
      renderReportCsv: vi.fn(),
      ReportInvalidInputError,
    }));

    const { GET } = await import("../app/api/admin/reports/route.js");
    const response = await GET(new Request("https://barber.test/api/admin/reports?from=10-01-2026&to=2026-10-07"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "INVALID_INPUT" });
  });
});
