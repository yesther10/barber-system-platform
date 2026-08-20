import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { OnboardingSnapshot } from "@/lib/onboarding";

function mockNextLink() {
  vi.doMock("next/link", () => ({
    default: ({ href, children }: { href: string; children: unknown }) =>
      createElement("a", { href }, children as never),
  }));
}

const snapshot: OnboardingSnapshot = {
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

describe("onboarding card", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("lists each missing setup area with a link to its admin page", async () => {
    vi.doMock("@/lib/onboarding", () => ({
      onboardingStatus: vi.fn().mockReturnValue({
        complete: false,
        missing: ["services", "barbers", "schedules"],
        nextStep: "services",
      }),
    }));
    mockNextLink();

    const { OnboardingCard } = await import("./onboarding-card");
    const html = renderToStaticMarkup(createElement(OnboardingCard, { snapshot }));

    expect(html).toContain("Para começar a receber agendamentos, complete:");
    expect(html).toContain('href="/services"');
    expect(html).toContain('href="/barbers"');
    expect(html).toContain('href="/schedules"');
    expect(html).toContain("Próximo passo");
  });

  it("renders a completion state when the tenant is fully set up", async () => {
    vi.doMock("@/lib/onboarding", () => ({
      onboardingStatus: vi.fn().mockReturnValue({ complete: true, missing: [], nextStep: null }),
    }));
    mockNextLink();

    const { OnboardingCard } = await import("./onboarding-card");
    const html = renderToStaticMarkup(createElement(OnboardingCard, { snapshot }));

    expect(html).toContain("Configuração completa");
    expect(html).toContain("Sua barbearia está pronta para receber agendamentos.");
    expect(html).not.toContain("Para começar a receber agendamentos, complete:");
    expect(html).not.toContain("Próximo passo");
  });

  it("renders the pix area as plain text when no setup page exists", async () => {
    vi.doMock("@/lib/onboarding", () => ({
      onboardingStatus: vi.fn().mockReturnValue({
        complete: false,
        missing: ["pix"],
        nextStep: "pix",
      }),
    }));
    mockNextLink();

    const { OnboardingCard } = await import("./onboarding-card");
    const html = renderToStaticMarkup(createElement(OnboardingCard, { snapshot }));

    expect(html).toContain("Pix");
    expect(html).not.toContain('href="/pix"');
  });
});