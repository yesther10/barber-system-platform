import { describe, expect, it, vi } from "vitest";
import { messageFor, requestJson, type AdminApiDeps } from "./admin-api";

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
