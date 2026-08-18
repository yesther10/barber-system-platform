# Design: Public Barbershop Directory

## Technical Approach

Additive extension of the archived `catalog-booking-public-flow` flow. **PR1 (backend)**: `PublicBarbershopView` contract, `listPublicBarbershops` service fn (≥1 active service filter), thin `GET /api/public/barbershops` route + route tests. **PR2 (UI+E2E)**: `"tenant"` step in the URL-state machine (empty slug → picker), picker step component, `fetchPublicBarbershops` helper, PT-BR i18n, test flips + new picker tests, home-CTA E2E. No schema change — listability is a service-join filter. URL params stay the single source of truth (archived decision); `slug:""` already means "no tenant", so the picker is a natural pre-scoping entry.

## Architecture Decisions

| Decision | Options | Choice | Rationale |
|---|---|---|---|
| Slug-less entry | separate `/directory` page vs picker-first in `/booking` vs home-page directory | Option A: picker as first `"tenant"` step when slug absent; `?slug=` unchanged; home CTA stays `/booking` "Agendar horário" | Extends the archived URL-state decision — `slug:""` already encodes "no tenant"; login safe-default `/booking` lands navigable; zero new routes/CTA churn |
| Listable definition | new `active` column vs raw SQL join vs Prisma relation filter | `barbershop.findMany({ where: { services: { some: { active: true } } }, select: { slug, name }, orderBy: { name: "asc" } })` | Mirrors `getPublicBarbersByService`'s `some` filter; one query; `select` projects only slug/name so identity can't leak; no migration |
| Public view shape | full `BarbershopView` vs `id`+slug+name vs slug+name | `PublicBarbershopView { slug, name }`, Zod-enforced | Mirrors `PublicBarberView` minimal surface; slug is the picker select key; no internal identity (proposal risk) |
| Picker list markup | dedicated component vs generalize `StepList` | Generalize `StepList` with optional `keyFor`/`valueFor` (defaults preserve existing call sites) | `PublicBarbershopView` has no `id`; zero changes to services/barbers steps, one shared list style |
| Route error surface | full TENANT/INVALID mapping vs minimal skeleton | try/catch skeleton; unexpected errors rethrow → 500; 404/400 branches inert in v1 | Bare GET has no params to parse — those codes are unreachable; skeleton keeps the sibling pattern for future query params |
| Directory fetch failure | silent dead-end vs services-step-style error | `errors.network` PT-BR message + "Tentar novamente" retry (retryKey bump, mirrors `retryPayment`); helper maps 5xx/network → `{ step: "tenant", code, message }` | Delta spec lacks this scenario; reuses existing i18n and the services-step error pattern |
| Spec-order coherence | (a) leave canonical spec + archive note vs (b) minor canonical amendment | (a) | Canonical "services → barber → date/slot → confirm" applies to an already-scoped flow; delta already frames picker as pre-scoping ("BEFORE any catalog step"); one-line clarification at archive keeps this change additive |
| Retry copy | reuse `payment.retry` vs new booking-level key | `booking.retry: "Tentar novamente"` | `payment.retry` lives in the payment namespace — semantically wrong for the picker |
| Picker ordering | `createdAt asc` vs `name asc` | `name asc` | User-facing list; deterministic and stable |

### Step-union sync points (`"tenant"` — risk 4)

1. `BookingStep` union — `booking-state.ts:10` (adds `"tenant"` first)
2. `bookingStepOf` — `if (!selection.slug) return "tenant"` after the appointmentId check
3. `stepTitle` Record — `booking-flow.tsx:338` (exhaustive Record; TS fails until updated)
4. `BookingApiFailure.step` — `booking-api.ts` (compile-time enforced via the union)
5. `bookingReducer` — new `select-barbershop` action clearing downstream (`serviceId/barberId/date/slot`); codec unchanged (empty slug already dropped by `selectionToParams`)
6. Tests — `booking-state.test.ts`, `booking-api.test.ts`, `booking-flow.test.tsx`, `booking-flow.container.test.tsx`

## Data Flow

