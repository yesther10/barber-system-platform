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
import { bookingPathFor } from "@/lib/booking-state";
import type { BookingApiDeps } from "@/lib/booking-api";
import type { PixPaymentView } from "@barber/contracts";

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

function okJson(body: unknown) {
  return { ok: true, json: async () => body } as Response;
}

function createdJson(body: unknown) {
  return { ok: true, status: 201, json: async () => body } as Response;
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

const FULL_SELECTION = {
  slug: "tesoura",
  serviceId: "svc_1",
  barberId: "brb_1",
  date: FUTURE,
  slot: "2099-01-01T12:00:00.000Z",
};

const serviceView = {
  id: "svc_1",
  name: "Corte",
  description: "Tesoura e máquina",
  priceBRL: 45,
  durationMinutes: 30,
  active: true,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

const pixView: PixPaymentView = {
  id: "pix_1",
  appointmentId: "appt_1",
  status: "pending",
  qrCode: "000201emv",
  expiresAt: "2099-02-01T00:00:00.000Z",
  providerPaymentId: "provider_1",
};

const pendingStatus = { appointmentId: "appt_1", paymentStatus: "pending", appointmentStatus: "pending" };

/** fetchFn that serves the pix POST and then always reports the given status. */
function waitingFetch(pix: typeof pixView, status: unknown) {
  return vi.fn<typeof fetch>().mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes("/pix")) return createdJson(pix);
    return okJson(status);
  });
}

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

  it("renders the confirm summary from catalog data fetched after a handoff", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(okJson([serviceView]))
      .mockResolvedValueOnce(
        okBarbersResponse([{ id: "brb_1", specialties: ["corte"], active: true }]),
      );

    render(<BookingFlow selection={FULL_SELECTION} deps={{ fetchFn }} />);

    expect(await screen.findByText("Confirme seu agendamento")).toBeTruthy();
    expect(await screen.findByText("Corte")).toBeTruthy();
    expect(await screen.findByText("corte")).toBeTruthy();
    expect(screen.getByText("01/01/2099")).toBeTruthy();
    expect(screen.getByText("09:00")).toBeTruthy();
    expect(screen.getByText("R$ 45")).toBeTruthy();
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("sends a guest to /login?next= preserving the full selection", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(okJson([serviceView]))
      .mockResolvedValueOnce(
        okBarbersResponse([{ id: "brb_1", specialties: ["corte"], active: true }]),
      )
      .mockResolvedValueOnce(errorResponse("SESSION_REQUIRED"));

    render(<BookingFlow selection={FULL_SELECTION} deps={{ fetchFn }} />);

    await screen.findByText("Confirme seu agendamento");
    fireEvent.click(screen.getByRole("button", { name: "Confirmar agendamento" }));

    await waitFor(() => expect(replace).toHaveBeenCalledTimes(1));
    const loginPath = String(replace.mock.calls[0][0]);
    expect(loginPath).toMatch(/^\/login\?next=/);
    // The `next` carries the URL-encoded booking path (URLSearchParams form).
    const next = decodeURIComponent(loginPath.split("next=")[1]);
    expect(next).toBe(bookingPathFor(FULL_SELECTION));
    expect(next).toContain("slug=tesoura");
    expect(next).toContain("serviceId=svc_1");
    expect(next).toContain("barberId=brb_1");
    expect(next).toContain("date=2099-01-01");
  });

  it("returns the guest to the slot step with PT-BR copy on a slot conflict", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(okJson([serviceView]))
      .mockResolvedValueOnce(
        okBarbersResponse([{ id: "brb_1", specialties: ["corte"], active: true }]),
      )
      .mockResolvedValueOnce(errorResponse("SLOT_CONFLICT"))
      .mockResolvedValueOnce(okGridResponse(["2099-01-01T15:00:00.000Z"]));

    const { rerender } = render(<BookingFlow selection={FULL_SELECTION} deps={{ fetchFn }} />);
    await screen.findByText("Confirme seu agendamento");
    fireEvent.click(screen.getByRole("button", { name: "Confirmar agendamento" }));

    await waitFor(() => expect(replace).toHaveBeenCalledTimes(1));
    const cleared = decodeURIComponent(String(replace.mock.calls[0][0]));
    expect(cleared).toContain("date=2099-01-01");
    expect(cleared).not.toContain("slot=");

    rerender(
      <BookingFlow
        selection={{ slug: "tesoura", serviceId: "svc_1", barberId: "brb_1", date: FUTURE }}
        deps={{ fetchFn }}
      />,
    );
    expect(
      await screen.findByText("Este horário acabou de ser ocupado. Escolha outro horário."),
    ).toBeTruthy();
    expect(await screen.findByText("12:00")).toBeTruthy();
  });

  it("renders the pix QR image and 'Pagamento recebido' once the payment is paid", async () => {
    const toDataURL = vi.fn().mockResolvedValue("data:image/png;base64,qr");
    const fetchFn = waitingFetch(pixView, {
      appointmentId: "appt_1",
      paymentStatus: "paid",
      appointmentStatus: "confirmed",
    });

    render(<BookingFlow selection={{ ...FULL_SELECTION, appointmentId: "appt_1" }} deps={{ fetchFn, toDataURL }} />);

    const img = await screen.findByRole("img", { name: "QR code Pix" });
    expect(img.getAttribute("src")).toBe("data:image/png;base64,qr");
    expect(await screen.findByText("Pagamento recebido!")).toBeTruthy();
  });

  it("copies the pix payload to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const fetchFn = waitingFetch(pixView, pendingStatus);

    render(
      <BookingFlow
        selection={{ ...FULL_SELECTION, appointmentId: "appt_1" }}
        deps={{ fetchFn, writeText, sleep: vi.fn().mockResolvedValue(undefined) }}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Copiar código Pix" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("000201emv"));
    expect(await screen.findByText("Código copiado!")).toBeTruthy();
  });

  it("shows the copy fallback without an image when the qr payload is null", async () => {
    const fetchFn = waitingFetch({ ...pixView, qrCode: null }, pendingStatus);

    render(
      <BookingFlow
        selection={{ ...FULL_SELECTION, appointmentId: "appt_1" }}
        deps={{ fetchFn, sleep: vi.fn().mockResolvedValue(undefined) }}
      />,
    );

    expect(await screen.findByRole("button", { name: "Copiar código Pix" })).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("stops polling after the attempt budget and offers a manual retry", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fetchFn = waitingFetch(pixView, pendingStatus);

    render(
      <BookingFlow
        selection={{ ...FULL_SELECTION, appointmentId: "appt_1" }}
        deps={{ fetchFn, sleep }}
      />,
    );

    expect(await screen.findByText("Ainda não identificamos o pagamento.")).toBeTruthy();

    const statusCalls = () =>
      fetchFn.mock.calls.filter(([input]) => !String(input).includes("/pix")).length;
    expect(statusCalls()).toBe(10);

    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await waitFor(() => expect(statusCalls()).toBeGreaterThan(10));
  });

  it("shows a PT-BR error when pix generation fails", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(errorResponse("PAYMENT_CONFIGURATION_ERROR"));

    render(
      <BookingFlow
        selection={{ ...FULL_SELECTION, appointmentId: "appt_1" }}
        deps={{ fetchFn }}
      />,
    );

    expect(
      await screen.findByText("Não foi possível gerar o Pix no momento. Tente novamente."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeTruthy();
  });
});