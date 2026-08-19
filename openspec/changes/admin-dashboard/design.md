# Design: Admin Dashboard

## Technical Approach

Tenant-scoped admin frontend over the existing `/api/admin/*` surface, shipped as stacked-to-main chained PRs (6 slices, 3 split into sub-PRs — see Slice Plan). Reuses repo patterns end-to-end: server pages + `auth()` redirect, `guardAdmin`/new `requireAdminPage` page guard, pure submit fns with injected `fetchFn` deps (login-form / booking-flow DI), Zod `safeParse` client-side, `requestJson`-style error→PT-BR mapping, PT-BR `admin` i18n section. Two additive read-side backend gaps are filled in their slices: enriched `BarberView` + assignment-matrix GET (slice 3), and `GET /api/admin/appointments` (slice 6). Page routes stay middleware-unprotected (out of scope per proposal); the `(admin)/layout.tsx` server guard is the enforcement point (defense-in-depth note below).

## Architecture Decisions

| # | Decision | Alternatives | Choice / Rationale |
|---|---|---|---|
| D1 | Page guard lives in `(admin)/layout.tsx` (server) | per-page guards; middleware matcher extension | Single enforcement point for all 7 routes. Middleware can't match the `(admin)` group (URLs are `/dashboard`, `/services`… no `/admin` prefix) and is out of scope per proposal. Layout + new pure `requireAdminPage` helper. |
| D2 | Dashboard home = server component calling libs directly | client fetch; server self-HTTP fetch | Matches repo server-pages pattern (login/booking pages are thin server components). Direct `getOnboardingSnapshot` + `generateReport` calls — no cookie-forwarding HTTP round trip. Page is `dynamic = "force-dynamic"`. |
| D3 | Day metrics reuse `GET /api/admin/reports?from=today&to=today&groupBy=none` | new metrics endpoint | Zeroed `ReportRow` already covers the empty-day scenario (reporting.ts `zeroRow`). One call gives total (appointments today), pending (confirmations), revenueBRL (revenue). No new endpoint. |
| D4 | Reports "day" grouping = extend `ReportGroupBy` with `"day"` (contract + reporting.ts) | map "day"→"none"; drop day grouping | Spec (admin-dashboard §Reports) mandates day/barber/service grouping; contract only has barber/service/none. Additive `"day"` enum + bucket by tenant-local date key (`dateKeyInTz`). Default stays `"none"`. |
| D5 | Report defaults: `from` = 1st of current BR month, `to` = today, `groupBy` = "none" | last 7 days; groupBy "barber" | Pins the spec open item. Month-to-date is the natural admin default; `ReportQuery` default is already `"none"`. CSV via `format=csv` link (existing route). |
| D6 | Nav = 7 links; Exceptions reachable from Schedules page | 8 nav links | Proposal lists 7 pages and the session contract says "7 links… one for Horários/Exceções". `/exceptions` is a full page; the Schedules page header cross-links "Exceções". |
| D7 | Barber creation form takes a `userId` text input | eligible-user selector endpoint | Proposal fixed this: "no eligible-user selector". No invite-list endpoint exists (out of scope). Flagged as UX debt. |
| D8 | Agenda list contract = enriched `AdminAppointmentView` (adds serviceName/barberName/clientName) | plain `AppointmentView[]` + name lookups | Client names exist nowhere else in the API; barber/service names would need N+1 client lookups. Additive, admin-only view. `client` relation exists in schema. |
| D9 | `AdminAppointmentQuery.barberId` validated as `z.string().uuid()` | `z.string().min(1)` | All ids are `@default(uuid())` in schema — a real "malformed barberId" is detectable, satisfying the spec's 400 `INVALID_INPUT` scenario. `status` reuses `AppointmentStatus`; `date` uses YYYY-MM-DD regex. |
| D10 | Pay action: no backend change | — | Pay route already maps `PaymentAppointmentNotFoundError`→404 and `ManualPaymentAlreadyProcessedError`→409. Codes pinned below; UI only maps them to PT-BR. |
| D11 | Error-code → PT-BR mapping centralized in new `lib/admin-api.ts` (`requestJson` + `messageFor`) | per-page mapping | Mirrors `booking-api.ts`. One copy of the transport, one dictionary of admin codes. |
| D12 | i18n: `admin` section added to existing `ptBR` dict; no `t()` extension | dotted-key `t()` | Repo accesses nested copy via `translations.booking.*`; `t()` stays common-only. Admin reads `translations.admin.<section>.<key>`. |
| D13 | No `CONTRACT_VERSION` bump | bump to 0.1.0 | `BarberView` gains required fields (incompatible for external consumers), but the only consumer is `apps/web`, updated within the same change. Bump deferred until an external consumer exists. |
| D14 | Slice 1/3/6 split into backend/frontend sub-PRs | keep 6 fat PRs | Honest line forecasts exceed 400 for S1, S3, S6 (see Slice Plan). Backend-first sub-PRs are autonomous, independently reviewable, and keep the dependency chain clean. |

