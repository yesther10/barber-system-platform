# Archive Report — catalog-booking-public-flow

**Archived**: 2026-08-16
**Mode**: openspec
**Scope**: FULL CHANGE — Public Catalog Booking Flow (13/13 tasks complete: 1.1–1.7, 2.1–2.10 + F1–F3, 3.1–3.8 + B-1, 4.1–4.2)
**Verdict on archive**: PASS WITH WARNINGS — no CRITICAL issues; archiving authorized per sdd-archive rules. PR 2b APPROVED (C-1/C-2 closed, B-1 fixed in PR 3); PR 4 E2E APPROVED.
**Delivery**: 7-PR feature-branch chain — 1a #42, 1b #43, 2a #46, 2b #47, 3a #50, 3b #51, 4 E2E — stacked-to-main, ALL MERGED.

## Spec Sync Summary

All three delta specs contained only ADDED requirements (no MODIFIED or REMOVED sections), so the merge was purely additive — the `archive` rule "Warn before merging destructive deltas" did not trigger.

| Domain | Action | Details |
|--------|--------|---------|
| booking | Updated | 3 ADDED requirements (Public Booking Flow UI; Booking Login Gate and Redirect Safety; Slot Selection and Error Mapping) + 6 scenarios appended to canonical spec. All 6 pre-existing requirements preserved untouched. |
| catalog | Updated | 1 ADDED requirement (Public Barber Browse by Service) + 4 scenarios appended to canonical spec. All 4 pre-existing requirements preserved untouched. |
| payments | Updated | 2 ADDED requirements (Payment Status Read; Pix QR Rendering) + 6 scenarios appended to canonical spec. All 3 pre-existing requirements preserved untouched. |

Synced to: `openspec/specs/booking/spec.md`, `openspec/specs/catalog/spec.md`, `openspec/specs/payments/spec.md` (3 domains updated).

## Task Completion Summary

All 13 tasks complete across 4 phases (+ 2 post-verify fix batches):

| Phase | Tasks | Status |
|-------|-------|--------|
| Phase 1 (PR 1 backend, #42/#43) | 1.1–1.7 | 7/7 ✅ |
| Phase 2 (PR 2 catalog browse UI, #46/#47) | 2.1–2.10 | 10/10 ✅ |
| Phase 2b fix batch (PR 2b) | F1–F3 (C-1/C-2 closure) | 3/3 ✅ |
| Phase 3 (PR 3 booking+Pix+status, #50/#51) | 3.1–3.8 | 8/8 ✅ |
| Phase 3 fix batch (PR 3) | B-1 (barbers stale-list) | 1/1 ✅ |
| Phase 4 (PR 4 E2E) | 4.1–4.2 | 2/2 ✅ (ticked at archive per verify S-1) |

**Total**: 13/13 tasks + 4 fix-batch items complete.

## Traceability (Engram observation IDs)

- `sdd/catalog-booking-public-flow/apply-progress` → observation #951 (9 revisions, cumulative — all phases 1a/1b/2a/2b/3a/3b/4)
- `sdd/catalog-booking-public-flow/verify-report` → observation #952 (combined PR 2b closure + PR 4 E2E verdicts)
- `sdd/catalog-booking-public-flow/archive-report` → observation #953 (this report)

## Known Follow-ups (WARNING-level, NOT part of this change)

1. **W-1 Registered-user `/booking` stall (PRE-EXISTING, proven independent)** — `register.spec.ts:26` + `login-booking-handoff.spec.ts:19` stall on `/booking`'s "Carregando..." for freshly-registered users; isolated run (without the new spec) reproduces the same 2 failures → full E2E suite stays 15/2 until fixed. Recommended follow-up change (suspected registered-user booking-state path, e.g. session/state hydration after register redirect).
2. **Webhook→UI paid proof is a 2-layer split** — E2E flips paid via admin mark-paid in a separate context (real MP `getPayment` rejects the fake token → webhook POST 500, HMAC verification itself passed); webhook→paid proven at integration (`payments-worker.test.ts:163,194`). Sanctioned per design open question resolution; an optional fake-MP provider harness would enable a true webhook→UI E2E (SUGGESTION S-3).

## SUGGESTION-level (carried forward)

- S-1 (done at archive): tasks.md 4.1/4.2 checkboxes ticked.
- S-2: Test 1 duplicates browse-to-confirm steps instead of reusing the `browseToConfirm` helper — cosmetic DRY.
- S-3: fake MP provider harness for real webhook→UI E2E flip (see above).
- Pre-existing suggestions from PR 2b report: services/barbers effects mount coverage; Y2099 fixed dates → relative; DST-era tz fixture; empty-slug tenant-not-found state; `Intl.NumberFormat` pricing; hydration-safe `todayInTz()`; NaN guard in `formatSlotLocal`; slot button accessible names.

## Verification Snapshot (from verify-report.md, 2026-08-16)

- Verdict: PASS WITH WARNINGS · Typecheck: ✅ 9/9 · Lint: ✅ 0 errors (2 pre-existing warnings)
- Unit tests: 294/294 ✅ (46 files) · Targeted E2E: 2/2 ✅ (full suite 15/2 — 2 pre-existing W-1 failures)
- Spec compliance: PR 4 scope 6/6 scenarios COMPLIANT; PR 2b scope 8/8 scenarios COMPLIANT
- Design open question resolved: paid-flip via admin mark-paid; webhook→paid integration-proven

## SDD Cycle

Change folder moved to `openspec/changes/archive/2026-08-16-catalog-booking-public-flow/`. All artifacts preserved as audit trail (proposal, specs/booking+catalog+payments deltas, design, tasks, verify-report, this report). Active changes directory no longer contains `catalog-booking-public-flow`. Committed on `feat/catalog-booking-e2e` per repo convention (`chore(openspec): archive catalog-booking-public-flow and sync canonical specs`), matching prior archive commits (e.g. `0851c7d` user-registration, `2bd4f8f` barbershop login slice).