# Verify Report — catalog-booking-public-flow (PR 2b re-check: C-1/C-2 closure)

**Change**: catalog-booking-public-flow
**Slice**: Catalog Browse UI — PR 2b (#47 `feat/catalog-booking-catalog-ui`, stacked on #46)
**Re-check scope**: verify fix batch (commits `8a5aaeb` + `6476ed8`) closing WARNINGs C-1 and C-2 from the previous report (2026-08-14). Base slice verification stands (see prior report).
**Mode**: Strict TDD (config.yaml marker + runner detected)
**Verifier**: independent sub-agent (NOT the implementer) — adversarial re-check
**Date**: 2026-08-14

## Verdict

**issues-found** — **PR 2b APPROVED** (C-1 and C-2 closed; 1 new non-blocking WARNING B-1 for orchestrator scheduling, suggestions carried forward).

- All gates green: unit 244/244 (was 227), typecheck 9/9, lint 0 errors (1 pre-existing warning in unrelated `api/me/export/route.ts:9`).
- **C-1 CLOSED** — stale-slot race is closed at render time via date-keyed derivation (`slotsForRender`/`slotsErrorForRender`), not via `setSlots(null)` in the effect (which would violate the team's `react-hooks/set-state-in-effect` convention). A previous date's grid physically cannot render or be clicked during the new date's in-flight fetch. Proven by unit tests (7 cases) + a deferred-promise mounted test (D1 grid gone → loading → D2 grid).
- **C-2 CLOSED** — new `booking-flow.container.test.tsx` (happy-dom + @testing-library/react) mounts the real container with injected mock `fetchFn` and asserts: loading→data, loading→error (404 + network reject), past-date no-fetch, no-date no-fetch, stale-grid clearing. `afterEach(cleanup)` present (Vitest runs without globals; RTL auto-cleanup never registers). All assertions behavioral, no tautologies. booking-flow.tsx coverage: 40% → 63.2% lines, 43.8% → 74.3% branch. The past-date spec scenario is now fully compliant (render guard + no-request both asserted).
- **New B-1 (WARNING)**: the barbers effect has the *same defect class* C-1 fixed — its list is not keyed to the serviceId it was fetched for, so changing service (browser-back → re-select, or URL edit) leaves the previous service's barbers visible/clickable during the refetch. Outcome is a caught error (BARBER_NOT_FOUND on the slots call), not a silent misbooking — lower impact than C-1. Fix: extend the date-keyed pattern to barbers (key by serviceId) before PR 3 adds the confirm step.
- No CRITICAL: no failing tests, no spec browse scenario untested at behavior level.

## Completeness

| Metric | Value |
|--------|-------|
| Tasks total (PR 2 scope) | 10 (2.1–2.10) |
| Tasks complete | 10 |
| Verify-fix batch | C-1 + C-2 (both closed) |
| Out of scope (PRs 3–4) | 10 (3.1–3.8, 4.1–4.2) |

## Build & Tests Execution

**Unit tests** (`pnpm test`): ✅ 244 passed / 0 failed — 44 files, ~3.2s (was 227/43; +11 pure unit +6 mounted container)
**Slice-scoped suite** (6 test files: tz, booking-state, booking-api, booking-flow, booking-flow.container, page): ✅ 59 passed / 0 failed (was 42)
**Typecheck** (`pnpm typecheck --force`): ✅ 9/9 tasks, 0 cached
**Lint** (`pnpm lint --force`): ✅ 0 errors, 1 warning pre-existing unrelated (`apps/web/app/api/me/export/route.ts:9` — not part of this change)
**Coverage** (scoped v8 run on booking-flow.tsx): ✅ lines 63.2% (was 40%), branch 74.3% (was 43.8%)

## Spec Compliance Matrix (catalog browse scope — unchanged base + past-date upgrade)

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| Public Booking Flow UI | Guest browses services → barber → date/slot (step order) | `booking-state.test.ts > bookingStepOf` + `booking-flow.test.tsx > step progression` | ✅ COMPLIANT |
| Public Booking Flow UI | Services listed publicly | `booking-flow.test.tsx > "lists service names and prices"` + `booking-api.test.ts` | ✅ COMPLIANT |
| Public Booking Flow UI | Barbers listed for a service | `booking-flow.test.tsx > "lists specialties"` + `booking-api.test.ts` | ✅ COMPLIANT |
| Public Booking Flow UI | Empty catalog step (no services / no barbers / no slots → PT-BR empty state) | `booking-flow.test.tsx` empty-state tests | ✅ COMPLIANT |
| Slot Selection and Error Mapping | Slot rendered in BR timezone | `tz.test.ts` + `booking-flow.test.tsx > "renders slots in BR timezone"` | ✅ COMPLIANT |
| Slot Selection and Error Mapping | Past date blocked client-side, **no slot request** | `booking-flow.test.tsx` (min attr) + **NEW** `booking-flow.container.test.tsx > "does not request slots for a past date"` (renders "Escolha uma data futura." + `fetchFn` not called) | ✅ COMPLIANT (upgraded from ⚠️ PARTIAL) |
| Slot Selection and Error Mapping | Booking API errors surfaced as PT-BR (404/400/network) | `booking-api.test.ts` (exact messages) + **NEW** container tests (404 → "Barbeiro não encontrado.", network → "Não foi possível carregar os dados.") | ✅ COMPLIANT |
| Booking Login Gate and Redirect Safety | `next` preserves selection via searchParams | `page.test.tsx` + `booking-state.test.ts` codec round-trip + `auth-redirect.test.ts` | ✅ COMPLIANT (gate itself PR 3) |
| Slot conflict 409 → slot step | (SLOT_CONFLICT mapping) | — | ➖ OUT OF SCOPE (PR 3) |

**Compliance summary**: 8/8 in-scope scenarios compliant, 0 partial, 0 failing, 1 out of scope.

## Correctness (fix-batch focus)

| Requirement | Status | Notes |
|------------|--------|-------|
| C-1 stale-slot race closed at render time | ✅ Closed | `slots`/`slotsError` stored as `{date, …}` and rendered only when `date === selection.date`. During D2 in-flight: `slotsForRender({D1…}, D2)` → `undefined` → loading, zero slot buttons in DOM → unclickable. Cancellation cleanup (`cancelled` flag) also prevents a late D1 resolution from clobbering D2 state. Back-nav to a cached date re-shows that date's own grid (cache, not staleness). |
| C-1 error analog | ✅ Closed | `slotsErrorForRender` hides a previous date's error while the new date loads; a stale error never masks the new date's loading/grid. |
| C-1 slot selection consistency | ✅ | Reducer still clears `slot` on `select-date` (booking-state.test.ts) — no D1 slot stays `aria-pressed` on D2. |
| Past-date guard (render + effect) | ✅ Tested | Render: `DateSlotStep` shows "Escolha uma data futura."; Effect: `slotsFetchParams` returns null (pure, 4 unit cases) and container test proves `fetchFn` never called. |
| `react-hooks/set-state-in-effect` convention | ✅ Respected | Fix uses derived render (`slotsForRender`) instead of synchronous `setSlots(null)` at effect start — the exact alternative the convention prescribes. Lint clean under eslint-config-next 16 + react-hooks 7. |
| Behavior tightening | ✅ | Slots effect now also requires `selection.slug` (matches services/barbers guards; prevents `/api/public/barbershops//slots`). No spec impact. |
| B-1 barbers stale-list race (same class as C-1) | ❌ Open (WARNING) | Barbers state is not keyed to serviceId. Service change (browser-back → re-select, or URL edit) leaves previous service's barbers visible/clickable during refetch; outcome is a caught BARBER_NOT_FOUND error on the slots call, not a silent misbooking. Pre-existing; not introduced by the fix batch. See B-1. |
| Services/barbers effects mount coverage | ⚠️ Gap (SUGGESTION) | Container tests cover only the date-slot step. Services/barbers effects (L252–282), their data-render branches (L331, 343) and interaction handlers (L157, 358–359) remain uncovered — acknowledged by the implementer as out of scope for this fix. |
| Fixed Y2099 test dates | ⚠️ Nit (SUGGESTION) | Container tests use hardcoded `2099-01-01/02` against real `today`. Pass now (2026); break after 2099-01-01. Prefer relative dates (`today + 30d`). |

## Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| URL search params as state source of truth | ✅ Yes | Unchanged; every action still `router.replace(bookingPathFor(...))`. |
| DI pattern (injected `deps`/`fetchFn`) | ✅ Yes (now tested) | Container accepts `deps` and 6 mounted tests inject mocks — the wiring the prior report flagged as untested is now executed. |
| Pure decision functions | ✅ Yes | `slotsFetchParams`/`slotsForRender`/`slotsErrorForRender` exported and unit-tested (11 cases) — matches the "extract pure logic" strand of the C-2 sanction, plus the mounted render the fix demanded. |
| Step machine order | ✅ Yes | Unchanged; reducer clearing of downstream selections still tested. |
| Date-keyed render vs set-state-in-effect | ✅ Yes | Consistent with the team's documented convention (no sync setState in effects). |
| Dev-dependency addition (DOM test stack) | ✅ Documented deviation | Root devDeps +`happy-dom`, `@testing-library/react`, `@testing-library/dom` — repo's first DOM stack; the apply-progress recorded the decision and rationale. Lockfile footprint ~185 lines, happy-dom over jsdom. |

## Issues Found

**CRITICAL**: None.

**WARNING**
1. **B-1 Barbers stale-list race (same class as C-1)** — `booking-flow.tsx` L268-284: the barbers effect stores the list unkeyed. After a service change (browser-back → services step → select different service, or direct URL edit), the previous service's barbers stay rendered and clickable while the new service's fetch is in flight; clicking one records `serviceId=B&barberId=<A's barber>` into the selection, which surfaces as a BARBER_NOT_FOUND error on the date-slot step (caught, not silent — lower impact than C-1, which could silently book the wrong time). Recommend extending the date-keyed pattern to barbers (store `{serviceId, barbers}`) before PR 3 builds the confirm step on the same harness. Orchestrator to decide: fold into PR 3 apply or schedule as its own fix.

**SUGGESTION** (carried from previous report, still open)
1. Empty-slug perpetual "Carregando..." (`booking-flow.tsx` L207) — render tenant-not-found state instead.
2. Services/barbers effects mount coverage — mirror the container suite for the first two steps (also the natural place to lock B-1's fix).
3. Y2099 fixed dates in container tests → relative dates.
4. DST-era fixture in `tz.test.ts` (pre-2019, UTC-2).
5. Price formatting via `Intl.NumberFormat("pt-BR", {style:"currency"})`.
6. Hydration safety for `todayInTz()` (compute server-side).
7. Defensive `Number.isNaN` guard in `formatSlotLocal`.
8. Slot buttons lack date context in accessible name.

## TDD Compliance (Strict — fix batch)

| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | ✅ | Engram #951 — apply-progress with TDD Cycle Evidence table (7 rows covering the fix batch). |
| All tasks have tests | ✅ | C-1 pure fns (booking-flow.test.tsx), C-1 stale-grid + C-2 (booking-flow.container.test.tsx). |
| RED confirmed | ✅ | Stale-grid test fails pre-fix by mechanism (old code rendered D1 grid during D2 in-flight → `queryByText("09:00")` non-null); pure fns had import-fail RED. Not provable from git (no separate RED commits) — same accepted limitation as the base slice. |
| GREEN confirmed | ✅ | 29/29 in the two booking-flow files on fresh execution; full suite 244/244. |
| Triangulation adequate | ✅ | slotsFetchParams 4 cases, slotsForRender 4, slotsErrorForRender 3, container 6 (incl. deferred-promise race) — distinct expected values, no single-case smoke. |
| Safety Net | ✅ | 227/227 pre-fix baseline; fix touched no existing assertions (booking-flow.test.tsx: +81/−0), only additions + new file. |
| Assertion Quality | ✅ | No tautologies, no ghost loops, no type-only-alone, no smoke-only. `toHaveBeenCalledTimes(2)` in the stale-grid test is load-bearing (proves D2 request fired) not implementation trivia. Mock:assertion ≤ 1 per test. |

**TDD Compliance**: 7/7 checks green.

## Test Layer Distribution

| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit (pure fn) | 38 | 4 (tz, booking-state, booking-api, booking-flow pure fns) | Vitest |
| Unit/SSR-render (no effects) | 15 | 2 (booking-flow presentational+step, page) | Vitest + react-dom/server |
| Integration (mounted, effects run) | 6 | 1 (booking-flow.container) | Vitest + happy-dom + @testing-library/react |
| Integration | 0 | 0 | (backend slice #43 covers API) |
| E2E | 0 | 0 | Playwright (PR 4, out of scope) |
| **Total (this slice)** | **59** | **6** | |

## Changed File Coverage (scoped vitest run, v8)

| File | Line % | Branch % | Uncovered | Rating |
|------|--------|----------|-----------|--------|
| `apps/web/app/(public)/booking/booking-flow.tsx` | 63.2% | 74.3% | L58, 141 (JSX-map quirks), L157 (slot click), L234 (default deps), L248 (go/router.replace), L252–282 (services/barbers effects), L301 (cancelled guard), L331, 343 (services/barbers data render), L358–359 (onSelect handlers) | ⚠️ Acceptable — C-2's target ranges (slots effect, loading/error/data rendering) now covered |

**Prior vs now**: slots effect + date-slot loading/error/data rendering executed; coverage 40% → 63.2% lines, 43.8% → 74.3% branch. Remaining uncovered is the services/barbers step wiring (SUGGESTION 2, WARNING B-1).

## Assertion Quality

**✅ All assertions verify real behavior** — 59 slice tests audited: no tautologies, no ghost loops, no empty-without-companion, no type-only-alone. The 6 container tests assert rendered PT-BR states, absence of stale DOM, fetch call counts + URLs — behavioral, not implementation-detail. The deferred-promise test is the strongest: it proves the D1 grid is *removed from the DOM* while D2 loads, which is the render-time closure of C-1.

## Quality Metrics

**Linter**: ✅ No errors (1 pre-existing warning, unrelated file)
**Type Checker**: ✅ No errors (fresh `--force`, 9/9 tasks)

## Per-PR Notes

- **PR 2a (#46)**: previously APPROVED — unchanged by the fix batch.
- **PR 2b (#47)**: **APPROVED** — C-1 and C-2 closed with behavioral proof; regression clean (no loading flash regression — loading on date change is the intended fixed behavior; first-load intact; selection not lost — reducer still clears slot on date change; lint/typecheck clean; `set-state-in-effect` respected via derived render). New WARNING B-1 (barbers stale-list, same class as C-1, milder impact) + SUGGESTIONs tracked for PR 3.
- Fix-batch scope hygiene: `8a5aaeb` touches only booking-flow.tsx + booking-flow.test.tsx; `6476ed8` only the new container test + package.json/lockfile. No leakage into lib/page/i18n.

## Next Recommended

1. Orchestrator: accept PR 2b (C-1/C-2 closed) and schedule **B-1** (barbers stale-list) — either as a small fix inside the PR 3 apply window or its own commit before PR 3's confirm step lands (the confirm step will build on the same selection).
2. Then **sdd-apply for PR 3** (tasks 3.1–3.8), re-verifying the login-gate `next` handoff against the design.
3. PR 4 (E2E) after PR 3.

## Risks

- **B-1** (barbers stale-list): currently degrades to a visible error; if PR 3's confirm step reuses the unkeyed barbers state, the same race could surface in the confirm path — fix before PR 3 confirm logic.
- Container tests use fixed 2099 dates (Y2099 fragility) — cosmetic until then; relative dates recommended.
- Login-gate selection preservation still relies on codec + `sanitizeNextPath` (verified); PR 3 must build `/login?next=<bookingPathFor>` — re-verify at PR 3.
- DST: UTC-3 fixtures correct; pre-2019 fixture still suggested.

---

# Verify Report — catalog-booking-public-flow (PR 4 E2E)

**Change**: catalog-booking-public-flow
**Slice**: E2E — PR 4 (`feat/catalog-booking-e2e`, stacked on PR 3b tip `c82b6e2`)
**Re-check scope**: tasks 4.1 + 4.2 (booking-public-flow.spec.ts) + incidental payments.ts one-line import fix (`"./booking.js"` → `"./booking"`)
**Mode**: Strict TDD (config marker + runner detected)
**Verifier**: independent sub-agent (NOT the implementer)
**Date**: 2026-08-16

## Verdict

**PASS WITH WARNINGS** — **PR 4 APPROVED**. Branch scope clean (exactly the 2 intended work units), both E2E journeys green on fresh execution, payments.ts fix correct + minimal + regression-free. 2 WARNINGs (pre-existing E2E failures proven independent; apply-progress TDD table format gap), 0 CRITICAL.

## Completeness

| Metric | Value |
|--------|-------|
| Tasks total (PR 4 scope) | 2 (4.1, 4.2) |
| Tasks complete | 2 (verified at runtime — 4.1/4.2 checkboxes still `[ ]` on disk, SUGGESTION S-1 for archive) |
| Work units in branch (vs base c82b6e2) | `A apps/web/e2e/booking-public-flow.spec.ts` + `M apps/web/lib/payments.ts` — nothing else |

## Build & Tests Execution (executed this verify)

**Unit tests** (`pnpm test`): ✅ **294 passed / 0 failed** (46 files, ~3.5s) — no regressions from the import fix.
**Typecheck** (`pnpm typecheck`): ✅ 9/9 tasks (web executed fresh, cache miss — module resolution clean).
**Lint** (`pnpm lint`): ✅ 0 errors, 2 pre-existing warnings (`booking-flow.tsx:706` no-img-element — the QR `<img>` the E2E asserts intentionally; `api/me/export/route.ts:9` unused `_request` — unrelated).
**Targeted E2E** (`pnpm exec playwright test -c apps/web/playwright.config.ts apps/web/e2e/booking-public-flow.spec.ts`): ✅ **2/2 passed** (12.7s + 1.9s) — guest journey + slot-conflict journey.
**Full E2E suite**: ✅ **15 passed / 2 failed** — identical to apply's claim; the 2 failures are the pre-existing pair (see W-1).
**Isolation run** (register + login-booking-handoff WITHOUT the new spec): 6 passed / 2 failed — same two failures reproduce → proven independent of PR 4.
**Coverage**: ➖ Not meaningful for this slice — the only changed production file is a 1-line import (0 executable lines); `payments.ts` sits at 0% under Vitest by design (unit tests mock `@/lib/payments` — the documented reason the bug was latent) and is exercised by integration + E2E execution; the E2E spec is not instrumented by Vitest.

## Spec Compliance Matrix (PR 4 scope — booking delta)

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| Public Booking Flow UI | Guest browses the full flow (selection preserved to gate) | `booking-public-flow.spec.ts > guest browses...` — gate URL + decoded `nextPath` asserts slug/serviceId/barberId/date/slot | ✅ COMPLIANT |
| Public Booking Flow UI | Payment confirmed (paid → "Pagamento recebido" after polling) | Test 1 (admin mark-paid in separate context → poller → paid copy) + integration `payments-worker.test.ts:163` (webhook → PAID) + `:194` (manual mark-paid → paid) | ✅ COMPLIANT (sanctioned 2-layer proof — design open question resolved: real MP `getPayment` rejects fake token → webhook 500; HMAC verification itself passed) |
| Public Booking Flow UI | Empty catalog step | unit/container layer (PR 2/2b) | ➖ OUT OF PR 4 SCOPE (carried) |
| Booking Login Gate | Guest gated at booking (next preserves selection; return to same step) | Test 1 | ✅ COMPLIANT |
| Booking Login Gate | Unsafe next target | `login-booking-handoff.spec.ts:46` (PASSED in isolation run) + `auth-redirect.test.ts` | ✅ COMPLIANT |
| Slot Selection and Error Mapping | Slot rendered in BR timezone (12:00Z → 09:00) | Test 1 asserts `button "09:00"` visible (spec's own BR-tz example) | ✅ COMPLIANT |
| Slot Selection and Error Mapping | Past date blocked, no request | unit + container (PR 2b upgraded) | ➖ OUT OF PR 4 SCOPE (carried) |
| Slot Selection and Error Mapping | Slot conflict surfaced (409 → slot step + PT-BR) | Test 2 — heading "Escolha o dia e horário", `slot` URL param dropped, exact copy "Este horário acabou de ser ocupado. Escolha outro horário." | ✅ COMPLIANT |

**Compliance summary**: 6/6 in-scope scenarios compliant (5 newly proven at E2E level + unsafe-next re-confirmed), 0 partial, 0 failing.

## Correctness (PR 4 focus)

| Requirement | Status | Notes |
|------------|--------|-------|
| payments.ts fix: correct | ✅ | `"./booking.js"` → `"./booking"` — extensionless like every other relative import in apps/web (grep: zero `.js`-suffixed relative imports remain). `lib/booking.ts` exists (17KB). |
| payments.ts fix: minimal | ✅ | 1 insertion / 1 deletion, no collateral changes. |
| payments.ts fix: no regressions | ✅ | Unit 294/294, typecheck 9/9. E2E Test 1 reached the QR screen → `POST /api/payments/[id]/pix` executes in Next dev/Turbopack — empirical proof the dev 500/wedged-server failure is resolved (the fix's raison d'être). |
| E2E journeys behavioral | ✅ | QR asserted by presence (`img` role + `src` `/^data:image\/png/`), NOT decoded — per design. PT-BR copy asserted on conflict path. Selection preservation asserted via all 5 `next` params. |
| No hard-coded flaky waits | ✅ | Zero `waitForTimeout`/`setTimeout` in the spec; Playwright auto-waiting only. |
| Cleanup / teardown | ✅ | `try/finally adminContext.close()`; client context auto-closed by Playwright; fixture JSON removed by `start-server.ts` cleanup. |
| Order independence | ✅ | Journey uses 12:00Z ("09:00") and conflict uses 12:30Z ("09:30") — free slots; seeded 13:00Z ("10:00") reserved for booking-qr; grid lists free slots only; fixture date 2026-10-07 = Wednesday = `dayOfWeek: 3` ✓. |

## Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| E2E via Playwright `start-server.ts` fixture + `/tmp/opencode/barber-system-platform-e2e.json` | ✅ Yes | Used exactly as designed (Testcontainers MySQL 8 + migrations + seed + `next dev`). |
| QR by presence, not decode | ✅ Yes | `expect(qr).toHaveAttribute("src", /^data:image\/png/)` — L118-120. |
| Paid-flip fallback: integration-only proof if webhook flaky | ✅ Yes | Open question resolved empirically (webhook 500 with fake token; HMAC passed); E2E flips via admin `POST /api/admin/appointments/{id}/pay` in a separate context; webhook→paid proven at integration (`payments-worker.test.ts:163,194`). Rationale documented in spec comments. |
| No schema/migration/package changes in PR 4 | ✅ Yes | Branch diff is 2 files only; fixture/server infra was already in the repo. |

## Issues Found

**CRITICAL**: None.

**WARNING**
1. **W-1 Pre-existing E2E failures — NOT caused by PR 4** — `register.spec.ts:26` ("guest registers...") and `login-booking-handoff.spec.ts:19` ("booking → login → return handoff") stall on `/booking`'s "Carregando..." for freshly-registered users. Evidence of independence: isolated run of these two files WITHOUT the new spec reproduces the exact same 2 failures (6 passed / 2 failed); failure page snapshot shows `heading "Escolha o serviço"` + `paragraph: Carregando...` — the /booking services fetch never resolves for a freshly-registered session. Full suite stays red (15/2) until fixed. Recommend a follow-up task (suspected registered-user booking-state path, e.g. session/state hydration after register redirect).
2. **W-2 TDD evidence format gap** — apply-progress #951's current revision (Phase 4 completion) does NOT carry the formal "TDD Cycle Evidence" table its prior revisions had (#952 cites it for the fix batch). Phase 4 evidence exists in narrative form: RED observed empirically (pix route 500 wedged the dev server → journey failed pre-fix), fix `9e407d6` → GREEN (confirmed by this verify's 2/2). Substance verified; format regression from the revision overwrite. SUGGESTION for apply/archive discipline: keep the table per batch.

**SUGGESTION**
1. **S-1** tasks.md on disk still lists 4.1/4.2 as `[ ]` — archive phase should tick them (apply updated Engram only).
2. **S-2** Test 1 duplicates the browse-to-confirm steps inline instead of reusing the `browseToConfirm` helper (used only by Test 2) — cosmetic DRY.
3. **S-3** If a fake Mercado Pago provider harness ever becomes available, E2E could flip paid via the real webhook POST for a true end-to-end webhook→UI proof (currently the sanctioned 2-layer split).

## TDD Compliance (Strict — Phase 4)

| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | ⚠️ | Narrative in #951 (no formal table in current revision — W-2); tasks.md 4.1 (RED) + 4.2 (GREEN) define the cycle |
| All tasks have tests | ✅ | 4.1/4.2 → `booking-public-flow.spec.ts` exists (193 lines, 2 journeys) |
| RED confirmed | ✅ | Test file exists; RED by mechanism + documented empirical failure (pix route 500 pre-fix wedged dev server; journey could not complete) |
| GREEN confirmed | ✅ | 2/2 pass on fresh execution; full suite 15/2 matches apply's claim |
| Triangulation | ✅ | 2 journeys × distinct behaviors (happy path incl. paid flip; conflict path); multi-assertion per journey, distinct expected values |
| Safety Net | ✅ | No existing test files modified (new spec + 1-line lib fix); unit suite 294/294 |
| Assertion Quality | ✅ | No tautologies, ghost loops, type-only-alone, smoke-only, mock-heaviness; no hard waits; cleanup correct |

**TDD Compliance**: 6.5/7 (evidence reported in narrative form, not table — format gap only).

## Test Layer Distribution

| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit (Vitest) | 294 | 46 | Vitest 4.1.10 |
| Integration (webhook→paid, mark-paid) | covered (`payments-worker.test.ts:163,194`) | — | Vitest integration config + Testcontainers (not re-run this session; E2E consumed Docker) |
| E2E (this slice) | 2/2 | 1 (`booking-public-flow.spec.ts`) | Playwright 1.62.1 + Testcontainers + next dev |
| E2E (full suite) | 15 pass / 2 pre-existing fail | 6 | Playwright |

## Assertion Quality

**✅ All assertions verify real behavior** — both journeys audited: URL/param assertions (gate + selection preservation), role/name queries on PT-BR headings, QR presence + `src` pattern (not decode), exact-copy assertions ("Aguardando confirmação do pagamento...", "Pagamento recebido!", conflict copy), HTTP status assertions (CSRF ok, credentials callback ok, pay 200 + `paymentStatus: "paid"`, conflict booking 201). No hard waits, no implementation-detail coupling (no CSS-class assertions), no tautologies.

## Quality Metrics

**Linter**: ✅ No errors (2 pre-existing warnings — QR `<img>` at booking-flow.tsx:706 asserted by the E2E by design; unrelated unused `_request` at api/me/export/route.ts:9)
**Type Checker**: ✅ No errors (fresh, 9/9)

## Per-PR Notes

- **PR 1 / PR 2a / PR 2b / PR 3 / PR 3b**: previously APPROVED — unchanged by PR 4 (branch diff contains no overlapping files).
- **PR 4 (this report)**: **APPROVED** — E2E journeys green (2/2), full suite 15/2 identical to apply's claim, pre-existing failures proven independent, payments.ts fix correct/minimal/regression-free and empirically proven working in Next dev (Turbopack) via the pix route executing in Test 1. No scope leakage: branch = spec + fix only, no openspec/ commits.
- **tasks.md 4.1/4.2**: complete at runtime; checkboxes pending archive sync (S-1).

## Next Recommended

1. Orchestrator: accept PR 4 (merge `feat/catalog-booking-e2e` into the chain) — chain of 7 PRs is complete; only **sdd-archive** remains (tick 4.1/4.2, sync delta specs to base).
2. Optional follow-up task (separate change): fix the `/booking` "Carregando..." stall for freshly-registered users (closes W-1, un-reds the full E2E suite: register.spec.ts:26 + login-booking-handoff.spec.ts:19).

## Risks

- **W-1** (pre-existing, proven independent): full E2E suite stays 15/2 until the registered-user /booking stall is fixed — CI on the full suite will keep showing 2 failures; scope decision needed (accept as known pre-existing or schedule follow-up).
- **Webhook→UI paid proof** remains a 2-layer split (integration webhook + E2E admin mark-paid) — documented and sanctioned; acceptable unless a fake MP provider harness is added (S-3).
- `next dev` rewrites `apps/web/next-env.d.ts` (dev vs prod types path) — revert before committing (apply gotcha, still relevant for anyone re-running E2E locally).