## Data Flow

```
Guest ──→ /services ──→ (admin)/layout.tsx (server, force-dynamic)
            auth() → null → adminLoginPath(headers().get("x-pathname"))
              → redirect("/login?next=%2Fservices")          [sanitizeNextPath-wrapped]
Admin ──→ /services ──→ layout → requireAdminPage(session) → ok → <Nav/> + children(page)
            role ≠ barbershop_admin | no barbershopId → redirect("/")

dashboard/page.tsx (server, force-dynamic)
  ├─ getOnboardingSnapshot(db, barbershopId) → onboardingStatus → <OnboardingCard/> (missing list / nextStep)
  └─ generateReport(db, barbershopId, {from: today, to: today, groupBy: "none"}) → rows[0] → metrics tiles
     (zeroed row when the day is empty — spec "Empty day metrics")

agenda/page.tsx (server) → searchParams {status,date,barberId} → listAdminAppointments(db, shopId, query)
  → AdminAppointmentView[] (startsAt asc) → <AgendaManager/> (URL-state filters, booking-flow pattern)
      pay btn → submitPay(deps, id) → POST /api/admin/appointments/:id/pay
        → 200 {id,status,paymentStatus} | 404 PAYMENT_APPOINTMENT_NOT_FOUND | 409 MANUAL_PAYMENT_ALREADY_PROCESSED
        → PT-BR message via admin-api messageFor
```

## File Changes

| File | Action | Description |
|---|---|---|
| `apps/web/app/(admin)/layout.tsx` | Create | Server guard (auth → login redirect; `requireAdminPage` → `/`), nav shell, sign-out. |
| `apps/web/app/(admin)/nav.tsx` | Create | Client nav (usePathname active state, 7 links) + `signOut({callbackUrl:"/login"})`. |
| `apps/web/app/(admin)/dashboard/page.tsx` | Modify | Placeholder → server home: onboarding card + day metrics. `force-dynamic`. |
| `apps/web/app/(admin)/dashboard/onboarding-card.tsx` | Create | Server presentational card: complete state / missing-area list with links. |
| `apps/web/lib/route-auth.ts` | Modify | Add `requireAdminPage(session)` → `PageGuardResult` (pure, mirrors `guardAdmin`). |
| `apps/web/lib/auth-redirect.ts` | Modify | Add `DEFAULT_ADMIN_REDIRECT_PATH` + `adminLoginPath(pathname)` (wraps `sanitizeNextPath`, default `/dashboard`). |
| `apps/web/lib/i18n.ts` | Modify | Add `admin` section (nav/dashboard + per-domain strings, PT-BR). |
| `apps/web/app/(admin)/services/page.tsx` + `services-manager.tsx` | Create | List (+inactive), create/edit form, deactivate; 409 → deactivate guidance. |
| `apps/web/app/(admin)/barbers/page.tsx` + `barbers-manager.tsx` | Create | List (name/email), create (userId input), edit, assignment matrix toggle. |
| `apps/web/app/(admin)/schedules/page.tsx` + `schedules-manager.tsx` | Create | Barber selector + weekly dayOfWeek grid CRUD; header cross-link to Exceções. |
| `apps/web/app/(admin)/exceptions/page.tsx` + `exceptions-manager.tsx` | Create | Barber/date picker, window + reason, list/delete. |
| `apps/web/app/(admin)/reports/page.tsx` + `reports-form.tsx` | Create | Range + groupBy (day/barber/service) form, rows table, CSV link. |
| `apps/web/app/(admin)/invites/page.tsx` + `invites-form.tsx` | Create | Email form; client-side `InviteInput.safeParse`; success message; no list. |
| `apps/web/app/(admin)/agenda/page.tsx` + `agenda-manager.tsx` | Create | Filtered list (URL state), pay button on pending rows, PT-BR empty state. |
| `apps/web/lib/admin-api.ts` | Create | `AdminApiDeps {fetchFn}`, `requestJson`, `messageFor` (admin error codes → PT-BR), per-resource fetchers. |
| `apps/web/lib/admin-appointments.ts` | Create | `listAdminAppointments(db, barbershopId, query)` — parse, tz range, ordering. |
| `apps/web/app/api/admin/appointments/route.ts` | Create | GET — guard + query parse + lib → `AdminAppointmentView[]` (empty `[]`). |
| `apps/web/app/api/admin/barbers/[id]/services/route.ts` | Create | GET — read-only assignment matrix; unknown/foreign barber → 404. |
| `apps/web/lib/catalog.ts` | Modify | `listBarbers` includes `user{name,email}`; `toBarberView` maps them; add `getBarberAssignmentMatrix`. |
| `apps/web/lib/reporting.ts` | Modify | `"day"` grouping: bucket by tenant-local `dateKeyInTz(startsAt, timezone)`. |
| `packages/contracts/src/catalog.ts` | Modify | `BarberView` + `userName`/`userEmail`; add `BarberServiceAssignment` + `BarberAssignmentMatrix`. |
| `packages/contracts/src/booking.ts` | Modify | Add `AdminAppointmentQuery`, `AdminAppointmentView`. |
| `packages/contracts/src/reporting.ts` | Modify | `ReportGroupBy` += `"day"`. |