```text
/booking (no slug) ─▶ bookingStepOf → "tenant"
   │ GET /api/public/barbershops (no session)
   │    route → listPublicBarbershops → [{ slug, name }]
   ▼
PickerStep ─ select(slug) ─▶ go(select-barbershop)
   │    router.replace(/booking?slug=…)  (downstream cleared)
   ▼
services ─▶ barbers ─▶ date/slot ─▶ confirm   (archived flow, untouched)
   │
   login gate next=/booking?slug=… (unchanged)
```

## File Changes

| File | Action | Description |
|---|---|---|
| `packages/contracts/src/catalog.ts` | Modify | + `PublicBarbershopView` |
| `apps/web/lib/catalog.ts` | Modify | + `listPublicBarbershops(db)`; select-projection needs no mapper |
| `apps/web/app/api/public/barbershops/route.ts` | Create | Thin GET, `force-dynamic`, try/catch skeleton |
| `apps/web/app/api/public/barbershops/route.test.ts` | Create | 200 list / empty array / mock service fn / 500 |
| `apps/web/lib/booking-state.ts` | Modify | + `"tenant"` step, stepOf branch, `select-barbershop` action |
| `apps/web/lib/booking-api.ts` | Modify | + `fetchPublicBarbershops(deps)` → `/api/public/barbershops`, step `"tenant"` |
| `apps/web/lib/i18n.ts` | Modify | + `stepTenant`, `emptyBarbershops`, `retry`; error reuses `errors.network` |
| `apps/web/app/(public)/booking/booking-flow.tsx` | Modify | `stepTitle` + `StepList` props; picker step, fetch effect, retry, render branch |
| `apps/web/lib/booking-state.test.ts` | Modify | + empty-slug → tenant; reducer clears downstream |
| `apps/web/lib/booking-api.test.ts` | Modify | + fetchPublicBarbershops describe |
| `apps/web/app/(public)/booking/booking-flow.test.tsx` | Modify | **FLIP :210** → picker; + picker presentational tests |
| `apps/web/app/(public)/booking/booking-flow.container.test.tsx` | Modify | + mounted picker tests (loading→list, error→retry refetch, select→replace) |
| `tests/integration/catalog.test.ts` | Modify | + list scenarios (both listed / all-inactive excluded / empty 200 / no id in payload) |
| `apps/web/e2e/booking-public-flow.spec.ts` | Modify | + home-CTA journey: `/` → "Agendar horário" → picker → select seeded shop → services step |

## Interfaces / Contracts

```ts
// packages/contracts/src/catalog.ts
/** Public directory entry — slug + name ONLY (no internal identity). */
export const PublicBarbershopView = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
});
export type PublicBarbershopView = z.infer<typeof PublicBarbershopView>;

// booking-state.ts — stepOf order: appointmentId → !slug → !serviceId → !barberId → !date/!slot → confirm
export type BookingStep = "tenant" | "services" | "barbers" | "date-slot" | "confirm" | "waiting";

// booking-api.ts — existing requestJson handles error mapping; step: "tenant"
export async function fetchPublicBarbershops(
  deps: BookingApiDeps,
): Promise<BookingApiResult<PublicBarbershopView[]>> {
  return requestJson<PublicBarbershopView[]>(deps, "tenant", "/api/public/barbershops");
}
```

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | stepOf (empty slug → tenant; slug present → unchanged), reducer clears downstream, helper mapping (200/500/NETWORK), picker presentational (list/empty PT-BR), StepList backward-compat | Vitest DI mocks (mirrors existing suites) |
| Integration | both listed; all-inactive excluded; empty → 200 `[]`; payload has only slug/name | Testcontainers MySQL (mirrors `catalog.test.ts`) |
| E2E | `/` CTA → picker → select seeded shop → services step; `?slug=` journey untouched | Playwright shared fixture server |

## Migration / Rollout

No migration, no schema change, no feature flag. 2 chained PRs stacked-to-main: **PR1 backend** (~120–150 lines: contract, service, route, route tests) → **PR2 UI+E2E** (~300–350: state/codec, picker, i18n, test flips, E2E). Each independently revertible; rollback is reverse order (UI → state → route/service/contract). Slug-present flows never render the picker.

## Open Questions

None blocking. `booking.retry` duplicates `payment.retry` copy — optional later consolidation, out of scope.
