/**
 * Booking flow state (booking design: URL state decision).
 *
 * The URL search params are the source of truth for the guest flow:
 * `slug/serviceId/barberId/date/slot`. Deriving the step from the selection
 * keeps the flow refresh-safe (a reload lands on the same step) and feeds
 * the login `next` path for free (sanitizeNextPath keeps pathname+search).
 * All functions are pure so the reducer and codec are unit-testable.
 */
export type BookingStep = "tenant" | "services" | "barbers" | "date-slot" | "confirm" | "waiting";

export interface BookingSelection {
  slug: string;
  serviceId?: string;
  barberId?: string;
  /** YYYY-MM-DD in America/Sao_Paulo (calendar date, not instant). */
  date?: string;
  /** UTC ISO instant selected on the slot grid. */
  slot?: string;
  /** Appointment id once the booking exists — drives the payment step. */
  appointmentId?: string;
}

export type BookingAction =
  | { type: "select-barbershop"; slug: string }
  | { type: "select-service"; serviceId: string }
  | { type: "select-barber"; barberId: string }
  | { type: "select-date"; date: string }
  | { type: "select-slot"; slot: string }
  | { type: "clear-slot" }
  | { type: "booking-created"; appointmentId: string };

/**
 * Which step the selection is on: tenant (no slug) → services → barbers →
 * date/slot → confirm → waiting. The tenant step is the directory entry:
 * a slug-less selection lands on the picker BEFORE any catalog step.
 */
export function bookingStepOf(selection: BookingSelection): BookingStep {
  if (selection.appointmentId) return "waiting";
  if (!selection.slug) return "tenant";
  if (!selection.serviceId) return "services";
  if (!selection.barberId) return "barbers";
  if (!selection.date || !selection.slot) return "date-slot";
  return "confirm";
}

/** Applies a selection action, clearing any downstream choices. */
export function bookingReducer(
  selection: BookingSelection,
  action: BookingAction,
): BookingSelection {
  switch (action.type) {
    case "select-barbershop":
      // New tenant picked from the directory — the whole downstream selection
      // (including any appointment) belongs to the previous barbershop.
      return {
        ...selection,
        slug: action.slug,
        serviceId: undefined,
        barberId: undefined,
        date: undefined,
        slot: undefined,
        appointmentId: undefined,
      };
    case "select-service":
      return { ...selection, serviceId: action.serviceId, barberId: undefined, date: undefined, slot: undefined };
    case "select-barber":
      return { ...selection, barberId: action.barberId, date: undefined, slot: undefined };
    case "select-date":
      return { ...selection, date: action.date, slot: undefined };
    case "select-slot":
      return { ...selection, slot: action.slot };
    case "clear-slot":
      // SLOT_CONFLICT path: drop the contested slot but keep the date so the
      // guest lands back on the slot step with the grid still visible.
      return { ...selection, slot: undefined };
    case "booking-created":
      return { ...selection, appointmentId: action.appointmentId };
  }
}

function pickFirst(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Builds a selection from raw search params (empty values dropped). */
export function selectionFromParams(
  params: Record<string, string | string[] | undefined>,
): BookingSelection {
  return {
    slug: pickFirst(params.slug) ?? "",
    serviceId: pickFirst(params.serviceId) || undefined,
    barberId: pickFirst(params.barberId) || undefined,
    date: pickFirst(params.date) || undefined,
    slot: pickFirst(params.slot) || undefined,
    appointmentId: pickFirst(params.appointmentId) || undefined,
  };
}

/** Serializes a selection to search params, omitting empty fields. */
export function selectionToParams(selection: BookingSelection): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(selection)) {
    if (value) params.set(key, value);
  }
  return params;
}

/** The full refresh-safe booking URL for a selection. */
export function bookingPathFor(selection: BookingSelection): string {
  const query = selectionToParams(selection).toString();
  return query ? `/booking?${query}` : "/booking";
}

/**
 * Login gate handoff for a guest on the confirm step (booking spec: login gate).
 * The `next` value carries the full selection so that after sign-in the guest
 * returns to the same step — `sanitizeNextPath` on the login page keeps the
 * pathname + search of this exact URL.
 */
export function bookingLoginPath(selection: BookingSelection): string {
  return `/login?next=${encodeURIComponent(bookingPathFor(selection))}`;
}