import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

describe("booking page", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("passes the search params through to the booking flow as a selection", async () => {
    vi.doMock("./booking-flow", () => ({
      BookingFlow: ({ selection }: { selection: { slug: string; serviceId?: string } }) =>
        createElement("mock-booking-flow", {
          "data-slug": selection.slug,
          "data-service-id": selection.serviceId ?? "",
        }),
    }));

    const { default: BookingPage } = await import("./page");
    const html = renderToStaticMarkup(
      await BookingPage({
        searchParams: Promise.resolve({ slug: "tesoura", serviceId: "svc_1" }),
      }),
    );

    expect(html).toContain('data-slug="tesoura"');
    expect(html).toContain('data-service-id="svc_1"');
  });

  it("handles an empty selection (no slug) without crashing", async () => {
    vi.doMock("./booking-flow", () => ({
      BookingFlow: ({ selection }: { selection: { slug: string } }) =>
        createElement("mock-booking-flow", { "data-slug": selection.slug }),
    }));

    const { default: BookingPage } = await import("./page");
    const html = renderToStaticMarkup(await BookingPage({ searchParams: Promise.resolve({}) }));

    expect(html).toContain('data-slug=""');
  });

  it("keeps the full selection in the URL-driven handoff (all params)", async () => {
    vi.doMock("./booking-flow", () => ({
      BookingFlow: ({ selection }: { selection: Record<string, string> }) =>
        createElement("mock-booking-flow", {
          "data-selection": JSON.stringify(selection),
        }),
    }));

    const { default: BookingPage } = await import("./page");
    const html = renderToStaticMarkup(
      await BookingPage({
        searchParams: Promise.resolve({
          slug: "tesoura",
          serviceId: "svc_1",
          barberId: "brb_1",
          date: "2026-08-20",
          slot: "2026-08-20T12:00:00.000Z",
        }),
      }),
    );

    expect(html).toContain('data-selection="{&quot;slug&quot;:&quot;tesoura&quot;');
    expect(html).toContain('&quot;slot&quot;:&quot;2026-08-20T12:00:00.000Z&quot;}');
  });
});