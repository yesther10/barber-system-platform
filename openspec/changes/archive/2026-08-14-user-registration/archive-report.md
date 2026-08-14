# Archive Report — user-registration (REGISTER FRONTEND slice)

**Archived**: 2026-08-14
**Mode**: openspec
**Scope**: REGISTER FRONTEND slice (10/10 tasks complete)
**Verdict on archive**: PASS WITH WARNINGS — no CRITICAL issues; archiving authorized per sdd-archive rules.
**Delivery**: 4 chained PRs (#30-#33) stacked-to-main, ALL MERGED to main (233e600).

## Spec Sync Summary

Canonical spec already existed at `openspec/specs/user-auth/spec.md` (promoted by the 2026-08-12 login-slice archive). The delta spec contained 3 ADDED requirements and no MODIFIED or REMOVED sections, so the merge was purely additive — the `archive` rule "Warn before merging destructive deltas" did not trigger.

| Domain | Action | Details |
|--------|--------|---------|
| user-auth | Updated | 3 ADDED requirements (Public Registration UI; Registration Error Mapping; Post-Registration Sign-In, Redirect Safety, and Entry Point) + 9 scenarios appended to canonical spec. All 6 pre-existing requirements preserved untouched. |

Synced to: `openspec/specs/user-auth/spec.md` (1 domain updated).

## Traceability (Engram observation IDs)

- `sdd/user-registration/apply-progress` → observation #942
- 4-PR stacked chain decision (#30-#33, links issue #29) → observation #943 (pattern)
- `sdd/user-registration/verify-report` → NOT persisted to Engram (openspec mode — file-only artifact; kept in archive folder)

## Technical Debt Carried Forward (WARNING-level)

These are scope/evidence gaps, NOT behavior defects. They remain open for future slices:

1. **Integration suite red on main** — 5 failures in `lgpd.test.ts` (2) + `payments-worker.test.ts` (3) caused by stale Prisma client: schema `prisma/schema.prisma` has `consentWithdrawnAt`, generated client in node_modules does not. PRE-EXISTING, branch diff provably disjoint. Fix: regenerate Prisma client (`prisma generate`) on main. Blocks the `verify:full` CI gate.
2. **Changed lines 706 vs 400-line review budget** — mitigated by user-confirmed 4-PR chain (PR #30 accepted size:exception at 455 lines).

## SUGGESTION-level (pre-existing)

- Extend vitest coverage include to `apps/web/app/**` + `apps/web/lib/**` (current config covers packages + worker only) so future changed-file coverage is measurable.
- Copy consistency follow-up: login uses voseo ("Informá") vs register PT-BR ("Informe") — flagged in design open question, not fixed in this slice.
- Lint warning in `apps/web/app/api/me/export/route.ts:9` (unused `_request`) — pre-existing, trivial cleanup.

## Verification Snapshot (from verify-report.md, 2026-08-14)

- Verdict: PASS WITH WARNINGS · Typecheck: ✅ (turbo 8/8) · Lint: ✅ (1 pre-existing warning, unrelated)
- Unit tests: 176/176 ✅ (16/16 changed files) · Integration: 67 ✅ / 5 ❌ (pre-existing Prisma drift) · E2E: 15/15 ✅
- Spec compliance: 8/8 scenarios COMPLIANT with passing runtime tests

## SDD Cycle

Change folder moved to `openspec/changes/archive/2026-08-14-user-registration/`. All artifacts preserved as audit trail (proposal, specs, design, tasks, verify-report, this report). Active changes directory no longer contains `user-registration`. No git commit created (orchestrator handles commit/push). Issue #29 left OPEN per repo convention (login slice issue #25 was likewise neither closed nor annotated at archive).
