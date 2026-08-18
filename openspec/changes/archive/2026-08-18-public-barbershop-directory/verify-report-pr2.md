# Verify Report — public-barbershop-directory (PR2 UI+E2E)

**Change**: public-barbershop-directory (PR2 UI+E2E slice)
**Branch**: `feat/public-barbershop-directory-ui` (off main; PR1 backend merged as cd558ad)
**Mode**: Strict TDD (openspec/config.yaml `strict_tdd: true`; runner `pnpm test` / Vitest)
**Date**: 2026-08-18
**Verifier**: independent sub-agent (not the implementer)

## Completeness

| Metric | Value |
|--------|-------|
| Tasks total (PR2) | 5 (2.1–2.5) |
| Tasks complete | 5 |
| Tasks incomplete | 0 |

## Build & Tests Execution

**Tests (unit)**: ✅ 312 passed / 0 failed (47 files) — `pnpm test`

```text
Test Files  47 passed (47)
Tests       312 passed (312)
```

**Typecheck**: ✅ 9/9 tasks — `pnpm typecheck` (incl. `next typegen && tsc --noEmit` for web)

**Lint**: ✅ 0 errors / 3 warnings — `pnpm lint`. All 3 warnings pre-existing and outside PR2-changed lines (`booking-flow.tsx:790` QR `<img>`, `api/me/export/route.ts:9`, PR1 `route.ts:13` `_request`).

**E2E (targeted)**: ✅ 3/3 — `pnpm exec playwright test -c apps/web/playwright.config.ts apps/web/e2e/booking-public-flow.spec.ts` (Testcontainers MySQL + Next dev server)

```text
✓ home CTA lands on the tenant picker; selecting a barbershop continues the flow
✓ guest browses, passes the login gate, books, sees the Pix QR and the paid status
✓ a slot conflict returns the signed-in client to the slot step with PT-BR copy
  3 passed
```

**E2E (full)**: ✅ 18/18 — `pnpm test:e2e` (no regression across all suites)

```text
Running 18 tests using 5 workers
  18 passed (27.5s)
```

**Coverage (changed files)**: ✅ — `pnpm test:coverage`

| File | Line % | Rating |
|------|--------|--------|
| `apps/web/lib/booking-state.ts` | 100% | ✅ Excellent |
| `apps/web/lib/booking-api.ts` | 97.4% | ✅ Excellent |
| `apps/web/app/(public)/booking/booking-flow.tsx` | 84.5% | ⚠️ Acceptable (≥80%) |
| `apps/web/lib/i18n.ts` | 75% | ➖ gap is L79 `t()` helper — pre-existing, unused by new keys |

## Spec Compliance Matrix (booking delta — Directory Entry Step)

| Requirement | Scenario | Covering test | Result |
|-------------|----------|---------------|--------|
| Directory Entry Step | Guest lands on /booking without a slug → picker first, no services before selection | unit `booking-flow.test.tsx` "renders the tenant picker for an empty tenant slug, before any catalog step" (asserts "Escolha a barbearia" + NOT "Escolha o serviço") + container "renders loading then the tenant picker once the directory resolves" + E2E home-CTA journey (heading visible before any catalog step) | ✅ COMPLIANT |
| Directory Entry Step | Guest selects a barbershop → slug set, flow proceeds to services | unit `booking-state.test.ts` "select-barbershop sets the slug and clears every downstream selection" + container "selecting a barbershop replaces the URL with its slug, clearing downstream" (`/booking?slug=barba-real`, second item proves valueFor) + E2E (slug param asserted, "Escolha o serviço" + "Corte" loads) | ✅ COMPLIANT |
| Directory Entry Step | Guest lands with a slug → picker skipped, unchanged | unit `booking-flow.test.tsx` "renders the services step for a slug-only selection" + `booking-state.test.ts` "starts at services until a service is chosen" + E2E `browseToConfirm` journeys (slug-present, 3/3 targeted) | ✅ COMPLIANT |
| Directory Entry Step | Login handoff safe-default lands on the picker, navigable | E2E `register.spec.ts` "guest registers and is auto-signed-in to the sanitized destination" (asserts heading "Escolha a barbearia" + seeded shop button visible after `next=/booking?step=confirm`) | ✅ COMPLIANT |