## Interfaces / Contracts

```ts
// packages/contracts/src/catalog.ts
export const BarberView = BarberInput.extend({
  id: z.string().min(1),
  userId: z.string().min(1),
  userName: z.string().min(1).nullable(),   // linked user's name (nullable in schema)
  userEmail: z.string().email(),            // linked user's email
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export const BarberServiceAssignment = z.object({
  serviceId: z.string().min(1),
  name: z.string().min(1),
  assigned: z.boolean(),
});
export const BarberAssignmentMatrix = z.array(BarberServiceAssignment);
```
```ts
// packages/contracts/src/booking.ts
const yyyymmddPattern = /^\d{4}-\d{2}-\d{2}$/;
export const AdminAppointmentQuery = z.object({
  status: AppointmentStatus.optional(),
  date: z.string().regex(yyyymmddPattern).optional(),
  barberId: z.string().uuid().optional(),
});
export const AdminAppointmentView = AppointmentView.extend({
  serviceName: z.string().min(1),
  barberName: z.string().min(1).nullable(),
  clientName: z.string().min(1).nullable(),
});
```
```ts
// apps/web/lib/route-auth.ts
export type PageGuardResult = { ok: true; barbershopId: string } | { ok: false; redirectTo: string };
export function requireAdminPage(session: RouteSessionLike | null): PageGuardResult;
// apps/web/lib/auth-redirect.ts
export function adminLoginPath(pathname: string | null | undefined): string; // /login?next=<sanitized|/dashboard>
```

Error codes pinned (spec open item) — all already emitted by existing handlers; the UI maps them via `admin-api.messageFor`:

| HTTP | Code | Surface |
|---|---|---|
| 400 | `INVALID_INPUT` | appointments list (status/date/barberId), reports query, CRUD payloads, invites email |
| 400 | `INVALID_BODY` | JSON parse failures (existing) |
| 401 | `SESSION_REQUIRED` | guard (existing) |
| 403 | `FORBIDDEN_ROLE` / `TENANT_REQUIRED` | guard (existing) |
| 404 | `BARBER_NOT_FOUND` | assignment matrix for unknown/foreign barber (no data leak) |
| 404 | `TENANT_NOT_FOUND` | reports / appointments list for missing barbershop |
| 404 | `PAYMENT_APPOINTMENT_NOT_FOUND` | pay on unknown appointment (existing) |
| 409 | `MANUAL_PAYMENT_ALREADY_PROCESSED` | pay on non-pending (existing) |
| 409 | `SERVICE_IN_USE` | delete service with appointments (existing) → UI deactivate guidance |

Timezone handling for the `date` filter: load `barbershop.timezone`, range = `[zonedToUtc(date,"00:00",tz), zonedToUtc(nextDateKey(date),"00:00",tz))` — identical to `generateReport` (reporting.ts); day grouping reuses `dateKeyInTz`.

## Slice Plan (chained PRs — stacked to main)

Per-slice ≤400 changed lines; forecasts include tests (repo style is test-heavy). Slices marked *exceed 400 → split into sub-PRs, each still ≤400.

```
main
 └── #1a shell+guard (layout, nav, requireAdminPage, adminLoginPath, i18n nav)      ~330
      └── #1b dashboard home (page + onboarding card + day metrics + tests)         ~190
           └── #2 services CRUD (admin-api core + services fetchers + manager)      ~430*
                └── #3a barbers backend (BarberView, matrix contract+lib+route)     ~330
                     └── #3b barbers UI (list + create + matrix toggle)             ~380
                          └── #4 schedules + exceptions (2 pages, 1 PR)             ~440*
                               └── #5 reports + invites (+ "day" grouping)          ~460*
                                    └── #6a appointments backend (contract+lib+route) ~300
                                         └── #6b agenda UI + pay                    ~360
```

