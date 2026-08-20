/**
 * Admin API fetch helpers for the guarded admin area (admin-dashboard design:
 * D11). Pure helpers with an injected `fetchFn` (mirrors `booking-api.ts`) so
 * the mapping of HTTP status/error codes to PT-BR messages is unit-testable.
 *
 * `requestJson` is the single transport for every admin fetcher; `messageFor`
 * is the one dictionary mapping the pinned admin error codes to PT-BR copy —
 * the UI never hard-codes an error string (D11). Fetchers that accept
 * user input validate the payload client-side with the shared Zod contracts
 * and fail without fetching.
 */
import { ServiceInput, ServiceUpdate } from "@barber/contracts";
import type { ServiceView } from "@barber/contracts";

export interface AdminApiDeps {
  fetchFn: typeof fetch;
}

export type AdminApiFailure = {
  ok: false;
  code: string;
  message: string;
};

export type AdminApiResult<T> = { ok: true; data: T } | AdminApiFailure;

const DEFAULT_HEADERS = { "content-type": "application/json" };

async function readErrorCode(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? "UNKNOWN";
  } catch {
    return "UNKNOWN";
  }
}

/** Central error-code → PT-BR dictionary for the admin API surface (D11). */
export function messageFor(code: string): string {
  switch (code) {
    case "INVALID_INPUT":
      return "Dados inválidos. Verifique as informações e tente novamente.";
    case "INVALID_BODY":
      return "Formato dos dados enviados é inválido.";
    case "SESSION_REQUIRED":
      return "Sua sessão expirou. Entre novamente para continuar.";
    case "FORBIDDEN_ROLE":
      return "Você não tem permissão para acessar esta área.";
    case "TENANT_REQUIRED":
      return "Sua conta não está vinculada a uma barbearia.";
    case "BARBER_NOT_FOUND":
      return "Barbeiro não encontrado.";
    case "TENANT_NOT_FOUND":
      return "Barbearia não encontrada.";
    case "PAYMENT_APPOINTMENT_NOT_FOUND":
      return "Não encontramos este pagamento.";
    case "MANUAL_PAYMENT_ALREADY_PROCESSED":
      return "Este pagamento já foi processado.";
    case "SERVICE_IN_USE":
      return "Este serviço possui agendamentos e não pode ser excluído. Desative-o para deixá-lo indisponível para novos agendamentos.";
    default:
      return "Não foi possível concluir a ação. Tente novamente.";
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
}

/**
 * JSON transport over the injected `fetchFn`. A non-ok response surfaces
 * `{ ok: false, code, message }` with the code extracted from the API error
 * envelope (`{ error: "<CODE>" }`) and its PT-BR message from `messageFor`;
 * a rejected fetch surfaces a `NETWORK` failure.
 */
export async function requestJson<T>(
  deps: AdminApiDeps,
  url: string,
  options: RequestOptions = {},
): Promise<AdminApiResult<T>> {
  const method = options.method ?? "GET";
  let response: Response;
  try {
    response = await deps.fetchFn(url, {
      method,
      headers: DEFAULT_HEADERS,
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
  } catch {
    return { ok: false, code: "NETWORK", message: messageFor("UNKNOWN") };
  }

  if (!response.ok) {
    const code = await readErrorCode(response);
    return { ok: false, code, message: messageFor(code) };
  }

  const data = (await response.json()) as T;
  return { ok: true, data };
}

function clientInvalidInput(): AdminApiFailure {
  return { ok: false, code: "INVALID_INPUT", message: messageFor("INVALID_INPUT") };
}

/** All tenant services including inactive ones (admin services page). */
export async function listAdminServices(deps: AdminApiDeps): Promise<AdminApiResult<ServiceView[]>> {
  return requestJson<ServiceView[]>(deps, "/api/admin/services");
}

/** Creates a service; the payload is validated client-side before fetching. */
export async function createService(
  deps: AdminApiDeps,
  input: unknown,
): Promise<AdminApiResult<ServiceView>> {
  const parsed = ServiceInput.safeParse(input);
  if (!parsed.success) return clientInvalidInput();
  return requestJson<ServiceView>(deps, "/api/admin/services", {
    method: "POST",
    body: parsed.data,
  });
}

/** Updates a service (including deactivation); the patch is validated client-side. */
export async function updateService(
  deps: AdminApiDeps,
  id: string,
  patch: unknown,
): Promise<AdminApiResult<ServiceView>> {
  const parsed = ServiceUpdate.safeParse(patch);
  if (!parsed.success) return clientInvalidInput();
  return requestJson<ServiceView>(deps, `/api/admin/services/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: parsed.data,
  });
}

/**
 * Deactivates a service — the supported retirement path (catalog spec): it
 * becomes unbookable without altering existing appointments.
 */
export async function deactivateService(
  deps: AdminApiDeps,
  id: string,
): Promise<AdminApiResult<ServiceView>> {
  return updateService(deps, id, { active: false });
}