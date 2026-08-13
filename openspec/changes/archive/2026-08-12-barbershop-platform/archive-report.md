# Archive Report — barbershop-platform (LOGIN FRONTEND slice)

**Archived**: 2026-08-12
**Mode**: openspec
**Scope**: LOGIN FRONTEND slice (11/11 tasks complete)
**Verdict on archive**: PASS WITH WARNINGS — no CRITICAL issues; archiving authorized per sdd-archive rules.

## Spec Sync Summary

No canonical specs existed at `openspec/specs/` before this archive, so every delta spec in the change folder was promoted verbatim as the initial full spec for its domain (CREATE, not merge). No destructive merge was performed — the `archive` rule "Warn before merging destructive deltas" did not trigger.

| Domain | Action | Details |
|--------|--------|---------|
| user-auth | Created | Full spec with login page behavior (Dual Authentication, Login Page Feedback and Redirect Safety, etc.) |
| booking | Created | Full spec including Booking-to-Login Handoff |
| catalog | Created | Full spec (baseline, unaffected by slice) |
| lgpd-compliance | Created | Full spec (baseline) |
| notifications | Created | Full spec (baseline) |
| payments | Created | Full spec (baseline) |
| reporting | Created | Full spec (baseline) |
| tenant-management | Created | Full spec (baseline) |

Synced to: `openspec/specs/{domain}/spec.md` (8 domains).

## Traceability (Engram observation IDs)

- `sdd/barbershop-platform/apply-progress` → observation #805
- `sdd/barbershop-platform/verify-report` → observation #809
- `sdd-init/barber-system-platform` → referenced at init

## Technical Debt Carried Forward (WARNING-level)

These are scope/evidence gaps, NOT behavior defects. They remain open for future slices:

1. **Role-specific post-login redirect unverified** — email/password sign-in verified only for the client booking-return path; no passing evidence for role-based redirect beyond `nextPath` fallback to `/booking` (out of slice scope by design).
2. **Frontend changed-file coverage absent** — `vitest.config.ts` excludes `apps/web/**`, so slice-specific coverage numbers could not be emitted for the verified frontend files.
3. **E2E path drift** — design/tasks document `apps/web/tests/e2e/...` but the implementation lives at `apps/web/e2e/login-booking-handoff.spec.ts`. Behavior covered and passing; artifact paths should be aligned to avoid future review drift.

## SUGGESTION-level (pre-existing)

- Transient `@barber/db` prisma-generate parallel race can surface under `pnpm typecheck --force`; consider an infra hardening slice.

## Verification Snapshot (from verify-report #809)

- Build: ✅ passed · Typecheck: ✅ passed (fresh, 0 cached) · Tests: 156 passed / 0 failed · Lint: ✅
- Spec compliance: 6/7 scenarios compliant, 1/7 partial (email/password role-redirect evidence gap above)

## SDD Cycle

Change folder moved to `openspec/changes/archive/2026-08-12-barbershop-platform/`. All artifacts preserved as audit trail (proposal, specs, design, tasks, verify-report, this report). Active changes directory no longer contains `barbershop-platform`.