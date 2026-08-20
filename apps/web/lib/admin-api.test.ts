import { describe, expect, it, vi } from "vitest";
import {
  createService,
  deactivateService,
  listAdminServices,
  messageFor,
  requestJson,
  updateService,
  type AdminApiDeps,
} from "./admin-api";

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const deps = (fetchFn: typeof fetch): AdminApiDeps => ({ fetchFn });

describe("messageFor", () => {
  it.each([
    "INVALID_INPUT",
    "INVALID_BODY",
    "SESSION_REQUIRED",
    "FORBIDDEN_ROLE",
    "TENANT_REQUIRED",
    "BARBER_NOT_FOUND",
    "TENANT_NOT_FOUND",
    "PAYMENT_APPOINTMENT_NOT_FOUND",
    "MANUAL_PAYMENT_ALREADY_PROCESSED",
    "SERVICE_IN_USE",
  ] as const)("maps the pinned error code %s to a PT-BR message", (code) => {
    expect(messageFor(code)).toBeTruthy();
    expect(messageFor(code)).not.toBe(messageFor("UNKNOWN_CODE"));
  });

  it("returns the generic fallback for an unknown code", () => {
    expect(messageFor("SOME_NEW_CODE")).toBe("Não foi possível concluir a ação. Tente novamente.");
  });
});

describe("requestJson", () => {
  it("parses a 200 JSON response into an ok result", async () => {
    const payload = [{ id: "svc_1", name: "Corte" }];
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(payload, 200));

    const result = await requestJson(deps(fetchFn), "/api/admin/services");

    expect(result).toEqual({ ok: true, data: payload });
    expect(fetchFn).toHaveBeenCalledWith(
      "/api/admin/services",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("extracts the error code and PT-BR message from a 4xx response", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ error: "SERVICE_IN_USE" }, 409));

    const result = await requestJson(deps(fetchFn), "/api/admin/services/svc_1");

    expect(result).toEqual({
      ok: false,
      code: "SERVICE_IN_USE",
      message:
        "Este serviço possui agendamentos e não pode ser excluído. Desative-o para deixá-lo indisponível para novos agendamentos.",
    });
  });

  it("maps a 5xx response to the fallback message with the extracted code", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ error: "INTERNAL" }, 500));

    const result = await requestJson(deps(fetchFn), "/api/admin/services");

    expect(result).toEqual({
      ok: false,
      code: "INTERNAL",
      message: "Não foi possível concluir a ação. Tente novamente.",
    });
  });

  it("maps an error body without a code to UNKNOWN with the fallback message", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ detail: "boom" }, 400));

    const result = await requestJson(deps(fetchFn), "/api/admin/services");

    expect(result).toEqual({
      ok: false,
      code: "UNKNOWN",
      message: "Não foi possível concluir a ação. Tente novamente.",
    });
  });

  it("maps a rejected fetch to a NETWORK failure with the fallback message", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError("network down"));

    const result = await requestJson(deps(fetchFn), "/api/admin/services");

    expect(result).toEqual({
      ok: false,
      code: "NETWORK",
      message: "Não foi possível concluir a ação. Tente novamente.",
    });
  });
});

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

describe("listAdminServices", () => {
  it("returns services including inactive ones", async () => {
    const inactive = { ...serviceView, id: "svc_2", name: "Barba", active: false };
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse([serviceView, inactive], 200));

    const result = await listAdminServices(deps(fetchFn));

    expect(result).toEqual({ ok: true, data: [serviceView, inactive] });
    expect(fetchFn).toHaveBeenCalledWith(
      "/api/admin/services",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("surfaces a session-expired 401 with its PT-BR message", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ error: "SESSION_REQUIRED" }, 401));

    const result = await listAdminServices(deps(fetchFn));

    expect(result).toEqual({
      ok: false,
      code: "SESSION_REQUIRED",
      message: "Sua sessão expirou. Entre novamente para continuar.",
    });
  });
});

describe("createService", () => {
  const input = {
    name: "Corte",
    description: "Tesoura e máquina",
    priceBRL: 45,
    durationMinutes: 30,
  };

  it("POSTs the parsed payload and returns the created service on 201", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(serviceView, 201));

    const result = await createService(deps(fetchFn), input);

    expect(result).toEqual({ ok: true, data: serviceView });
    expect(fetchFn).toHaveBeenCalledWith(
      "/api/admin/services",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ ...input, active: true }),
      }),
    );
  });

  it("fails client-side with INVALID_INPUT and does not fetch on an invalid payload", async () => {
    const fetchFn = vi.fn();

    const result = await createService(deps(fetchFn), { name: "", priceBRL: -1 });

    expect(result).toEqual({
      ok: false,
      code: "INVALID_INPUT",
      message: "Dados inválidos. Verifique as informações e tente novamente.",
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("updateService", () => {
  it("PUTs the parsed patch to the service URL and returns the updated service", async () => {
    const updated = { ...serviceView, priceBRL: 50 };
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(updated, 200));

    const result = await updateService(deps(fetchFn), "svc_1", { priceBRL: 50 });

    expect(result).toEqual({ ok: true, data: updated });
    expect(fetchFn).toHaveBeenCalledWith(
      "/api/admin/services/svc_1",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ priceBRL: 50, active: true }),
      }),
    );
  });

  it("fails client-side with INVALID_INPUT and does not fetch on an invalid patch", async () => {
    const fetchFn = vi.fn();

    const result = await updateService(deps(fetchFn), "svc_1", { durationMinutes: 0 });

    expect(result).toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("deactivateService", () => {
  it("sends active:false via PUT to the service URL", async () => {
    const deactivated = { ...serviceView, active: false };
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(deactivated, 200));

    const result = await deactivateService(deps(fetchFn), "svc_1");

    expect(result).toEqual({ ok: true, data: deactivated });
    expect(fetchFn).toHaveBeenCalledWith(
      "/api/admin/services/svc_1",
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ active: false }) }),
    );
  });

  it("surfaces a 409 SERVICE_IN_USE with its code and deactivate-guidance message", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ error: "SERVICE_IN_USE" }, 409));

    const result = await deactivateService(deps(fetchFn), "svc_1");

    expect(result).toEqual({
      ok: false,
      code: "SERVICE_IN_USE",
      message:
        "Este serviço possui agendamentos e não pode ser excluído. Desative-o para deixá-lo indisponível para novos agendamentos.",
    });
  });
});
