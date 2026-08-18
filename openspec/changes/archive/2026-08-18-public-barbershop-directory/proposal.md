# Proposal: Public Barbershop Directory

## Intent

Home CTA → `/booking` (no `slug`) dead-ends at "Carregando..." forever — `bookingStepOf` derives step "services" with `slug: ""`, and the services effect early-returns on `!selection.slug` (`booking-flow.tsx:394`). No slug-less list endpoint exists; catalog spec defines only `/api/public/barbershops/{slug}/…`. Guests should see barbershops before schedules.

## Scope

### In Scope
- `GET /api/public/barbershops` + `PublicBarbershopView` (slug, name only)
- `listPublicBarbershops` (filter: ≥1 active service)
- `"tenant"` BookingStep + reducer/codec; picker as first step when slug absent
- PT-BR i18n; unit, route, E2E tests

### Out of Scope
- Tenant signup / admin onboarding
- Pagination, search, filtering
- Directory on home page (CTA stays `/booking`)
- Schema migration / `active` column

## Capabilities

### New Capabilities
None — deltas on existing specs.

### Modified Capabilities
- `catalog`: + "Public Barbershop Directory" — slug-less list of tenants with ≥1 active service, minimal view.
- `booking`: + "Directory entry step" — guest without `slug` sees the picker; `?slug=` unchanged.

## Approach

Option A: tenant-picker as first step inside `/booking` when `slug` absent. Extends archived URL-state decision (`catalog-booking-public-flow` design.md — URL params as single source of truth; `slug:""` already means "no tenant"). Login safe-default `/booking` lands on a navigable picker. Listable = ≥1 `active: true` service (proxy for operational; no schema change). No pagination (codebase convention). Home CTA untouched.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `packages/contracts/src/catalog.ts` | Modified | + `PublicBarbershopView` |
| `apps/web/lib/catalog.ts` | Modified | + `listPublicBarbershops` |
| `apps/web/app/api/public/barbershops/route.ts` | New | Thin list route (static sibling of `[slug]/`) |
| `apps/web/lib/booking-state.ts` | Modified | + `"tenant"` step/codec |
| `apps/web/app/(public)/booking/booking-flow.tsx` | Modified | Picker step; no dead-end |
| `apps/web/lib/i18n.ts` | Modified | PT-BR copy |
| `tests/integration/catalog.test.ts` | Modified | List scenarios |
| `apps/web/e2e/booking-public-flow.spec.ts` | Modified | Home-CTA journey |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Step-union drift | Med | Reducer tests cover all steps |
| Assertion flip (`booking-flow.test.tsx:210`) | Med | Rewrite to picker; keep slug case |
| Half-configured tenants listed | Med | Listable = ≥1 active service |
| Identity leak | Low | slug+name only, Zod-enforced |

## Rollback Plan

Revert in reverse order (UI → state/codec → route/service/contract). Additive — `/booking?slug=` untouched. No migration.

## Dependencies

- `catalog` delta first (endpoint before UI)

## Success Criteria

- [ ] Guest on `/booking` (no slug) sees picker; picking one continues flow
- [ ] `/booking?slug=…` unchanged; home-CTA E2E green
- [ ] Route tests: empty DB, all-inactive tenant, 200, no session

## Effort Estimate

~6 tasks: contracts+service+route; route tests; state+codec; picker UI+i18n; integration; E2E. ~450–550 changed lines → 2 chained PRs (backend / UI+E2E).