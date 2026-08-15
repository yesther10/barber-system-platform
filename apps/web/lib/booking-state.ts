/**
 * Booking flow state (booking design: URL state decision).
 *
 * The URL search params are the source of truth for the guest flow:
 * `slug/serviceId/barberId/date/slot`. Deriving the step from the selection
 * keeps the flow refresh-safe (a reload lands on the same step) and feeds
 * the login `next` path for free (sanitizeNextPath keeps pathname+search).
 * All functions are pure so the reducer and codec are unit-testable.
 */
export type BookingStep = "services" | "barbers" | "date-slot";

export interface BookingSelection {
  slug: string;
  serviceId?: string;
  barberId?: string;
  /** YYYY-MM-DD in America/Sao_Paulo (calendar date, not instant). */
  date?: string;
  /** UTC ISO instant selected on the slot grid. */
  slot?: string;
}

export type BookingAction =
  | { type: "select-service"; serviceId: string }
  | { type: "select-barber"; barberId: string }
  | { type: "select-date"; date: string }
  | { type: "select-slot"; slot: string };

/** Which step the selection is on: services → barbers → date/slot. */
export function bookingStepOf(selection: BookingSelection): BookingStep {
  if (!selection.serviceId) return "services";
  if (!selection.barberId) return "barbers";
  return "date-slot";
}

/** Applies a selection action, clearing any downstream choices. */
export function bookingReducer(
  selection: BookingSelection,
  action: BookingAction,
): BookingSelection {
  switch (action.type) {
    case "select-service":
      return { ...selection, serviceId: action.serviceId, barberId: undefined, date: undefined, slot: undefined };
    case "select-barber":
      return { ...selection, barberId: action.barberId, date: undefined, slot: undefined };
    case "select-date":
      return { ...selection, date: action.date, slot: undefined };
    case "select-slot":
      return { ...selection, slot: action.slot };
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