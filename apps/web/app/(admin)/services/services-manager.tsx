"use client";

/**
 * Admin services manager (admin-dashboard design: services page). Client
 * container with injected `fetchFn` deps (booking-flow DI pattern): lists all
 * tenant services including inactive ones, and drives create / edit /
 * deactivate / delete through the admin-api fetchers. A delete conflict
 * (409 `SERVICE_IN_USE`) surfaces the deactivate guidance (spec §Admin
 * Services Page); an empty list renders the PT-BR empty state.
 *
 * Edit-safety (S2a verify carry-over): `ServiceUpdate = ServiceInput.partial()`
 * keeps `active: z.boolean().default(true)`, so `safeParse` would inject
 * `active: true` into ANY patch. The edit form therefore sends only the
 * fields the user actually changed (`serviceUpdatePatch`) — an edit that
 * does not touch `active` can never reactivate a deactivated service.
 */
import { useState } from "react";
import type { ServiceView } from "@barber/contracts";
import { translations } from "@/lib/i18n";
import {
  createService,
  deactivateService,
  requestJson,
  updateService,
  type AdminApiDeps,
} from "@/lib/admin-api";

export interface ServiceFormState {
  name: string;
  priceBRL: string;
  durationMinutes: string;
  active: boolean;
}

export interface ServicesManagerProps {
  /** Services fetched server-side by the page; the manager keeps them in sync. */
  initialServices: ServiceView[];
  deps?: AdminApiDeps;
}

const EMPTY_FORM: ServiceFormState = { name: "", priceBRL: "", durationMinutes: "", active: true };

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Pure: builds the update patch for the edit form. `active` is ALWAYS sent
 * explicitly with the form's current value, which equals the service's
 * stored value unless the user toggled it — this is what guarantees a
 * deactivated service is never reactivated by an edit that doesn't touch
 * `active`. Omitting it would be fatal: `ServiceUpdate = ServiceInput.partial()`
 * keeps `active: z.boolean().default(true)`, so `updateService`'s internal
 * `safeParse` would inject `active: true` into the payload.
 */
export function serviceUpdatePatch(
  service: ServiceView,
  form: ServiceFormState,
): Record<string, unknown> {
  const patch: Record<string, unknown> = { active: form.active };
  if (form.name !== service.name) patch.name = form.name;
  const priceBRL = Number(form.priceBRL);
  if (priceBRL !== service.priceBRL) patch.priceBRL = priceBRL;
  const durationMinutes = Number(form.durationMinutes);
  if (durationMinutes !== service.durationMinutes) patch.durationMinutes = durationMinutes;
  return patch;
}