**Compliance summary**: 4/4 booking scenarios compliant.

**Catalog delta (PR1)**: out of PR2 scope. Diff = 12 files, ALL UI/E2E/openspec — zero backend drift (no `packages/contracts`, `apps/web/lib/catalog.ts`, or route files touched).

## Correctness (Static Evidence)

| Requirement | Status | Notes |
|------------|--------|-------|
| `"tenant"` step: appointmentId check first, then empty slug → tenant; slug present unchanged | ✅ Implemented | `bookingStepOf` order: appointmentId → !slug → !serviceId → !barberId → !date/!slot → confirm (booking-state.ts:38-45) |
| `select-barbershop` clears ALL downstream incl. appointmentId | ✅ Implemented | Reducer returns `{...selection, slug, serviceId/barberId/date/slot/appointmentId: undefined}` (L56-64) — appointmentId clearing is a justified superset of design text: keeping it would route to "waiting" with a foreign booking (stepOf checks appointmentId first). Tested: `{ slug: "barba-real" }` |
| Codec unchanged (empty slug dropped) | ✅ Implemented | `selectionToParams` `if (value)` — zero diff on codec; round-trip tests still green |
| `fetchPublicBarbershops` → `requestJson(..., "tenant", "/api/public/barbershops")`; 200/500/network mapping | ✅ Implemented | booking-api.ts:119-123; `messageFor` default + NETWORK catch reuse `errors.network` (no duplication) |
| i18n: `stepTenant` "Escolha a barbearia", `emptyBarbershops`, `booking.retry` "Tentar novamente"; `errors.network` reused | ✅ Implemented | i18n.ts:22,29,35; no new network copy |
| StepList `keyFor`/`valueFor` generalization; services/barbers call sites unchanged | ✅ Implemented | Defaults `(item as {id?:string}).id ?? ""`; services/barbers pass no overrides; tenant passes `shop.slug` both |
| Fetch effect on tenant step + error/retry mirroring services pattern | ✅ Implemented | Effect L429-445 with `tenantRetryKey` bump; retry button + `errors.network` + loading state (L679-701) |
| `stepTitle` exhaustive Record includes tenant | ✅ Implemented | L367-374; TS enforces union completeness |
| Test flips: empty-slug assertion + register safe-default | ✅ Implemented | `booking-flow.test.tsx` old "renders the services step for an empty tenant slug" → "renders the tenant picker…" (diff confirms); `register.spec.ts:46` asserts picker after sign-in |
| E2E: home-CTA journey + fixture `name` field | ✅ Implemented | `booking-public-flow.spec.ts:66-86`; `E2EFixture.shop` has `name`; `start-server.ts:208` writes `name: shop.name` |

## Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| Picker as first `"tenant"` step when slug absent; `?slug=` unchanged; home CTA stays `/booking` | ✅ Yes | Render branch is additive; slug-present flows never render the picker |
| StepList generalization with `keyFor`/`valueFor` defaults | ✅ Yes | Working shape per apply-progress gotcha (unconstrained T, weak-type relaxation) |
| Directory fetch failure → `errors.network` + "Tentar novamente" retry (retryKey bump) | ✅ Yes | `tenantRetryKey` mirrors `retryPayment`; container test proves refetch (2 calls) |
| `booking.retry` new key (not `payment.retry`) | ✅ Yes | `booking.retry: "Tentar novamente"` at i18n.ts:35; `payment.retry` untouched |
| Step-union sync points (union, stepOf, stepTitle, BookingApiFailure.step, reducer, tests) | ✅ Yes | All 6 sync points updated; exhaustive Record compiles |
| Test-first with RED→GREEN→triangulate | ✅ Yes | Corroborated via git parent: parent of `beda5f0` has 0 `tenant` refs in booking-state.ts and the old :210 assertion — new tests could not pass pre-change |

