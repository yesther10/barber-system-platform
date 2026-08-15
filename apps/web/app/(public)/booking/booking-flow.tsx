"use client";

/**
 * Client booking step machine (booking design: URL state decision).
 *
 * The selection is driven entirely by URL search params passed down from the
 * server page — `bookingStepOf` derives which step renders and every action
 * pushes a new `bookingPathFor` URL via `router.replace`, keeping the flow
 * refresh-safe and feeding the login `next` handoff for free.
 *
 * Data loads through the DI `booking-api` helpers (injected fetchFn). The
 * presentational step components are exported separately so the node-env
 * test suite can assert PT-BR empty states and BR-tz slot rendering without
 * a DOM (mirrors the register-form DI pattern).
 */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { PublicBarberView, ServiceView } from "@barber/contracts";
import { translations } from "@/lib/i18n";
import {
  bookingPathFor,
  bookingReducer,
  bookingStepOf,
  type BookingAction,
  type BookingSelection,
  type BookingStep,
} from "@/lib/booking-state";
import {
  fetchPublicBarbers,
  fetchPublicServices,
  fetchSlots,
  type BookingApiDeps,
} from "@/lib/booking-api";
import { BR_TIMEZONE, formatSlotLocal, todayInTz } from "@/lib/tz";

// --- presentational steps ---------------------------------------------------

