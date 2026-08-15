import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  BarbersStep,
  BookingFlow,
  DateSlotStep,
  ServicesStep,
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