## TDD Compliance (Strict TDD module)

| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | ✅ | apply-progress (#968) has per-task RED/GREEN/triangulated evidence for 2.1–2.5 |
| All tasks have tests | ✅ | 5/5 tasks have test files |
| RED confirmed (tests exist) | ✅ | 5/5 test files verified on branch; git-parent corroboration (parent has no `tenant`, old :210 assertion intact) |
| GREEN confirmed (tests pass) | ✅ | 312/312 unit + 18/18 E2E pass on execution |
| Triangulation adequate | ✅ | 2.1: 3 stepOf/reducer cases; 2.2: 200/500/network; 2.4: empty + 2-item list + 3 mounted cases (loading→list, error→retry, select→replace) |
| Safety Net for modified files | ✅ | Modified: booking-flow.test.tsx, register.spec.ts, booking-state.test.ts — baseline 301 + 11 new = 312 all green; full E2E 18/18 |

## Test Layer Distribution

| Layer | Tests (new) | Files | Tools |
|-------|-------------|-------|-------|
| Unit | 11 new | 3 (booking-state, booking-api, booking-flow) | Vitest |
| Integration (mounted) | 3 new | 1 (booking-flow.container.test.tsx) | Vitest + happy-dom + RTL |
| E2E | 1 new journey + 1 flip | 2 (booking-public-flow, register) | Playwright + Testcontainers MySQL |

## Assertion Quality (Step 5f Audit)

**Assertion quality**: ✅ All assertions verify real behavior.

- No tautologies, no ghost loops, no orphan empty checks (TenantStep empty-state has a 2-item non-empty companion), no smoke-only tests (every render asserts specific PT-BR copy or navigation).
- Container select test clicks the SECOND item to prove `valueFor` drives the URL (`/booking?slug=barba-real`) — not implementation-coupled.
- Error→retry test asserts `fetchFn` called exactly twice (refetch proven) and error text disappears.
- Mock/assertion ratio healthy: ≤1 mock per test, 2–4 behavioral asserts each.

## Quality Metrics

**Linter**: ✅ 0 errors / 3 warnings (all pre-existing, none in PR2-changed lines)
**Type Checker**: ✅ No errors (9/9 tasks)
**Coverage**: ✅ changed files ≥80% except i18n.ts (75% — L79 `t()` helper, pre-existing and unused by the new keys)

## Issues Found

**CRITICAL**: None

**WARNING**: None

**SUGGESTION**:
1. `apps/web/lib/i18n.ts` (L79) — `t()` function remains uncovered (75% lines); it is pre-existing and unused by the new picker keys, so this is not a change gap. Could be removed or tested opportunistically.
2. `booking-state.ts` reducer `select-barbershop` also clears `appointmentId` — design sync-point text lists only `serviceId/barberId/date/slot`. The extra clearing is behaviorally REQUIRED (stepOf checks appointmentId first; keeping it would land on "waiting" with a foreign booking) and is covered by the reducer test. Consider one-line design amendment at archive.
3. `booking-flow.tsx` container tests use `.toBeTruthy()` presence checks in a few places — consistent with the existing suite style; value assertions accompany them in the same tests.

## Verdict

**PASS** — no CRITICAL or WARNING findings. Implementation provably matches the booking delta (4/4 scenarios compliant with passing covering tests at unit, container, and E2E layers), all 9 design decisions followed, all 5 PR2 tasks complete. Gates green: 312/312 unit, 9/9 typecheck, lint 0 errors, targeted E2E 3/3, full E2E 18/18, changed-file coverage ≥80%. Diff is 12 files, all UI/E2E/openspec — zero backend drift. SUGGESTION-level items are cosmetic and do not block merge.