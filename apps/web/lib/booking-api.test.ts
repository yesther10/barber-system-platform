import { describe, expect, it, vi } from "vitest";
import {
  fetchPublicBarbers,
  fetchPublicServices,
  fetchSlots,
  type BookingApiDeps,
} from "./booking-api";

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const deps = (fetchFn: typeof fetch): BookingApiDeps => ({ fetchFn });

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

const barberView = {
  id: "brb_1",
  specialties: ["corte"],
  bio: "Especialista",
  active: true,
};

describe("fetchPublicServices", () => {
  it("returns the service list on 200", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse([serviceView], 200));

    const result = await fetchPublicServices(deps(fetchFn), "tesoura");

    expect(result).toEqual({ ok: true, data: [serviceView] });
    expect(fetchFn).toHaveBeenCalledWith(
      "/api/public/barbershops/tesoura/services",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("maps an unknown tenant 404 to a services-step failure", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ error: "TENANT_NOT_FOUND" }, 404));

    const result = await fetchPublicServices(deps(fetchFn), "nao-existe");

    expect(result).toEqual({
      ok: false,
      step: "services",
      code: "TENANT_NOT_FOUND",
      message: "Barbearia não encontrada.",
    });
  });

  it("maps a malformed 400 to a services-step failure", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ error: "INVALID_INPUT" }, 400));

    const result = await fetchPublicServices(deps(fetchFn), "");

    expect(result).toMatchObject({ ok: false, step: "services", code: "INVALID_INPUT" });
  });

  it("maps a rejected fetch to a generic services failure", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError("network down"));

    const result = await fetchPublicServices(deps(fetchFn), "tesoura");

    expect(result).toMatchObject({
      ok: false,
      step: "services",
      code: "NETWORK",
      message: "Não foi possível carregar os dados. Tente novamente.",
    });
  });
});

describe("fetchPublicBarbers", () => {
  it("returns the barber list for a service on 200", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse([barberView], 200));

    const result = await fetchPublicBarbers(deps(fetchFn), "tesoura", "svc_1");

    expect(result).toEqual({ ok: true, data: [barberView] });
    expect(fetchFn).toHaveBeenCalledWith(
      "/api/public/barbershops/tesoura/barbers?serviceId=svc_1",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("maps an unknown service 404 to a barbers-step failure", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ error: "SERVICE_NOT_FOUND" }, 404));

    const result = await fetchPublicBarbers(deps(fetchFn), "tesoura", "svc-x");

    expect(result).toEqual({
      ok: false,
      step: "barbers",
      code: "SERVICE_NOT_FOUND",
      message: "Serviço não encontrado.",
    });
  });
});

describe("fetchSlots", () => {
  it("returns the slot grid on 200", async () => {
    const grid = { date: "2026-08-20", slots: ["2026-08-20T12:00:00.000Z"] };
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(grid, 200));

    const result = await fetchSlots(deps(fetchFn), "tesoura", "svc_1", "brb_1", "2026-08-20");

    expect(result).toEqual({ ok: true, data: grid });
    expect(fetchFn).toHaveBeenCalledWith(
      "/api/public/barbershops/tesoura/slots?serviceId=svc_1&barberId=brb_1&date=2026-08-20",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("maps an unknown barber 404 to a date-slot failure", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ error: "BARBER_NOT_FOUND" }, 404));

    const result = await fetchSlots(deps(fetchFn), "tesoura", "svc_1", "brb-x", "2026-08-20");

    expect(result).toEqual({
      ok: false,
      step: "date-slot",
      code: "BARBER_NOT_FOUND",
      message: "Barbeiro não encontrado.",
    });
  });

  it("maps a past-date 400 to a date-slot failure", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ error: "PAST_DATE" }, 400));

    const result = await fetchSlots(deps(fetchFn), "tesoura", "svc_1", "brb_1", "2020-01-01");

    expect(result).toEqual({
      ok: false,
      step: "date-slot",
      code: "PAST_DATE",
      message: "Escolha uma data futura.",
    });
  });
});