function StepList<T extends { id: string }>({
  items,
  renderItem,
  onSelect,
  emptyMessage,
}: {
  items: T[];
  renderItem: (item: T) => React.ReactNode;
  onSelect: (id: string) => void;
  emptyMessage: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-slate-500">{emptyMessage}</p>;
  }
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            onClick={() => onSelect(item.id)}
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-left transition hover:border-slate-900"
          >
            {renderItem(item)}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Services step: catalog of active services for the tenant. */
export function ServicesStep({ services, onSelect }: { services: ServiceView[]; onSelect: (id: string) => void }) {
  return (
    <StepList
      items={services}
      onSelect={onSelect}
      emptyMessage={translations.booking.emptyServices}
      renderItem={(service) => (
        <>
          <span className="block font-medium text-slate-900">{service.name}</span>
          <span className="text-sm text-slate-500">
            {service.description} · R$ {service.priceBRL}
          </span>
        </>
      )}
    />
  );
}

/** Barbers step: active barbers assigned to the selected service. */
export function BarbersStep({ barbers, onSelect }: { barbers: PublicBarberView[]; onSelect: (id: string) => void }) {
  return (
    <StepList
      items={barbers}
      onSelect={onSelect}
      emptyMessage={translations.booking.emptyBarbers}
      renderItem={(barber) => (
        <>
          <span className="block font-medium text-slate-900">
            {barber.specialties.join(", ")}
          </span>
          {barber.bio ? (
            <span className="text-sm text-slate-500">{barber.bio}</span>
          ) : null}
        </>
      )}
    />
  );
}

interface DateSlotStepProps {
  /** YYYY-MM-DD selected in the picker, if any. */
  date?: string;
  /** YYYY-MM-DD in America/Sao_Paulo — min for the date input. */
  today: string;
  /** UTC ISO slot instants, undefined while loading. */
  slots?: string[];
  /** The currently selected slot instant, if any. */
  selectedSlot?: string;
  onSelectDate: (date: string) => void;
  onSelectSlot: (slot: string) => void;
}

/** Date/slot step: BR-tz slot grid, past dates blocked client-side. */
export function DateSlotStep({
  date,
  today,
  slots,
  selectedSlot,
  onSelectDate,
  onSelectSlot,
}: DateSlotStepProps) {
  return (
    <div className="space-y-4">
      <label className="block text-sm font-medium text-slate-700" htmlFor="booking-date">
        {translations.booking.selectDate}
      </label>
      <input
        id="booking-date"
        type="date"
        min={today}
        value={date ?? ""}
        onChange={(event) => onSelectDate(event.target.value)}
        className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-900"
      />

      {date && date < today ? (
        <p className="text-sm text-rose-600">{translations.booking.errors.pastDate}</p>
      ) : slots === undefined ? (
        <p className="text-sm text-slate-500">{translations.booking.loading}</p>
      ) : slots.length === 0 ? (
        <p className="text-sm text-slate-500">{translations.booking.emptySlots}</p>
      ) : (
        <ul className="grid grid-cols-3 gap-2">
          {slots.map((slot) => (
            <li key={slot}>
              <button
                type="button"
                onClick={() => onSelectSlot(slot)}
                aria-pressed={slot === selectedSlot}
                className={`w-full rounded-2xl border px-4 py-3 text-sm transition hover:border-slate-900 ${
                  slot === selectedSlot ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200"
                }`}
              >
                {formatSlotLocal(slot, BR_TIMEZONE)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// --- container ---------------------------------------------------------------

interface BookingFlowProps {
  selection: BookingSelection;
  /** Injected fetch deps (unit tests pass mocks; prod defaults to fetch). */
  deps?: BookingApiDeps;
}

/**
 * Pure decision for the slots effect (booking design: DI). Returns the fetch
 * params for the current selection or null when no request should be sent —
 * off the date-slot step, on incomplete selections, or for past dates (the
 * client-side no-request guard). Kept pure so the guard is unit-testable.
 */
export function slotsFetchParams(
  step: BookingStep,
  selection: BookingSelection,
  today: string,
): { slug: string; serviceId: string; barberId: string; date: string } | null {
  if (step !== "date-slot") return null;
  const { slug, serviceId, barberId, date } = selection;
  if (!slug || !serviceId || !barberId || !date) return null;
  if (date < today) return null; // past dates blocked client-side — no request
  return { slug, serviceId, barberId, date };
}

/**
 * Slots to render for the selected date (C-1 stale-grid guard). The grid is
 * derived from the date the slots were fetched for, so a previous date's grid
 * can never be rendered — or clicked — while the new date is loading.
 */
export function slotsForRender(
  slots: { date: string; slots: string[] } | null,
  date: string | undefined,
): string[] | undefined {
  return date && slots?.date === date ? slots.slots : undefined;
}

/**
 * Error to render for the selected date (C-1 stale-error guard). Mirrors
 * `slotsForRender`: a previous date's error is hidden while the new date is
 * loading, so the step never shows a failure that belongs to another date.
 */
export function slotsErrorForRender(
  error: { date: string; message: string } | null,
  date: string | undefined,
): string | undefined {
  return date && error?.date === date ? error.message : undefined;
}

/**
 * Barbers to render for the selected service (B-1 stale-list guard). Mirrors
 * `slotsForRender`: the list is keyed by the serviceId it was fetched for, so
 * a previous service's barbers can never be rendered — or clicked — while the
 * new service is loading (browser-back → re-select, or URL edit).
 */
export function barbersForRender(
  barbers: { serviceId: string; barbers: PublicBarberView[] } | null,
  serviceId: string | undefined,
): PublicBarberView[] | undefined {
  return serviceId && barbers?.serviceId === serviceId ? barbers.barbers : undefined;
}

/**
 * Error to render for the selected service (B-1 stale-error guard). Mirrors
 * `slotsErrorForRender`: a previous service's error is hidden while the new
 * service is loading.
 */
export function barbersErrorForRender(
  error: { serviceId: string; message: string } | null,
  serviceId: string | undefined,
): string | undefined {
  return serviceId && error?.serviceId === serviceId ? error.message : undefined;
}

const stepTitle: Record<BookingStep, string> = {
  services: translations.booking.stepServices,
  barbers: translations.booking.stepBarbers,
  "date-slot": translations.booking.stepDateSlot,
};

export function BookingFlow({ selection, deps }: BookingFlowProps) {
  const router = useRouter();
  const step = bookingStepOf(selection);
  const today = todayInTz();
  const depsRef = useMemo(
    () => deps ?? { fetchFn: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init) },
    [deps],
  );

  const [services, setServices] = useState<ServiceView[] | null>(null);
  const [servicesError, setServicesError] = useState<string | null>(null);
  /** Barbers plus the service they belong to — rendered only on a service match. */
  const [barbers, setBarbers] = useState<{ serviceId: string; barbers: PublicBarberView[] } | null>(null);
  /** Fetch error plus the service it belongs to — rendered only on a service match. */
  const [barbersError, setBarbersError] = useState<{ serviceId: string; message: string } | null>(null);
  /** Slots plus the date they belong to — rendered only on a date match. */
  const [slots, setSlots] = useState<{ date: string; slots: string[] } | null>(null);
  /** Fetch error plus the date it belongs to — rendered only on a date match. */
  const [slotsError, setSlotsError] = useState<{ date: string; message: string } | null>(null);

  const go = (action: BookingAction) =>
    router.replace(bookingPathFor(bookingReducer(selection, action)));

  useEffect(() => {
    if (step !== "services" || !selection.slug) return;
    let cancelled = false;
    fetchPublicServices(depsRef, selection.slug).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setServices(result.data);
        setServicesError(null);
      } else {
        setServices(null);
        setServicesError(result.message);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [step, selection.slug, depsRef]);

  useEffect(() => {
    if (step !== "barbers" || !selection.serviceId) return;
    let cancelled = false;
    fetchPublicBarbers(depsRef, selection.slug, selection.serviceId).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        // B-1: store the list with the service it belongs to so a previous
        // service's barbers can never render (or be clicked) for this service.
        setBarbers({ serviceId: selection.serviceId, barbers: result.data });
        setBarbersError(null);
      } else {
        setBarbers(null);
        setBarbersError({ serviceId: selection.serviceId, message: result.message });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [step, selection.slug, selection.serviceId, depsRef]);

  useEffect(() => {
    const params = slotsFetchParams(
      step,
      {
        slug: selection.slug,
        serviceId: selection.serviceId,
        barberId: selection.barberId,
        date: selection.date,
      },
      today,
    );
    if (!params) return; // off-step, incomplete selection, or past date — no request
    let cancelled = false;
    fetchSlots(depsRef, params.slug, params.serviceId, params.barberId, params.date).then(
      (result) => {
        if (cancelled) return;
        if (result.ok) {
          // C-1: store the grid with the date it belongs to so a previous
          // date's slots can never render (or be clicked) for this date.
          setSlots({ date: params.date, slots: result.data.slots });
        } else {
          setSlotsError({ date: params.date, message: result.message });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [step, selection.slug, selection.serviceId, selection.barberId, selection.date, today, depsRef]);

  const renderedSlots = slotsForRender(slots, selection.date);
  const renderedSlotsError = slotsErrorForRender(slotsError, selection.date);
  const renderedBarbers = barbersForRender(barbers, selection.serviceId);
  const renderedBarbersError = barbersErrorForRender(barbersError, selection.serviceId);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-6 py-12">
      <h1 className="text-2xl font-semibold text-slate-900">{stepTitle[step]}</h1>

      {step === "services" ? (
        servicesError ? (
          <p role="alert" className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {servicesError}
          </p>
        ) : services === null ? (
          <p className="text-sm text-slate-500">{translations.booking.loading}</p>
        ) : (
          <ServicesStep services={services} onSelect={(serviceId) => go({ type: "select-service", serviceId })} />
        )
      ) : null}

      {step === "barbers" ? (
        renderedBarbersError ? (
          <p role="alert" className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {renderedBarbersError}
          </p>
        ) : renderedBarbers === undefined ? (
          <p className="text-sm text-slate-500">{translations.booking.loading}</p>
        ) : (
          <BarbersStep barbers={renderedBarbers} onSelect={(barberId) => go({ type: "select-barber", barberId })} />
        )
      ) : null}

      {step === "date-slot" ? (
        renderedSlotsError ? (
          <p role="alert" className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {renderedSlotsError}
          </p>
        ) : (
          <DateSlotStep
            date={selection.date}
            today={today}
            slots={renderedSlots}
            selectedSlot={selection.slot}
            onSelectDate={(date) => go({ type: "select-date", date })}
            onSelectSlot={(slot) => go({ type: "select-slot", slot })}
          />
        )
      ) : null}
    </main>
  );
}

export default BookingFlow;