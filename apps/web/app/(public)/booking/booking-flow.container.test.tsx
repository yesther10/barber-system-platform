// @vitest-environment happy-dom
/**
 * Mounted container tests for the booking flow (booking design: DI).
 *
 * The presentational tests in booking-flow.test.tsx use renderToStaticMarkup,
 * which never runs effects. These tests mount the real client container with
 * an injected mock fetchFn to prove the effect wiring the verify report
 * flagged as uncovered (C-2): loading→data, loading→error, the past-date
 * no-request guard, and the stale-grid reset on date change (C-1).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BookingFlow } from "./booking-flow";
import type { BookingApiDeps } from "@/lib/booking-api";

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

// Vitest runs without globals, so RTL's auto-cleanup never registers — do it
// explicitly or mounted containers leak into the next test's DOM.
afterEach(() => cleanup());

function okGridResponse(slots: string[]) {
  return { ok: true, json: async () => ({ slots }) } as Response;
}

/** The barbers route returns a bare PublicBarberView array. */
function okBarbersResponse(barbers: Array<{ id: string; specialties: string[]; active: boolean }>) {
  return { ok: true, json: async () => barbers } as Response;
}

function errorResponse(error: string) {
  return { ok: false, json: async () => ({ error }) } as Response;
}

const FUTURE = "2099-01-01";
const NEXT_DAY = "2099-01-02";
const PAST = "2020-01-01";

const selectionFor = (date?: string) => ({
  slug: "tesoura",
  serviceId: "svc_1",
  barberId: "brb_1",
  date,
});

describe("booking flow container (mounted, injected fetch deps)", () => {
  afterEach(() => {
    vi.clearAllMocks();
    replace.mockClear();
  });

  it("renders loading then the slot grid once slots resolve", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(okGridResponse(["2099-01-01T12:00:00.000Z"]));
    const deps: BookingApiDeps = { fetchFn };

    render(<BookingFlow selection={selectionFor(FUTURE)} deps={deps} />);

    // In flight: loading state, no grid yet.
    expect(screen.getByText("Carregando...")).toBeTruthy();

    // Resolved: BR-tz slot grid.
    expect(await screen.findByText("09:00")).toBeTruthy();

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url] = fetchFn.mock.calls[0];
    expect(String(url)).toContain("/api/public/barbershops/tesoura/slots?");
    expect(String(url)).toContain("date=2099-01-01");
  });

  it("renders the PT-BR alert when the slots request fails with a 404", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(errorResponse("BARBER_NOT_FOUND"));

    render(<BookingFlow selection={selectionFor(FUTURE)} deps={{ fetchFn }} />);

    expect(await screen.findByText("Barbeiro não encontrado.")).toBeTruthy();
  });

  it("renders the network error alert when the fetch rejects", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockRejectedValue(new Error("boom"));

    render(<BookingFlow selection={selectionFor(FUTURE)} deps={{ fetchFn }} />);

    expect(
      await screen.findByText("Não foi possível carregar os dados. Tente novamente."),
    ).toBeTruthy();
  });

  it("does not request slots for a past date", async () => {
    const fetchFn = vi.fn<typeof fetch>();

    render(<BookingFlow selection={selectionFor(PAST)} deps={{ fetchFn }} />);

    expect(screen.getByText("Escolha uma data futura.")).toBeTruthy();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("does not request slots before a date is picked", async () => {
    const fetchFn = vi.fn<typeof fetch>();

    render(<BookingFlow selection={selectionFor(undefined)} deps={{ fetchFn }} />);

    expect(screen.getByText("Selecione uma data")).toBeTruthy();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("clears the previous date's grid while the new date is loading", async () => {
    let resolveSecond: ((response: Response) => void) | undefined;
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(okGridResponse(["2099-01-01T12:00:00.000Z"]))
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveSecond = resolve;
          }),
      );
    const deps: BookingApiDeps = { fetchFn };

    const { rerender } = render(<BookingFlow selection={selectionFor(FUTURE)} deps={deps} />);
    expect(await screen.findByText("09:00")).toBeTruthy();

    // Pick the next day: its fetch is now in flight.
    rerender(<BookingFlow selection={selectionFor(NEXT_DAY)} deps={deps} />);

    // The previous date's grid must be gone, replaced by loading.
    expect(screen.queryByText("09:00")).toBeNull();
    expect(screen.getByText("Carregando...")).toBeTruthy();
    expect(fetchFn).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolveSecond?.(okGridResponse(["2099-01-02T15:00:00.000Z"]));
    });

    expect(await screen.findByText("12:00")).toBeTruthy();
  });

  it("clears the previous service's barbers while the new service is loading", async () => {
    let resolveSecond: ((response: Response) => void) | undefined;
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        okBarbersResponse([{ id: "brb_a", specialties: ["corte"], active: true }]),
      )
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveSecond = resolve;
          }),
      );
    const deps: BookingApiDeps = { fetchFn };

    const { rerender } = render(
      <BookingFlow selection={{ slug: "tesoura", serviceId: "svc_A" }} deps={deps} />,
    );
    expect(await screen.findByText("corte")).toBeTruthy();

    // Re-select a different service: its fetch is now in flight.
    rerender(<BookingFlow selection={{ slug: "tesoura", serviceId: "svc_B" }} deps={deps} />);

    // The previous service's barbers must be gone, replaced by loading.
    expect(screen.queryByText("corte")).toBeNull();
    expect(screen.getByText("Carregando...")).toBeTruthy();
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(String(fetchFn.mock.calls[1][0])).toContain("serviceId=svc_B");

    await act(async () => {
      resolveSecond?.(okBarbersResponse([{ id: "brb_b", specialties: ["barba"], active: true }]));
    });

    expect(await screen.findByText("barba")).toBeTruthy();
  });
});