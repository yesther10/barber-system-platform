import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  BarbersStep,
  BookingFlow,
  DateSlotStep,
  ServicesStep,
  barbersErrorForRender,
  barbersForRender,
  slotsErrorForRender,
  slotsFetchParams,
  slotsForRender,
} from "./booking-flow";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

describe("presentational steps (PT-BR empty states)", () => {
  it("services step shows the empty state when no services", () => {
    const html = renderToStaticMarkup(
      <ServicesStep services={[]} onSelect={() => undefined} />,
    );

    expect(html).toContain("Nenhum serviço disponível no momento.");
  });

  it("services step lists service names and prices", () => {
    const html = renderToStaticMarkup(
      <ServicesStep
        services={[
          {
            id: "svc_1",
            name: "Corte",
            description: "Tesoura e máquina",
            priceBRL: 45,
            durationMinutes: 30,
            active: true,
            createdAt: "2026-08-01T00:00:00.000Z",
            updatedAt: "2026-08-01T00:00:00.000Z",
          },
        ]}
        onSelect={() => undefined}
      />,
    );

    expect(html).toContain("Corte");
    expect(html).toContain("R$ 45");
  });

  it("barbers step shows the empty state when no barbers", () => {
    const html = renderToStaticMarkup(
      <BarbersStep barbers={[]} onSelect={() => undefined} />,
    );

    expect(html).toContain("Nenhum barbeiro disponível para este serviço.");
  });

  it("barbers step lists specialties", () => {
    const html = renderToStaticMarkup(
      <BarbersStep
        barbers={[
          { id: "brb_1", specialties: ["corte", "barba"], bio: "Especialista", active: true },
        ]}
        onSelect={() => undefined}
      />,
    );

    expect(html).toContain("corte");
    expect(html).toContain("barba");
  });

  it("date-slot step prompts for a date when none is selected", () => {
    const html = renderToStaticMarkup(
      <DateSlotStep
        date={undefined}
        today="2026-08-14"
        slots={undefined}
        selectedSlot={undefined}
        onSelectDate={() => undefined}
        onSelectSlot={() => undefined}
      />,
    );

    expect(html).toContain("Selecione uma data");
  });

  it("date-slot step blocks past dates client-side via the input min", () => {
    const html = renderToStaticMarkup(
      <DateSlotStep
        date={undefined}
        today="2026-08-14"
        slots={undefined}
        selectedSlot={undefined}
        onSelectDate={() => undefined}
        onSelectSlot={() => undefined}
      />,
    );

    expect(html).toContain('type="date"');
    expect(html).toContain('min="2026-08-14"');
  });

  it("date-slot step renders slots in BR timezone", () => {
    const html = renderToStaticMarkup(
      <DateSlotStep
        date="2026-08-20"
        today="2026-08-14"
        slots={["2026-08-20T12:00:00.000Z", "2026-08-20T13:30:00.000Z"]}
        selectedSlot={undefined}
        onSelectDate={() => undefined}
        onSelectSlot={() => undefined}
      />,
    );

    expect(html).toContain("09:00");
    expect(html).toContain("10:30");
  });

  it("date-slot step shows the empty state when the grid has no slots", () => {
    const html = renderToStaticMarkup(
      <DateSlotStep
        date="2026-08-20"
        today="2026-08-14"
        slots={[]}
        selectedSlot={undefined}
        onSelectDate={() => undefined}
        onSelectSlot={() => undefined}
      />,
    );

    expect(html).toContain("Nenhum horário disponível para esta data.");
  });
});

describe("booking flow container (URL-driven step progression)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders the services step for a slug-only selection", () => {
    const html = renderToStaticMarkup(<BookingFlow selection={{ slug: "tesoura" }} />);

    expect(html).toContain("Escolha o serviço");
  });

  it("advances to the barbers step once a service is selected", () => {
    const html = renderToStaticMarkup(
      <BookingFlow selection={{ slug: "tesoura", serviceId: "svc_1" }} />,
    );

    expect(html).toContain("Escolha o barbeiro");
  });

  it("advances to the date-slot step once a barber is selected", () => {
    const html = renderToStaticMarkup(
      <BookingFlow
        selection={{ slug: "tesoura", serviceId: "svc_1", barberId: "brb_1" }}
      />,
    );

    expect(html).toContain("Escolha o dia e horário");
  });

  it("renders the services step for an empty tenant slug", () => {
    const html = renderToStaticMarkup(<BookingFlow selection={{ slug: "" }} />);

    expect(html).toContain("Escolha o serviço");
  });
});