export default function ServicesManager({ initialServices, deps }: ServicesManagerProps) {
  const fetchFn = deps?.fetchFn ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  const t = translations.admin.services;

  const [services, setServices] = useState<ServiceView[]>(initialServices);
  const [editing, setEditing] = useState<ServiceView | null>(null);
  const [form, setForm] = useState<ServiceFormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function startEdit(service: ServiceView) {
    setEditing(service);
    setForm({
      name: service.name,
      priceBRL: String(service.priceBRL),
      durationMinutes: String(service.durationMinutes),
      active: service.active,
    });
    setError(null);
  }

  function cancelEdit() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError(null);
  }

  async function handleSubmit(event?: React.FormEvent) {
    event?.preventDefault();
    setSubmitting(true);
    setError(null);

    const payload = {
      name: form.name,
      priceBRL: Number(form.priceBRL),
      durationMinutes: Number(form.durationMinutes),
    };

    if (editing) {
      const result = await updateService({ fetchFn }, editing.id, serviceUpdatePatch(editing, form));
      setSubmitting(false);
      if (!result.ok) {
        setError(result.code === "SERVICE_IN_USE" ? t.deactivateGuidance : result.message);
        return;
      }
      setServices((current) => current.map((s) => (s.id === result.data.id ? result.data : s)));
      setEditing(null);
      setForm(EMPTY_FORM);
      return;
    }

    const result = await createService({ fetchFn }, payload);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setServices((current) => [...current, result.data]);
    setForm(EMPTY_FORM);
  }

  async function handleDeactivate(service: ServiceView) {
    setBusyId(service.id);
    setError(null);
    const result = await deactivateService({ fetchFn }, service.id);
    setBusyId(null);
    if (!result.ok) {
      setError(result.code === "SERVICE_IN_USE" ? t.deactivateGuidance : result.message);
      return;
    }
    setServices((current) => current.map((s) => (s.id === result.data.id ? result.data : s)));
  }

  async function handleDelete(service: ServiceView) {
    setBusyId(service.id);
    setError(null);
    const result = await requestJson<{ ok: boolean }>(
      { fetchFn },
      `/api/admin/services/${encodeURIComponent(service.id)}`,
      { method: "DELETE" },
    );
    setBusyId(null);
    if (!result.ok) {
      setError(result.code === "SERVICE_IN_USE" ? t.deactivateGuidance : result.message);
      return;
    }
    setServices((current) => current.filter((s) => s.id !== service.id));
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">{t.title}</h1>

      <section aria-label={editing ? t.edit.title : t.create.title} className="space-y-4">
        <h2 className="text-lg font-semibold">{editing ? t.edit.title : t.create.title}</h2>
        <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700" htmlFor="service-name">
              {t.fields.name}
            </label>
            <input
              id="service-name"
              name="name"
              required
              value={form.name}
              placeholder={t.fields.namePlaceholder}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-900"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700" htmlFor="service-price">
                {t.fields.priceBRL}
              </label>
              <input
                id="service-price"
                name="priceBRL"
                type="number"
                min="0"
                step="0.01"
                required
                value={form.priceBRL}
                onChange={(event) => setForm({ ...form, priceBRL: event.target.value })}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-900"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700" htmlFor="service-duration">
                {t.fields.durationMinutes}
              </label>
              <input
                id="service-duration"
                name="durationMinutes"
                type="number"
                min="1"
                step="1"
                required
                value={form.durationMinutes}
                onChange={(event) => setForm({ ...form, durationMinutes: event.target.value })}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-900"
              />
            </div>
          </div>

          {editing ? (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(event) => setForm({ ...form, active: event.target.checked })}
                className="h-4 w-4 rounded border-slate-300"
              />
              {t.fields.active}
            </label>
          ) : null}

          {error ? (
            <p role="alert" className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </p>
          ) : null}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={submitting}
              className="rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {submitting
                ? editing
                  ? t.edit.submitting
                  : t.create.submitting
                : editing
                  ? t.edit.submit
                  : t.create.submit}
            </button>
            {editing ? (
              <button
                type="button"
                onClick={cancelEdit}
                className="rounded-full border border-slate-300 px-5 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-900 hover:text-slate-900"
              >
                {t.edit.cancel}
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section aria-label={t.title} className="space-y-3">
        {services.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 p-4 text-sm text-slate-600">{t.empty}</p>
        ) : (
          <ul className="space-y-3">
            {services.map((service) => {
              const busy = busyId === service.id;
              return (
                <li
                  key={service.id}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 p-4"
                >
                  <div className="space-y-1">
                    <p className="font-medium text-slate-900">
                      {service.name}
                      {!service.active ? (
                        <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                          {t.inactive}
                        </span>
                      ) : null}
                    </p>
                    <p className="text-sm text-slate-600">
                      {brl.format(service.priceBRL)} · {service.durationMinutes} min
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => startEdit(service)}
                      className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-900 hover:text-slate-900"
                    >
                      {t.actions.edit}
                    </button>
                    <button
                      type="button"
                      disabled={busy || !service.active}
                      onClick={() => void handleDeactivate(service)}
                      className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-900 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {t.actions.deactivate}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleDelete(service)}
                      className="rounded-full border border-rose-200 px-4 py-2 text-sm font-medium text-rose-700 transition hover:border-rose-700 hover:text-rose-900 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {t.actions.delete}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}