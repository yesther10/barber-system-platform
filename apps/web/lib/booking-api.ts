/**
 * Public catalog fetch helpers for the booking flow (booking design: DI).
 *
 * Pure helpers with an injected `fetchFn` (mirrors `submitRegistration`) so
 * the mapping of HTTP status/error codes to step failures is unit-testable.
 * Each failure carries the `BookingStep` it belongs to, letting the UI
 * surface the error on the step that triggered it. Only catalog browsing is
 * here; create/pix/status live in PR 3.
 */
import type { PublicBarberView, ServiceView, SlotGrid } from "@barber/contracts";
import type { BookingStep } from "./booking-state";
import { translations } from "./i18n";

export interface BookingApiDeps {
  fetchFn: typeof fetch;
}

export type BookingApiFailure = {
  ok: false;
  step: BookingStep;
  code: string;
  message: string;
};

export type BookingApiResult<T> = { ok: true; data: T } | BookingApiFailure;

const DEFAULT_HEADERS = { "content-type": "application/json" };

async function readErrorCode(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? "UNKNOWN";
  } catch {
    return "UNKNOWN";
  }
}

function messageFor(code: string): string {
  switch (code) {
    case "TENANT_NOT_FOUND":
      return translations.booking.errors.tenantNotFound;
    case "SERVICE_NOT_FOUND":
      return translations.booking.errors.serviceNotFound;
    case "BARBER_NOT_FOUND":
      return translations.booking.errors.barberNotFound;
    case "PAST_DATE":
      return translations.booking.errors.pastDate;
    case "INVALID_INPUT":
      return translations.booking.errors.invalidInput;
    default:
      return translations.booking.errors.network;
  }
}

async function requestJson<T>(
  deps: BookingApiDeps,
  step: BookingStep,
  url: string,
): Promise<BookingApiResult<T>> {
  let response: Response;
  try {
    response = await deps.fetchFn(url, { method: "GET", headers: DEFAULT_HEADERS });
  } catch {
    return {
      ok: false,
      step,
      code: "NETWORK",
      message: translations.booking.errors.network,
    };
  }

  if (!response.ok) {
    const code = await readErrorCode(response);
    return { ok: false, step, code, message: messageFor(code) };
  }

  const data = (await response.json()) as T;
  return { ok: true, data };
}

/** Public services of the tenant (services step). */
export async function fetchPublicServices(
  deps: BookingApiDeps,
  slug: string,
): Promise<BookingApiResult<ServiceView[]>> {
  return requestJson<ServiceView[]>(
    deps,
    "services",
    `/api/public/barbershops/${encodeURIComponent(slug)}/services`,
  );
}

/** Active barbers assigned to a service (barbers step). */
export async function fetchPublicBarbers(
  deps: BookingApiDeps,
  slug: string,
  serviceId: string,
): Promise<BookingApiResult<PublicBarberView[]>> {
  return requestJson<PublicBarberView[]>(
    deps,
    "barbers",
    `/api/public/barbershops/${encodeURIComponent(slug)}/barbers?serviceId=${encodeURIComponent(serviceId)}`,
  );
}

/** Slot grid for a service+barber+date (date-slot step). */
export async function fetchSlots(
  deps: BookingApiDeps,
  slug: string,
  serviceId: string,
  barberId: string,
  date: string,
): Promise<BookingApiResult<SlotGrid>> {
  const query = new URLSearchParams({ serviceId, barberId, date });
  return requestJson<SlotGrid>(
    deps,
    "date-slot",
    `/api/public/barbershops/${encodeURIComponent(slug)}/slots?${query.toString()}`,
  );
}