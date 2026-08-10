# Archive Report: barbershop-platform

## Summary

- **Change**: `barbershop-platform`
- **Mode**: `openspec`
- **Archived At**: `2026-08-07`
- **Verify Verdict**: `PASS WITH WARNINGS`
- **Critical Issues**: `0`
- **Tasks Complete**: `32/32`
- **Scenario Evidence**: `46/46 compliant`

## Rules Applied

- Synced delta specs into `openspec/specs/` before archive move.
- Archive rule reviewed from `openspec/config.yaml`: warn before destructive merges.
- No destructive delta merge was required because all domain specs were created as new main specs.

## Specs Synced

| Domain | Action | Requirements Added | Requirements Modified | Requirements Removed | Target |
|--------|--------|--------------------|-----------------------|----------------------|--------|
| `tenant-management` | Created | 3 | 0 | 0 | `openspec/specs/tenant-management/spec.md` |
| `booking` | Created | 5 | 0 | 0 | `openspec/specs/booking/spec.md` |
| `catalog` | Created | 4 | 0 | 0 | `openspec/specs/catalog/spec.md` |
| `reporting` | Created | 3 | 0 | 0 | `openspec/specs/reporting/spec.md` |
| `lgpd-compliance` | Created | 5 | 0 | 0 | `openspec/specs/lgpd-compliance/spec.md` |
| `notifications` | Created | 4 | 0 | 0 | `openspec/specs/notifications/spec.md` |
| `payments` | Created | 3 | 0 | 0 | `openspec/specs/payments/spec.md` |
| `user-auth` | Created | 5 | 0 | 0 | `openspec/specs/user-auth/spec.md` |

## Archive Destination

`openspec/changes/archive/2026-08-07-barbershop-platform/`

## Verification

- [x] Main specs updated correctly under `openspec/specs/`
- [x] Change folder moved to archive
- [x] Archive contains proposal, specs, design, tasks, verify-report
- [x] Active changes directory no longer contains `barbershop-platform`

## Verification Warnings Preserved

- Refund workflow remains incomplete at runtime; provider boundary exposes `refund()` but no admin refund flow or proof exists yet.
- Coverage output still misses key `apps/web` implementation files and shows `packages/payments/src/service.ts` at 0% despite passing integration behavior elsewhere.
- `pnpm lint` still reports one warning in `apps/web/app/api/me/export/route.ts` for unused `_request`.
- Next.js still emits `middleware` → `proxy` deprecation noise and Playwright logs a blocked `127.0.0.1` dev-origin warning during startup.
- Brazil-region residency remains a deployment/config concern, not runtime-proven in the repository.

## Source of Truth Updated

- `openspec/specs/tenant-management/spec.md`
- `openspec/specs/booking/spec.md`
- `openspec/specs/catalog/spec.md`
- `openspec/specs/reporting/spec.md`
- `openspec/specs/lgpd-compliance/spec.md`
- `openspec/specs/notifications/spec.md`
- `openspec/specs/payments/spec.md`
- `openspec/specs/user-auth/spec.md`

## Outcome

The `barbershop-platform` SDD cycle is archived. The main OpenSpec specs now reflect the implemented platform behavior, and the archived change folder remains as the audit trail.
