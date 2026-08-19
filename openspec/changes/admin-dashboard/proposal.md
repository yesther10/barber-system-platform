# Proposal: Admin Dashboard

## Intent

The admin backend (`/api/admin/*`) is complete and tenant-scoped, but the frontend is one unguarded placeholder page. Admins have no UI to manage services, barbers, schedules, reports, invites, or the agenda. This change delivers the admin panel as 6 chained PR slices, including the read-side backend gaps blocking the barbers and agenda pages.

## Scope

### In Scope
- Guarded `(admin)` shell: layout guard (role + tenant), nav, sign-out.
- Dashboard home: onboarding status card + day metrics (appointments, pending confirmations, revenue today) from reports/onboarding APIs.
- Services CRUD; Barbers UI (assignment matrix) + backend: `BarberView` with user name/email, GET `barbers/:id/services`.
- Barber creation via invites + onboarding path (invited user's `userId`; no eligible-user selector).
- Schedules + exceptions UI; reports (range/groupBy/CSV) + invites (email form) UI.
- Agenda UI + new GET `/api/admin/appointments` (status/date/barber filters) + existing pay action.
- PT-BR admin i18n section in `lib/i18n.ts`.

### Out of Scope
Client/barber pages; invite-list and manual-payment endpoints; middleware page-route protection; Pix UI; notifications; multi-tenant admin.

## Capabilities

### New Capabilities
- `admin-dashboard`: guarded shell, nav, onboarding-status + day-metrics home, 6 domain pages with PT-BR copy.

### Modified Capabilities
- `catalog` (Barber Profiles): enriched `BarberView` (user name/email); new GET `barbers/:id/services` for the assignment matrix.
- `booking` (Status Lifecycle): new GET `/api/admin/appointments` (status/date/barber filters) feeding agenda + existing pay action.

## Approach

Reuse repo patterns: server pages + `auth()` redirect, `guardAdmin`, pure submit fns with injected deps, Zod safeParse, `requestJson` error mapping, PT-BR i18n. Backend additions are additive reads only.

### Slice sequencing — stacked-to-main chained PRs
1. Shell + guard + dashboard home.
2. Services CRUD UI.
3. Barbers UI + assignment matrix; backend: BarberView name/email, GET `barbers/:id/services`.
4. Schedules + exceptions UI.
5. Reports + invites UI.
6. Agenda + pay; backend: GET `/api/admin/appointments`.

Each slice: autonomous unit, ≤400 lines, own tests, own PR to main, dependency diagram + `📍` in the body.

### Why >400-line budget
7+ pages, guarded layout, i18n, 2 endpoints, tests per slice → >1,500 lines forecast. Chained PRs mandatory (ask-on-risk confirms before apply).

## Affected Areas

- **New**: `(admin)/layout.tsx` (guard + nav), `(admin)/{services,barbers,schedules,exceptions,reports,invites,agenda}/` pages, `api/admin/appointments/route.ts`.
- **Modified**: `dashboard/page.tsx` (placeholder → home), `lib/i18n.ts` + `lib/route-auth.ts` (admin i18n, `requireAdminPage`), `api/admin/barbers/**` (enriched view + assignment GET), `packages/contracts/src/{catalog,booking}.ts`.

## Risks

- Slices 3/6 blocked by API gaps (High) — backend sliced with its page.
- Page unguarded today (High) — guard first slice + tests.
- Chain diff pollution (Med) — retarget/rebase.
- Pay needs list endpoint (Med) — shipped with agenda.

## Rollback Plan

Per-slice revert; backend additive reads — existing clients unaffected; guard removal restores placeholder; no schema changes.

## Dependencies

Existing `/api/admin/*` surface (exploration `sdd/admin-dashboard/explore`); E2E admin fixture (admin.e2e@example.com + unprofiled barber candidate).

## Success Criteria

- [ ] 6 slices merged; admin pages gated by role + tenant.
- [ ] Home shows onboarding status + day metrics from live API.
- [ ] Agenda lists/filters appointments; pay updates status; `pnpm test` green; PT-BR copy.

## Open Questions

None blocking — product decisions fixed; layout/report defaults deferred to sdd-design.