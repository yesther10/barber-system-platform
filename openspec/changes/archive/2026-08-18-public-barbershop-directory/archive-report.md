# Archive Report — public-barbershop-directory

**Archived**: 2026-08-18
**Mode**: openspec
**Scope**: FULL CHANGE — Public Barbershop Directory (9/9 tasks complete: PR1 1.1–1.4 backend, PR2 2.1–2.5 UI+E2E)
**Verdict on archive**: PASS — no CRITICAL or WARNING findings in either verify report; archiving authorized per sdd-archive rules. PR #59 (backend, merged as `cd558ad`) and PR #61 (UI+E2E, merged via #61) both APPROVED.
**Delivery**: 2-PR chain stacked-to-main — PR #59 backend, PR #61 UI+E2E — ALL MERGED.

## Spec Sync Summary

Both delta specs contained only ADDED requirements (no MODIFIED or REMOVED sections), so the merge was purely additive — the `archive` rule "Warn before merging destructive deltas" did not trigger.

| Domain | Action | Details |
|--------|--------|---------|
| catalog | Updated | 1 ADDED requirement (Public Barbershop Directory) + 4 scenarios appended to canonical spec. All 5 pre-existing requirements preserved untouched. |
| booking | Updated | 1 ADDED requirement (Directory Entry Step) + 4 scenarios appended to canonical spec. Plus a pre-scoping note on the existing Public Booking Flow UI requirement: the canonical "services → barber → date/slot → confirm" order applies to a flow ALREADY scoped to a barbershop (slug present); the picker is the pre-scoping entry when no slug is present. All 7 pre-existing requirements preserved untouched. |

Synced to: `openspec/specs/catalog/spec.md`, `openspec/specs/booking/spec.md` (2 domains updated).

## Design Amendments Applied (per verify SUGGESTION 2)

- **design.md sync-point 5** — `select-barbershop` reducer clears `appointmentId` TOO, not just `serviceId/barberId/date/slot`. Verified REQUIRED: `bookingStepOf` checks `appointmentId` first, so keeping it would route to "waiting" with a foreign booking. Covered by the reducer test (`{ slug: "barba-real" }` clears every downstream field).
- **Canonical booking spec** — added the pre-scoping note on Public Booking Flow UI (decision "Spec-order coherence" (a): leave canonical order, clarify at archive).

## Task Completion Summary

| Phase | Tasks | Status |
|-------|-------|--------|
| PR 1 — Backend (contract + service + route) | 1.1–1.4 | 4/4 ✅ |
| PR 2 — UI+E2E (tenant step, picker, i18n) | 2.1–2.5 | 5/5 ✅ |

**Total**: 9/9 tasks complete.

## Traceability (Engram observation IDs)

- `sdd/public-barbershop-directory/apply-progress` → observation #968 (per-task RED/GREEN/triangulated evidence for 1.1–1.4 and 2.1–2.5)
- `sdd/public-barbershop-directory/verify-report` (PR1) → recorded via openspec file `verify-report.md`
- `sdd/public-barbershop-directory/verify-report-pr2` (PR2) → recorded via openspec file `verify-report-pr2.md`
- `sdd/public-barbershop-directory/archive-report` → this report

## Known Follow-ups (SUGGESTION-level, NOT part of this change)

1. `route.ts` try/catch is a literal no-op (`catch (err) { throw err; }`) — present because the design mandated a skeleton; drop if/when the route gains real error mapping.
2. `_request` triggers `@typescript-eslint/no-unused-vars` in `route.ts:13` — consistent with existing precedent (`api/me/export/route.ts`); a `argsIgnorePattern: "^_"` lint tweak would clean both.
3. `apps/web/lib/catalog.test.ts` no-leak test asserts against mock output (can only pass) — real protection is the `select` projection assert + integration key-set check; consider dropping the redundant asserts.
4. `apps/web/lib/i18n.ts` L79 `t()` helper remains uncovered (75% lines) — pre-existing, unused by the new picker keys.
5. `booking-flow.tsx` container tests use `.toBeTruthy()` presence checks in a few places — consistent with suite style; value assertions accompany them.

## Verification Snapshot (from verify reports, 2026-08-18)

- **PR1 (backend)**: Verdict PASS · Unit 301/301 ✅ · Integration 84/84 ✅ · Typecheck 9/9 ✅ · Lint 0 errors (3 warnings, 1 in changed file) · Build 6/6 ✅ · Catalog compliance 4/4 scenarios COMPLIANT · Changed-code coverage 100%.
- **PR2 (UI+E2E)**: Verdict PASS · Unit 312/312 ✅ · Typecheck 9/9 ✅ · Lint 0 errors (3 pre-existing warnings, none in changed lines) · Targeted E2E 3/3 ✅ · Full E2E 18/18 ✅ · Booking compliance 4/4 scenarios COMPLIANT · Changed-file coverage ≥80% (i18n.ts 75% — pre-existing gap).
- Both verifiers independent (not the implementer); strict TDD RED/GREEN corroborated via git-parent checks.

## SDD Cycle

Change folder moved to `openspec/changes/archive/2026-08-18-public-barbershop-directory/`. All artifacts preserved as audit trail (proposal, specs/catalog + specs/booking deltas, design.md with the appointmentId amendment, tasks.md, verify-report.md PR1, verify-report-pr2.md, this report). Active changes directory no longer contains `public-barbershop-directory`. Committed on `main` per repo convention (`chore(openspec): archive public-barbershop-directory and sync canonical specs`), matching prior archive commits (e.g. `0851c7d` user-registration, `2bd4f8f` barbershop login slice, catalog-booking-public-flow archive).