Each PR: own tests + docs, Chain Context block with `📍` marking its position, base = main once the parent merges (rebase/retarget until only the current slice shows). S2, S4, S5 are forecast marginally over 400 — the apply phase confirms the exact split (ask-on-risk); if they stay under after task-level counting they ship whole.

| Slice | Files (new/modified) | Tests |
|---|---|---|
| 1a | layout.tsx, nav.tsx, route-auth.ts, auth-redirect.ts, i18n.ts (nav) | route-auth.test.ts (requireAdminPage), auth-redirect.test.ts (adminLoginPath), layout.test.tsx (RedirectError: guest→`/login?next=`, client role→`/`, nav render) |
| 1b | dashboard/page.tsx, onboarding-card.tsx, i18n.ts (dashboard) | dashboard page.test.tsx (renderToStaticMarkup, mocked libs: incomplete onboarding list; zeroed metrics) |
| 2 | services page+manager, admin-api.ts (core+services), i18n (services) | admin-api.test.ts (messageFor, fetch fns), services-manager container test (happy-dom: create POST, 409 guidance, empty state), page.test.tsx |
| 3a | contracts/catalog.ts, lib/catalog.ts, api/barbers/[id]/services/route.ts | contracts catalog.test.ts, lib/catalog.test.ts (enrichment + matrix scoping/404), route.test.ts (vi.doMock) |
| 3b | barbers page+manager, admin-api (barbers fetchers), i18n (barbers) | barbers-manager container test (toggle → assign/unassign), page.test.tsx |
| 4 | schedules+exceptions pages+managers, admin-api (schedules/exceptions), i18n | managers container tests (dayOfWeek grid, exception day-off, WINDOW_ORDER), page tests |
| 5 | reports+invites pages+forms, reporting.ts (day), contracts/reporting.ts, admin-api (reports/invites), i18n | reporting.test.ts (day bucket), reporting.test.ts contract, reports-form test (defaults, CSV link, zeroed rows), invites-form test (invalid email → no fetch) |
| 6a | contracts/booking.ts, lib/admin-appointments.ts, api/admin/appointments/route.ts | contracts booking.test.ts, admin-appointments.test.ts (tz range, ordering, empty), route.test.ts (vi.doMock: 200/400/404) |
| 6b | agenda page+manager, admin-api (appointments+pay), i18n (agenda) | agenda-manager container test (filter via URL state, pay 200/409/404), page.test.tsx |

E2E (Playwright, fixture `admin.e2e@example.com` / `admin-seguro-123`, seeded in `start-server.ts`): land with their slice — `admin-shell.spec.ts` (guest→login redirect, nav render, sign-out), `services.spec.ts` (create→list), `agenda-pay.spec.ts` (filter + pay). `test:e2e` runs in verify.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit (node env, `pnpm test`) | `requireAdminPage`, `adminLoginPath`; `admin-api` fetchers + `messageFor`; `listAdminAppointments` (query parse, tz range, ordering, empty); catalog enrichment + matrix; reporting day bucket; contract schemas | Pure fns; route handlers via `vi.doMock` of `@/lib/{auth,db,route-auth,…}` (reports-route.test.ts pattern) |
| Server pages | layout guard redirects; dashboard/domain page render with mocked libs/containers | `renderToStaticMarkup` + `RedirectError` (login/page.test.tsx pattern) |
| Mounted containers | forms, toggles, filters, pay flow, empty states | `// @vitest-environment happy-dom` + @testing-library/react, injected `fetchFn` mocks, `afterEach(cleanup)`, `vi.mock("next/navigation")` (booking-flow.container.test.tsx pattern) |
| E2E | guard redirect, nav, services CRUD, agenda filter+pay, CSV download | Playwright; existing admin fixture + seeded barber candidate |

## Threat Matrix

N/A — no shell, subprocess, VCS/PR automation, executable-file classification, or Git-command boundary. The only "routing" change is Next.js App Router layout redirects, covered by `RedirectError` tests; PR chaining uses repo tooling (gh) only.

## Migration / Rollout

No schema changes. Backend additions are additive reads; existing clients unaffected (BarberView enrichment consumed only by `apps/web`, updated in the same slice). Rollback = per-slice revert; removing the layout guard restores the placeholder page.

## Open Questions

- [ ] S2/S4/S5 final line counts — confirm split at sdd-tasks/apply (ask-on-risk gate).
- [ ] `x-pathname` header read in `layout.tsx` (community-standard Next.js pattern) — fallback `/dashboard` keeps behavior safe if absent.