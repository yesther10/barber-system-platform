/**
 * Public catalog fetch helpers for the booking flow (booking design: DI).
 *
 * Pure helpers with an injected `fetchFn` (mirrors `submitRegistration`) so
 * the mapping of HTTP status/error codes to step failures is unit-testable.
 * Each failure carries the `BookingStep` it belongs to, letting the UI
 * surface the error on the step that triggered it. Catalog browsing, booking
 * creation, pix generation and payment status reads all live here.
 */
import type {
  AppointmentView,
  CreateBookingInput,
  PaymentStatusView,
  PixPaymentView,
  PublicBarberView,
  PublicBarbershopView,
  ServiceView,
  SlotGrid,
} from "@barber/contracts";
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
    case "SLOT_CONFLICT":
      return translations.booking.errors.slotConflict;
    case "SERVICE_INACTIVE":
      return translations.booking.errors.serviceInactive;
    case "BARBER_INACTIVE":
      return translations.booking.errors.barberInactive;
    case "SESSION_REQUIRED":
      return translations.booking.errors.sessionRequired;
    case "PAYMENT_APPOINTMENT_NOT_FOUND":
      return translations.booking.errors.paymentNotFound;
    case "PAYMENT_CONFIGURATION_ERROR":
      return translations.booking.errors.pixUnavailable;
    case "PROVIDER_UNAVAILABLE":
      return translations.booking.errors.providerUnavailable;
    default:
      return translations.booking.errors.network;
  }
}

interface RequestOptions {
  method?: "GET" | "POST";
  body?: unknown;
  /** Per-code step override (e.g. SLOT_CONFLICT returns to the slot step). */
  stepFor?: (code: string) => BookingStep;
}

async function requestJson<T>(
  deps: BookingApiDeps,
  step: BookingStep,
  url: string,
  options: RequestOptions = {},
): Promise<BookingApiResult<T>> {
  const method = options.method ?? "GET";
  const stepFor = options.stepFor ?? (() => step);
  let response: Response;
  try {
    response = await deps.fetchFn(url, {
      method,
      headers: DEFAULT_HEADERS,
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
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
    return { ok: false, step: stepFor(code), code, message: messageFor(code) };
  }

  const data = (await response.json()) as T;
  return { ok: true, data };
}

/** Listable barbershops of the public directory (tenant picker step). */
export async function fetchPublicBarbershops(
  deps: BookingApiDeps,
): Promise<BookingApiResult<PublicBarbershopView[]>> {
  return requestJson<PublicBarbershopView[]>(deps, "tenant", "/api/public/barbershops");
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

/**
 * Creates the booking (confirm step). A 401 SESSION_REQUIRED is returned as a
 * confirm failure so the UI can send the guest to the login gate; SLOT_CONFLICT
 * and PAST_DATE map back to the date-slot step where the guest picks again.
 */
export async function createBooking(
  deps: BookingApiDeps,
  input: CreateBookingInput,
): Promise<BookingApiResult<AppointmentView>> {
  return requestJson<AppointmentView>(deps, "confirm", "/api/bookings", {
    method: "POST",
    body: input,
    stepFor: (code) =>
      code === "SLOT_CONFLICT" || code === "PAST_DATE" ? "date-slot" : "confirm",
  });
}

/** Generates the Pix payment for the appointment (confirmation → waiting). */
export async function createPixPayment(
  deps: BookingApiDeps,
  appointmentId: string,
): Promise<BookingApiResult<PixPaymentView>> {
  return requestJson<PixPaymentView>(
    deps,
    "confirm",
    `/api/payments/${encodeURIComponent(appointmentId)}/pix`,
    { method: "POST" },
  );
}

/** Reads the payment/appointment status for the waiting screen poll. */
export async function fetchPaymentStatus(
  deps: BookingApiDeps,
  id: string,
): Promise<BookingApiResult<PaymentStatusView>> {
  return requestJson<PaymentStatusView>(deps, "waiting", `/api/payments/${encodeURIComponent(id)}`);
}