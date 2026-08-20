import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

function mockNextLink() {
  vi.doMock("next/link", () => ({
    default: ({ href, children }: { href: string; children: unknown }) =>
      createElement("a", { href }, children as never),
  }));
}

const adminSession = { user: { id: "u1", role: "barbershop_admin", barbershopId: "bshp_1" } };

const incompleteSnapshot = {
  serviceCount: 0,
  barberCount: 0,
  scheduleCount: 0,
  pixProvider: null,
  confirmationMode: "MANUAL",
  lateCancelPolicy: "ALLOW",
  freeCancelWindowHours: 48,
  rescheduleWindowHours: 12,
  reminderLeadHours: 24,
};

function mockAuthAndDb() {
  vi.doMock("@/lib/auth", () => ({ auth: vi.fn().mockResolvedValue(adminSession) }));
  vi.doMock("next/navigation", () => ({ redirect: vi.fn() }));
  vi.doMock("@/lib/db", () => ({ getPrisma: vi.fn() }));
  vi.doMock("@/lib/onboarding", async () => {
    const actual = await vi.importActual<typeof import("@/lib/onboarding")>("@/lib/onboarding");
    return { ...actual, getOnboardingSnapshot: vi.fn().mockResolvedValue(incompleteSnapshot) };
  });
}

const zeroedDay = {
  groupKey: "all",
  total: 0,
  pending: 0,
  confirmed: 0,
  completed: 0,
  cancelled: 0,
  completionRate: 0,
  cancellationRate: 0,
  revenueBRL: 0,
};

const busyDay = {
  ...zeroedDay,
  total: 3,
  pending: 1,
  confirmed: 2,
  revenueBRL: 45,
};

describe("dashboard home", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("renders the onboarding card with the missing areas for an incomplete tenant", async () => {
    mockAuthAndDb();
    vi.doMock("@/lib/reporting", () => ({
      generateReport: vi.fn().mockResolvedValue({ from: "2026-08-19", to: "2026-08-19", rows: [busyDay] }),
    }));
    mockNextLink();

    const { default: DashboardPage } = await import("./page");
    const html = renderToStaticMarkup(await DashboardPage());

    expect(html).toContain("Para começar a receber agendamentos, complete:");
    expect(html).toContain('href="/services"');
    expect(html).toContain('href="/barbers"');
    expect(html).toContain('href="/schedules"');
    expect(html).toContain("Pix");
  });

  it("renders zeroed day metrics without error for a day with no appointments", async () => {
    mockAuthAndDb();
    vi.doMock("@/lib/reporting", () => ({
      generateReport: vi.fn().mockResolvedValue({ from: "2026-08-19", to: "2026-08-19", rows: [zeroedDay] }),
    }));
    mockNextLink();

    const { default: DashboardPage } = await import("./page");
    const html = renderToStaticMarkup(await DashboardPage());

    expect(html).toContain("Agendamentos hoje");
    expect(html).toContain("Confirmações pendentes");
    expect(html).toContain("Faturamento hoje");
    expect(html).toContain("0,00"); // revenue tile renders the BRL zero
    expect(html).toContain("Nenhum agendamento para hoje ainda.");
  });

  it("hides the empty-day note and formats revenue when the day has data", async () => {
    mockAuthAndDb();
    vi.doMock("@/lib/reporting", () => ({
      generateReport: vi.fn().mockResolvedValue({ from: "2026-08-19", to: "2026-08-19", rows: [busyDay] }),
    }));
    mockNextLink();

    const { default: DashboardPage } = await import("./page");
    const html = renderToStaticMarkup(await DashboardPage());

    expect(html).toContain("45,00"); // revenue formatted in BRL
    expect(html).not.toContain("Nenhum agendamento para hoje ainda.");
  });
});