describe("slotsFetchParams (pure slots fetch decision)", () => {
  it("returns fetch params for a complete future-date selection on the date-slot step", () => {
    expect(
      slotsFetchParams(
        "date-slot",
        { slug: "tesoura", serviceId: "svc_1", barberId: "brb_1", date: "2099-01-01" },
        "2026-08-14",
      ),
    ).toEqual({ slug: "tesoura", serviceId: "svc_1", barberId: "brb_1", date: "2099-01-01" });
  });

  it("returns null for a past date so no slot request is made", () => {
    expect(
      slotsFetchParams(
        "date-slot",
        { slug: "tesoura", serviceId: "svc_1", barberId: "brb_1", date: "2020-01-01" },
        "2026-08-14",
      ),
    ).toBeNull();
  });

  it("returns null off the date-slot step", () => {
    expect(slotsFetchParams("services", { slug: "tesoura" }, "2026-08-14")).toBeNull();
    expect(
      slotsFetchParams("barbers", { slug: "tesoura", serviceId: "svc_1" }, "2026-08-14"),
    ).toBeNull();
  });

  it("returns null when the selection is incomplete", () => {
    expect(
      slotsFetchParams("date-slot", { slug: "tesoura", serviceId: "svc_1" }, "2026-08-14"),
    ).toBeNull();
    expect(
      slotsFetchParams(
        "date-slot",
        { slug: "", serviceId: "svc_1", barberId: "brb_1", date: "2099-01-01" },
        "2026-08-14",
      ),
    ).toBeNull();
  });
});

describe("slotsForRender (stale-grid guard)", () => {
  it("renders slots only when they belong to the selected date", () => {
    expect(
      slotsForRender({ date: "2026-08-20", slots: ["2026-08-20T12:00:00.000Z"] }, "2026-08-20"),
    ).toEqual(["2026-08-20T12:00:00.000Z"]);
  });

  it("hides the previous date's slots while the new date is loading", () => {
    expect(
      slotsForRender({ date: "2026-08-20", slots: ["2026-08-20T12:00:00.000Z"] }, "2026-08-21"),
    ).toBeUndefined();
  });

  it("returns undefined while no slots have loaded", () => {
    expect(slotsForRender(null, "2026-08-20")).toBeUndefined();
  });

  it("returns undefined when no date is selected", () => {
    expect(slotsForRender({ date: "2026-08-20", slots: ["2026-08-20T12:00:00.000Z"] }, undefined)).toBeUndefined();
  });
});

describe("slotsErrorForRender (stale-error guard)", () => {
  it("renders an error only when it belongs to the selected date", () => {
    expect(slotsErrorForRender({ date: "2026-08-20", message: "Erro" }, "2026-08-20")).toBe("Erro");
  });

  it("hides the previous date's error while the new date is loading", () => {
    expect(slotsErrorForRender({ date: "2026-08-20", message: "Erro" }, "2026-08-21")).toBeUndefined();
  });

  it("returns undefined when there is no error", () => {
    expect(slotsErrorForRender(null, "2026-08-20")).toBeUndefined();
  });
});

describe("barbersForRender (B-1 stale-list guard)", () => {
  const barber = { id: "brb_1", specialties: ["corte"], active: true };

  it("renders barbers only when they belong to the selected service", () => {
    expect(
      barbersForRender({ serviceId: "svc_1", barbers: [barber] }, "svc_1"),
    ).toEqual([barber]);
  });

  it("hides the previous service's barbers while the new service is loading", () => {
    expect(
      barbersForRender({ serviceId: "svc_1", barbers: [barber] }, "svc_2"),
    ).toBeUndefined();
  });

  it("returns undefined while no barbers have loaded", () => {
    expect(barbersForRender(null, "svc_1")).toBeUndefined();
  });

  it("returns undefined when no service is selected", () => {
    expect(barbersForRender({ serviceId: "svc_1", barbers: [barber] }, undefined)).toBeUndefined();
  });
});

describe("barbersErrorForRender (B-1 stale-error guard)", () => {
  it("renders an error only when it belongs to the selected service", () => {
    expect(barbersErrorForRender({ serviceId: "svc_1", message: "Erro" }, "svc_1")).toBe("Erro");
  });

  it("hides the previous service's error while the new service is loading", () => {
    expect(barbersErrorForRender({ serviceId: "svc_1", message: "Erro" }, "svc_2")).toBeUndefined();
  });

  it("returns undefined when there is no error", () => {
    expect(barbersErrorForRender(null, "svc_1")).toBeUndefined();
  });
});