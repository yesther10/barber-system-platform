```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:2f51d68b7ee73d20f8421f57f8a94f7654c85609171e6d622fcbca9a4ef83980
verdict: pass_with_warnings
blockers: 0
critical_findings: 0
requirements: 1/1
scenarios: 1/1
test_command: pnpm test apps/web/lib/admin-api.test.ts
test_exit_code: 0
test_output_hash: sha256:b750a7abe236330f4016ae6f3c7995977ddb5c59eb2d9c7b7538d85a11a77ed6
build_command: pnpm --filter @barber/web typecheck
build_exit_code: 0
build_output_hash: sha256:ed57ae21ec66be1fa50ddf0299ab9a99c6d4774a2b161b7ed7de5f40580b9b73
```
# Verify Report — admin-dashboard (S2a admin-api core + services fetchers)

**Change**: admin-dashboard (slice S2a — `lib/admin-api.ts` core + services fetchers)
**Branch**: `feat/admin-dashboard-2a` → base `main` (PR #67, open, MERGEABLE)
**Mode**: Strict TDD (openspec/config.yaml `strict_tdd: true`; runner `pnpm test` / Vitest + Playwright)
**Date**: 2026-08-20
**Verifier**: independent sdd-verify sub-agent (not the implementer)

## Completeness

| Metric | Value |
|--------|-------|
| Tasks total (S2a) | 2 (2.1–2.2) |
| Tasks complete | 2 |
| Tasks incomplete | 0 |

S2b–S6b tasks (2.3–6b.5) correctly remain unchecked — out of S2a scope. PR #67 diff = 3 files, 385 insertions / 2 deletions = 387 changed lines (≤400 ✓) — exactly the S2a file list (`lib/admin-api.ts` + `lib/admin-api.test.ts` new, `tasks.md` 2.1/2.2 check-marks), zero drift.

## Build & Tests Execution

**Slice units**: ✅ 24 passed / 0 failed — `pnpm test apps/web/lib/admin-api.test.ts`

```text
 Test Files  1 passed (1)
      Tests  24 passed (24)
```

**Full suite (safety net)**: ✅ 51 files / 354 passed / 0 failed — `pnpm test` (no regression; matches apply-progress's recorded post-S2a state 51/354 exactly)

**Typecheck**: ✅ clean — `pnpm --filter @barber/web typecheck` (`next typegen && tsc --noEmit`, types generated successfully)

**Lint (changed files)**: ✅ 0 errors — `pnpm exec eslint lib/admin-api.ts lib/admin-api.test.ts` (from apps/web, flat config)

**Coverage (changed code, v8)**: see Changed File Coverage — `admin-api.ts` 97.29% lines / 100% branches.

**E2E**: ➖ Not applicable to S2a — no E2E spec in this slice (the services spec is task 2.6 / S2b).

## Evidence (requirement → scenario → test → result)

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| Admin Services Page | Create and list a service | `admin-api.test.ts > listAdminServices > "returns services including inactive ones"` (active + inactive views parsed, GET `/api/admin/services`) + `> createService > "POSTs the parsed payload and returns the created service on 201"` (exact POST body incl. Zod-injected `active: true`; result `{ok:true,data}`) + `> createService > "fails client-side with INVALID_INPUT and does not fetch on an invalid payload"` (`fetchFn` never called) | ✅ COMPLIANT (fetcher layer; UI render half lands in S2b task 2.4) |
| Admin Services Page | 409 deactivate guidance (requirement text) | `admin-api.test.ts > requestJson > "extracts the error code and PT-BR message from a 4xx response"` (409 `{error:"SERVICE_IN_USE"}` → exact PT-BR deactivate-guidance string) + `> deactivateService > "surfaces a 409 SERVICE_IN_USE with its code and deactivate-guidance message"` (same exact message; PUT `{active:false}` body asserted) | ✅ COMPLIANT (requirement-level behavior, not a numbered spec scenario) |

**Compliance summary**: 1/1 requirements, 1/1 scenarios compliant — every S2a-scoped scenario has a covering test that passed at runtime.

Scope notes: the "Empty service list" scenario (spec §Admin Services Page) and the "Admin strings resolve" scenario (spec §Admin PT-BR Copy) land in S2b (tasks 2.4 and 2.3 respectively) — excluded from this slice's counts, matching how S1a/S1b counted only slice-scoped pairs. The catalog and booking delta requirements are slices S3a/S6a — out of S2a scope.

## Correctness (Static Evidence)

| Requirement | Status | Notes |
|------------|--------|-------|
| `AdminApiDeps { fetchFn }` + exported `requestJson` transport (D11) | ✅ Implemented | `admin-api.ts` L15-17, L77-101: injected `fetchFn`, `content-type: application/json` headers, 200 parse → `{ok:true,data}`, non-ok → code extracted from `{error:"<CODE>"}` envelope (`readErrorCode` L29-36) + PT-BR message via `messageFor`, rejected fetch → `{ok:false, code:"NETWORK", message: fallback}`. Mirrors `booking-api.ts`; **exported** (deviation, disclosed below) so the 2.1 transport tests are direct. |
| `messageFor` covers the full pinned error-code table (D11; design error-code table) | ✅ Implemented | `admin-api.ts` L39-64: all 10 codes (`INVALID_INPUT`, `INVALID_BODY`, `SESSION_REQUIRED`, `FORBIDDEN_ROLE`, `TENANT_REQUIRED`, `BARBER_NOT_FOUND`, `TENANT_NOT_FOUND`, `PAYMENT_APPOINTMENT_NOT_FOUND`, `MANUAL_PAYMENT_ALREADY_PROCESSED`, `SERVICE_IN_USE`) each with a distinct PT-BR string + unknown-code fallback "Não foi possível concluir a ação. Tente novamente." (same pattern as `booking-api.ts` L47). |
| `listAdminServices` returns services incl. inactive | ✅ Implemented | L108-110: GET `/api/admin/services`; test asserts active + inactive views both parsed. |
| `createService` POSTs Zod-parsed payload | ✅ Implemented | L113-123: `ServiceInput.safeParse`; success → POST parsed body; test pins exact body incl. Zod `.default(true)` injection (`{...input, active: true}`) — consistent with the backend (catalog.ts L180-182 also uses `parsed.data`). |
| `updateService` PUTs Zod-parsed patch | ✅ Implemented | L126-137: `ServiceUpdate.safeParse`; PUT `/api/admin/services/:id` with `encodeURIComponent(id)`; invalid patch → client-side `INVALID_INPUT`, no fetch. |
| `deactivateService` = update with `{active:false}` | ✅ Implemented | L143-148: retirement path via `updateService`; test asserts PUT body `{active:false}` and 409 `SERVICE_IN_USE` surfacing with the exact deactivate-guidance PT-BR message. |
| No-fetch-on-invalid | ✅ Implemented | `clientInvalidInput()` L103-105; `expect(fetchFn).not.toHaveBeenCalled()` asserted for both `createService` (invalid name/price) and `updateService` (zero duration) — task 2.2 Done-when met. |
| 4xx/5xx/network error shape | ✅ Implemented | Tests: 4xx code+message, 5xx extracted code + fallback message, body-without-code → `UNKNOWN` + fallback, rejected fetch → `NETWORK` + fallback. |
| Slice file list matches design (S2a = admin-api core + services fetchers only) | ✅ Implemented | `admin-api.ts` contains ONLY transport + services fetchers — no barbers/schedules/exceptions/reports/invites/appointments/pay fetchers (those are 3b.1/4.1/5.3/6b.1); no i18n strings added (S2b task 2.3). Scope-clean. |

## Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| D11 — error-code → PT-BR mapping centralized in new `lib/admin-api.ts` (`requestJson` + `messageFor`) | ✅ Yes | One transport + one dictionary of admin codes in `admin-api.ts`; UI never hard-codes an error string; mirrors `booking-api.ts` pattern (same `messageFor` name, same fallback wording family). Deviation: `requestJson` is exported (booking-api's is private) — deliberate, disclosed in apply-progress, enables direct 2.1 transport tests. |
| Design error-code table (all 10 rows + unknown fallback) | ✅ Yes | Every pinned code has a PT-BR message; tests prove no code falls through to the generic fallback (see TDD/Assertion sections). |
| Task 2.1 Done-when (transport + full dictionary tested) | ✅ Yes | 16 core tests green. |
| Task 2.2 Done-when (all four fetchers tested incl. no-fetch-on-invalid) | ✅ Yes | 8 fetcher tests green; `fetchFn` not-called assertions for create + update invalid paths. |
| 400-line review budget | ✅ Yes | PR #67: 385 additions + 2 deletions = 387 ≤ 400. |
| Design data flow / DI pattern (login-form / booking-flow DI) | ✅ Yes | `AdminApiDeps { fetchFn }` injected exactly as designed; no module-level fetch. |

## TDD Compliance

| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | ✅ | apply-progress (#984) has per-task RED/GREEN table for 2.1 and 2.2 |
| All tasks have tests | ✅ | 2/2 tasks covered by `apps/web/lib/admin-api.test.ts` (24 tests) |
| RED confirmed (tests exist) | ✅ | Test file verified on disk (235 lines); apply-progress records RED: 2.1 "Cannot find module './admin-api' (16 tests)" (written against a not-yet-existing module), 2.2 "8 failed (createService/deactivateService etc. undefined), 16 passed" — consistent with test-first; commit `df41d66` introduces test file + core together, `a94686c` adds fetchers + tests |
| GREEN confirmed (tests pass) | ✅ | 24/24 slice tests pass on execution this session (not just apply) |
| Triangulation adequate | ✅ | 2.1: 16 cases — 10 code-map entries (each proven non-fallback) + unknown-fallback exact string + 5 transport cases with distinct expected values (200 parse / 4xx code+message / 5xx fallback / no-code UNKNOWN / network NETWORK); 2.2: 8 cases — list 2, create 2, update 2, deactivate 2 (exact bodies, exact messages, not-called asserts) |
| Safety Net for modified files | ✅ | 2/2 test files are NEW (N/A for safety net, verified: no pre-existing admin-api tests); full suite 354/354 still green |

**TDD Compliance**: 6/6 checks passed

## Test Layer Distribution

| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit | 24 | 1 | Vitest (node env) + `vi.fn()` fetch mocks + real `Response` |
| Integration | 0 | 0 | — (no UI in this slice) |
| E2E | 0 | 0 | — (services spec = task 2.6, S2b) |
| **Total** | **24** | **1** | |

Unit layer exactly as designed in the testing strategy ("`admin-api` fetchers + `messageFor`… Pure fns; route handlers via `vi.doMock`"); no tools beyond detected capabilities.

## Changed File Coverage

| File | Line % | Branch % | Uncovered Lines | Rating |
|------|--------|----------|-----------------|--------|
| `apps/web/lib/admin-api.ts` | 97.29% | 100% | L34 (`readErrorCode` catch — malformed-JSON error body → UNKNOWN) | ✅ Excellent |
| `apps/web/lib/admin-api.test.ts` | n/a (test file) | — | — | — |
| `openspec/changes/admin-dashboard/tasks.md` | n/a (doc) | — | — | — |

**Average changed-file coverage**: 97.29% on the changed source file — well above the 80% informational threshold. Coverage is informational per the strict module — no failure. (Slice-scoped `vitest --coverage` run; whole-repo aggregate numbers are 1.7% because only one test file ran — the per-file number above is the authoritative figure for this slice's changed code.)

## Assertion Quality (Step 5f Audit)

**Assertion quality**: ✅ All assertions verify real behavior (2 minor notes → SUGGESTION 2/3 below).

- No tautologies (the `toBeTruthy()` in the `messageFor` it.each is paired with a meaningful `not.toBe(messageFor("UNKNOWN_CODE"))` assertion proving each code maps to its own non-fallback message), no ghost loops, no smoke-only renders (no UI), no orphan empty checks, no type-only-alone asserts.
- Value assertions throughout: exact `toEqual` result objects (`{ok:true,data}` / `{ok:false,code,message}`), exact POST/PUT bodies (`JSON.stringify({...input, active:true})`, `{active:false}`), exact PT-BR strings (SERVICE_IN_USE deactivate guidance ×2, SESSION_REQUIRED, INVALID_INPUT ×2, generic fallback ×3), and `fetchFn` call-shape assertions (`method`, `url`, `body`) plus `not.toHaveBeenCalled()` for the no-fetch paths.
- Mock ratio: 0 `vi.mock()` module mocks; only `vi.fn()` injected fetch stubs — no mock-heavy files.

## Quality Metrics

**Linter**: ✅ 0 errors on changed files (`eslint lib/admin-api.ts lib/admin-api.test.ts`)
**Type Checker**: ✅ No errors (`next typegen && tsc --noEmit`)
**Build**: ✅ `next typegen` route types generated successfully

## Deviations

1. **`requestJson` exported from admin-api.ts** — deviation from `booking-api.ts` (private transport), deliberate and disclosed in apply-progress: the 2.1 transport tests are direct and the core commit stays self-contained without a fetcher. D11's intent (one transport, one dictionary) is unaffected.
2. **Zod `.partial()` retains `.default()` — reactivation hazard** — see WARNING 1. Behavior is pinned by test (update body includes `active: true`) and is consistent with the backend (`catalog.ts` L193-196 sends `parsed.data` straight to the prisma update), so S2a ships a faithful mirror of the server; the defect is root-caused in the shared contract (`packages/contracts/src/catalog.ts` L52+L57), not introduced here.
3. **Line count 387 vs forecast ~250** — third consecutive test-heavy under-forecast (S1a 354 vs ~330, S1b 357 vs ~190). Within the 400-line budget — no action for this PR; flag for sdd-tasks forecast calibration (SUGGESTION 4).
4. **Change artifacts now tracked** — `openspec/changes/admin-dashboard/*` (incl. verify-report-s1a/s1b) are committed to the branch (improvement over the S1a-era "untracked" limitation). Only `verify-report-s2a.md` will be new/untracked until committed.

## Limitations

1. **Out-of-scope requirements not verified** — the remaining admin-dashboard requirements (Barbers, Schedules/Exceptions, Reports, Invites, Agenda, and the Services UI half) plus both delta specs (catalog S3a, booking S6a) are unimplemented (S2b–S6b pending). Counted requirements/scenarios in this report are the S2a-scoped 1/1 and 1/1.
2. **Services "Empty service list" + PT-BR Copy scenarios deferred** — both land in S2b (2.4 empty-state container test; 2.3 `admin.services` i18n). The `messageFor` strings ARE PT-BR admin UI copy but resolve from the `admin-api.ts` dictionary per D11 (mirroring the pre-existing `booking-api.ts` pattern), not from the `admin` i18n section — the design resolved this split at D11/D12; the "Admin strings resolve" scenario's i18n half is 2.3/S2b.
3. **No E2E layer for S2a** — the design's services E2E spec is task 2.6/S2b; S2a's transport/fetchers are unit-covered only, which is the designed layer for this slice.
4. **Coverage is slice-scoped** — the v8 report aggregates the whole repo at 1.7% because only the admin-api test file ran; the authoritative figure for changed code is the per-file 97.29% extracted from the same run. Informational per the strict module.

## Issues Found

**CRITICAL**: None

**WARNING**:
1. **`updateService` silently reactivates a deactivated service on any edit that omits `active`.** `ServiceUpdate = ServiceInput.partial()` keeps the `active: z.boolean().default(true)` default (`packages/contracts/src/catalog.ts` L52, L57), so `ServiceUpdate.safeParse({ priceBRL: 50 })` yields `{ priceBRL: 50, active: true }`; S2a's `updateService` sends that parsed body (`admin-api.ts` L131-137) and the test pins it (`admin-api.test.ts` L190-196: `body: JSON.stringify({ priceBRL: 50, active: true })`). The backend has the identical behavior (`apps/web/lib/catalog.ts` L193-196 passes `parsed.data` to the prisma update). User-visible impact: in S2b, editing a deactivated service's name/price via the edit form will reactivate it, undermining the deactivate flow the spec requires. Root cause is pre-existing in the contract + backend (not introduced by S2a); the S2a behavior is deliberate consistency and passes all S2a Done-when criteria. **Does not block S2a merge, but S2b MUST strip default-injected keys before sending update payloads (or fix backend catalog.ts) or the edit flow regresses deactivation.** Disclosed by apply-progress as a latent bug; independently confirmed this session.

**SUGGESTION**:
1. `apps/web/lib/admin-api.ts` L34 — the `readErrorCode` catch branch (non-JSON error body → `UNKNOWN`) is the single uncovered line (97.29% lines / 100% branches). A test with a 4xx response whose body is not JSON would close it (defensive, informational).
2. `admin-api.test.ts` L22-40 — the `messageFor` it.each proves each code maps to a non-fallback message but asserts the exact PT-BR string for only 4 of 10 codes (INVALID_INPUT, SESSION_REQUIRED, SERVICE_IN_USE ×2 elsewhere). A table-driven exact-string assertion per code would fully pin the dictionary against accidental copy edits.
3. The `toBeTruthy()` in the `messageFor` it.each is a near-tautology on its own; it is only meaningful because of the paired `not.toBe(fallback)` assert — consider asserting `messageFor(code).length > 0` or exact strings (see 2) for clarity.
4. sdd-tasks forecast calibration (carried from S1a/S1b) — S2a actual 387 vs forecast ~250; recalibrate the test-heavy multiplier for remaining slices (S2b–S6b).
5. Process (carried) — commit `verify-report-s2a.md` so settlement has its preimages, matching the now-tracked S1a/S1b reports.

## Verdict

**PASS WITH WARNINGS** — one WARNING, zero CRITICAL, zero blockers. The slice provably matches the spec (1/1 requirements, 1/1 scenarios compliant with passing covering tests at runtime; the 409 deactivate-guidance requirement behavior also covered), both S2a tasks are complete with verified TDD evidence (RED→GREEN per task, 24/24 tests green this session), design decisions D11 and the error-code table are followed with only the disclosed, deliberate `requestJson` export deviation, the diff is exactly the S2a file list (387 lines ≤ 400 budget, zero drift), the full unit suite (354/354) shows no regression, typecheck and lint are clean, and `admin-api.ts` is 97.29% line / 100% branch covered. The single WARNING is the pre-existing Zod `.partial()`/`.default()` reactivation hazard that S2a faithfully mirrors and S2b must fix before the edit form ships — it does not invalidate any S2a-scoped Done-when or spec criterion, so S2a may merge, but the orchestrator should carry the fix into S2b planning.