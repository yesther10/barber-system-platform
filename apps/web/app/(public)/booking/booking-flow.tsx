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
  const [barbers, setBarbers] = useState<PublicBarberView[] | null>(null);
  const [barbersError, setBarbersError] = useState<string | null>(null);
  const [slots, setSlots] = useState<string[] | null>(null);
  const [slotsError, setSlotsError] = useState<string | null>(null);

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
        setBarbers(result.data);
        setBarbersError(null);
      } else {
        setBarbers(null);
        setBarbersError(result.message);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [step, selection.slug, selection.serviceId, depsRef]);

  useEffect(() => {
    if (step !== "date-slot" || !selection.date || !selection.serviceId || !selection.barberId) return;
    if (selection.date < today) return; // past dates blocked client-side
    let cancelled = false;
    fetchSlots(depsRef, selection.slug, selection.serviceId, selection.barberId, selection.date).then(
      (result) => {
        if (cancelled) return;
        if (result.ok) {
          setSlots(result.data.slots);
          setSlotsError(null);
        } else {
          setSlots(null);
          setSlotsError(result.message);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [step, selection.slug, selection.serviceId, selection.barberId, selection.date, today, depsRef]);

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
        barbersError ? (
          <p role="alert" className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {barbersError}
          </p>
        ) : barbers === null ? (
          <p className="text-sm text-slate-500">{translations.booking.loading}</p>
        ) : (
          <BarbersStep barbers={barbers} onSelect={(barberId) => go({ type: "select-barber", barberId })} />
        )
      ) : null}

      {step === "date-slot" ? (
        slotsError ? (
          <p role="alert" className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {slotsError}
          </p>
        ) : (
          <DateSlotStep
            date={selection.date}
            today={today}
            slots={slots ?? undefined}
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