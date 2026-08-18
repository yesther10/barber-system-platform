# Tasks: Public Barbershop Directory

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 450–550 total (PR1 ~180–220, PR2 ~300–350) |
| 400-line budget risk | High (total); Medium per-PR |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → PR 2 (stacked-to-main) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Backend: contract, service, route, tests | PR 1 → main | Merges alone |
| 2 | UI+E2E: tenant step, picker, i18n, tests | PR 2 → main | Needs PR 1 endpoint |

Commands: `pnpm test <path>` · `pnpm typecheck` · `pnpm lint` · `pnpm test:integration` · `pnpm exec playwright test -c apps/web/playwright.config.ts <spec>` (never `pnpm test:e2e --`)

## PR 1 — Backend (contract + service + route)

### Phase 1: Foundation

- [x] 1.1 **PublicBarbershopView contract** — add Zod `{ slug, name }` view to `packages/contracts/src/catalog.ts`, export from `src/index.ts`. Test-first: extend `packages/contracts/src/catalog.test.ts` — parses slug+name; rejects `id`/empty. Verify: `pnpm test packages/contracts/src/catalog.test.ts`; `pnpm typecheck`. Deps: none.
- [x] 1.2 **listPublicBarbershops service** — `apps/web/lib/catalog.ts`: `findMany({ where: { services: { some: { active: true } } }, select: { slug, name }, orderBy: { name: "asc" } })`. Test-first: extend `apps/web/lib/catalog.test.ts` (mocked prisma) — ≥1 active listed; all-inactive excluded; name asc; no id/userId leak. Verify: `pnpm test apps/web/lib/catalog.test.ts`. Deps: 1.1.

### Phase 2: Route + Verification

- [x] 1.3 **GET /api/public/barbershops route** — create `apps/web/app/api/public/barbershops/route.ts`: thin GET, `force-dynamic`, try/catch rethrow → 500. Test-first: create `route.test.ts` (mirror `[slug]/barbers/route.test.ts`) — 200 list, 200 empty `[]`, 500 on throw, no session. Verify: `pnpm test apps/web/app/api/public/barbershops/route.test.ts`; `pnpm typecheck`. Deps: 1.2.
- [x] 1.4 **Integration: directory scenarios** — extend `tests/integration/catalog.test.ts`: both listed; all-inactive excluded; empty → 200 `[]`; payload only slug/name. Verify: `pnpm test:integration`. Deps: 1.2–1.3.

## PR 2 — UI + E2E (tenant step, picker, i18n)

### Phase 1: State & Data

- [ ] 2.1 **"tenant" step + select-barbershop** — `apps/web/lib/booking-state.ts`: add `"tenant"` to `BookingStep`; `if (!selection.slug) return "tenant"` after appointmentId; `select-barbershop` clears serviceId/barberId/date/slot; codec unchanged. Test-first: extend `booking-state.test.ts` — empty slug → "tenant"; slug present → "services"; reducer clears downstream. Verify: `pnpm test apps/web/lib/booking-state.test.ts`. Deps: PR1 merged.
- [ ] 2.2 **fetchPublicBarbershops** — `apps/web/lib/booking-api.ts`: `requestJson<PublicBarbershopView[]>(deps, "tenant", "/api/public/barbershops")`. Test-first: extend `booking-api.test.ts` — 200 array; 5xx/network → `{ step: "tenant", code, message }`. Verify: `pnpm test apps/web/lib/booking-api.test.ts`. Deps: 2.1.
- [ ] 2.3 **PT-BR i18n** — `apps/web/lib/i18n.ts`: `stepTitle "Escolha a barbearia"`, `emptyBarbershops`, `booking.retry "Tentar novamente"`; reuse `errors.network`. No i18n test file — strings asserted via 2.4 container tests. Verify: `pnpm typecheck`. Deps: 2.2.

### Phase 2: Picker UI

- [ ] 2.4 **Picker step + StepList generalization** — `apps/web/app/(public)/booking/booking-flow.tsx`: StepList optional `keyFor`/`valueFor` (defaults preserve services/barbers call sites); `stepTitle` + `"tenant"` (exhaustive Record — TS enforces); fetch effect with retryKey bump + `errors.network` + retry button. Test-first: **FLIP `booking-flow.test.tsx:210`** empty-slug assertion → picker; + picker list/empty PT-BR; container tests (`booking-flow.container.test.tsx`) loading→list, error→retry refetch, select→`router.replace(/booking?slug=…)`. Verify: `pnpm test apps/web/app/\(public\)/booking/booking-flow.test.tsx`; same for container; `pnpm typecheck`; `pnpm lint`. Deps: 2.1–2.3.

### Phase 3: E2E

- [ ] 2.5 **E2E home-CTA journey** — `apps/web/e2e/booking-public-flow.spec.ts`: add `name` to E2EFixture `shop` (`{ slug, name }`), write `name: shop.name` in `apps/web/e2e/start-server.ts`; journey `/` → "Agendar horário" → picker → select "Tesoura E2E" by visible name → "Escolha o serviço"; `?slug=` journey untouched. Verify: `pnpm exec playwright test -c apps/web/playwright.config.ts booking-public-flow`. Deps: 2.4 + 1.1–1.3.
