import { describe, expect, it, vi } from "vitest";
import {
  createBooking,
  createPixPayment,
  fetchPaymentStatus,
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

describe("createBooking", () => {
  const input = { serviceId: "svc_1", barberId: "brb_1", startsAt: "2026-08-20T12:00:00.000Z" };

  const appointment = {
    id: "appt_1",
    barbershopId: "bs_1",
    barberId: "brb_1",
    clientId: "cli_1",
    serviceId: "svc_1",
    startsAt: "2026-08-20T12:00:00.000Z",
    endsAt: "2026-08-20T12:30:00.000Z",
    status: "pending",
    priceSnapshot: 45,
    paymentStatus: "pending",
    noShowAt: null,
    cancelReason: null,
  };

  it("creates the booking with a POST and returns the appointment on 201", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(appointment, 201));

    const result = await createBooking(deps(fetchFn), input);

    expect(result).toEqual({ ok: true, data: appointment });
    expect(fetchFn).toHaveBeenCalledWith(
      "/api/bookings",
      expect.objectContaining({ method: "POST", body: JSON.stringify(input) }),
    );
  });

  it("maps a 409 SLOT_CONFLICT to a date-slot failure so the guest returns to the slot step", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ error: "SLOT_CONFLICT" }, 409));

    const result = await createBooking(deps(fetchFn), input);

    expect(result).toEqual({
      ok: false,
      step: "date-slot",
      code: "SLOT_CONFLICT",
      message: "Este horário acabou de ser ocupado. Escolha outro horário.",
    });
  });

  it("maps a 400 PAST_DATE to a date-slot failure", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ error: "PAST_DATE" }, 400));

    const result = await createBooking(deps(fetchFn), input);

    expect(result).toMatchObject({
      ok: false,
      step: "date-slot",
      code: "PAST_DATE",
      message: "Escolha uma data futura.",
    });
  });

  it("maps a 409 SERVICE_INACTIVE to a confirm failure with PT-BR copy", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ error: "SERVICE_INACTIVE" }, 409));

    const result = await createBooking(deps(fetchFn), input);

    expect(result).toEqual({
      ok: false,
      step: "confirm",
      code: "SERVICE_INACTIVE",
      message: "Este serviço não está mais disponível.",
    });
  });

  it("maps a 409 BARBER_INACTIVE to a confirm failure with PT-BR copy", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ error: "BARBER_INACTIVE" }, 409));

    const result = await createBooking(deps(fetchFn), input);

    expect(result).toEqual({
      ok: false,
      step: "confirm",
      code: "BARBER_INACTIVE",
      message: "Este barbeiro não está mais disponível.",
    });
  });

  it("maps a 401 SESSION_REQUIRED to a confirm failure so the UI can gate", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ error: "SESSION_REQUIRED" }, 401));

    const result = await createBooking(deps(fetchFn), input);

    expect(result).toEqual({
      ok: false,
      step: "confirm",
      code: "SESSION_REQUIRED",
      message: "Entre na sua conta para confirmar o agendamento.",
    });
  });

  it("maps a rejected fetch to a network confirm failure", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError("network down"));

    const result = await createBooking(deps(fetchFn), input);

    expect(result).toMatchObject({
      ok: false,
      step: "confirm",
      code: "NETWORK",
      message: "Não foi possível carregar os dados. Tente novamente.",
    });
  });
});

describe("createPixPayment", () => {
  const pix = {
    id: "pix_1",
    appointmentId: "appt_1",
    status: "pending",
    qrCode: "000201emv",
    expiresAt: "2026-08-20T15:00:00.000Z",
    providerPaymentId: "provider_1",
  };

  it("requests the pix payment with a POST and returns the view on 201", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(pix, 201));

    const result = await createPixPayment(deps(fetchFn), "appt_1");

    expect(result).toEqual({ ok: true, data: pix });
    expect(fetchFn).toHaveBeenCalledWith(
      "/api/payments/appt_1/pix",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("maps a 409 PAYMENT_CONFIGURATION_ERROR to a confirm failure", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ error: "PAYMENT_CONFIGURATION_ERROR" }, 409));

    const result = await createPixPayment(deps(fetchFn), "appt_1");

    expect(result).toEqual({
      ok: false,
      step: "confirm",
      code: "PAYMENT_CONFIGURATION_ERROR",
      message: "Não foi possível gerar o Pix no momento. Tente novamente.",
    });
  });

  it("maps a 502 PROVIDER_UNAVAILABLE to a confirm failure", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ error: "PROVIDER_UNAVAILABLE" }, 502));

    const result = await createPixPayment(deps(fetchFn), "appt_1");

    expect(result).toEqual({
      ok: false,
      step: "confirm",
      code: "PROVIDER_UNAVAILABLE",
      message: "O provedor de pagamento está indisponível. Tente novamente.",
    });
  });
});

describe("fetchPaymentStatus", () => {
  const view = { appointmentId: "appt_1", paymentStatus: "paid", appointmentStatus: "confirmed" };

  it("returns the status view on 200", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(view, 200));

    const result = await fetchPaymentStatus(deps(fetchFn), "provider_1");

    expect(result).toEqual({ ok: true, data: view });
    expect(fetchFn).toHaveBeenCalledWith(
      "/api/payments/provider_1",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("maps a 404 PAYMENT_APPOINTMENT_NOT_FOUND to a waiting failure", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ error: "PAYMENT_APPOINTMENT_NOT_FOUND" }, 404));

    const result = await fetchPaymentStatus(deps(fetchFn), "pix_x");

    expect(result).toEqual({
      ok: false,
      step: "waiting",
      code: "PAYMENT_APPOINTMENT_NOT_FOUND",
      message: "Não encontramos este pagamento.",
    });
  });

  it("maps a 401 SESSION_REQUIRED to a waiting failure", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ error: "SESSION_REQUIRED" }, 401));

    const result = await fetchPaymentStatus(deps(fetchFn), "provider_1");

    expect(result).toMatchObject({ ok: false, step: "waiting", code: "SESSION_REQUIRED" });
  });
});