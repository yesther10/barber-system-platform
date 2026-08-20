# Tasks: Admin Dashboard

Guarded `(admin)` shell + dashboard home + six domain pages (services, barbers, schedules/exceptions, reports, invites, agenda) with PT-BR copy, plus two additive read-side backend gaps (assignment matrix GET, appointments list GET). Shipped as **9 sub-PRs stacked to main** (6 slices, 3 split into backend/frontend sub-PRs). Planning only — no implementation in this phase.

## Conventions

- **Task numbering**: hierarchical per slice — `1a.N` under S1a, `1b.N` under S1b, `2.N` under S2, `3a.N`/`3b.N`, `4.N`, `5.N`, `6a.N`/`6b.N`. Each task maps to one work-unit commit (tests with code, one clear purpose, clean rollback boundary — work-unit-commits skill).
- **Strict TDD**: every behavior-changing task starts with the failing test (red → green). Layer mapping: unit tests for libs/contracts/routes (`node` env), container tests (`// @vitest-environment happy-dom` + @testing-library/react) for managers, `renderToStaticMarkup` + `RedirectError` page tests for server pages. Pure i18n additions and trivial tasks say "no test-first" explicitly.
- **Commands**: `pnpm test <path>` (Vitest) · `pnpm typecheck` · `pnpm lint` · `pnpm exec playwright test -c apps/web/playwright.config.ts <spec>` (never `pnpm test:e2e --`). Full suite `pnpm test` runs at apply and verify.
- **Commits**: conventional commits, no AI attribution, no `Co-Authored-By`.
- **Coverage**: each task cites the spec requirement/scenario and/or design decision (D#) it satisfies; the Coverage Matrix at the end proves full mapping.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Total estimated changed lines | ~3,220 across 12 sub-PRs (forecasts include tests; repo is test-heavy) |
| Per-PR forecast | S1a ~330 · S1b ~190 · S2a ~250 · S2b ~230 · S3a ~330 · S3b ~380 · S4a ~230 · S4b ~240 · S5a ~280 · S5b ~200 · S6a ~300 · S6b ~360 |
| 400-line budget risk | Low per-PR (all ≤400 after split) |
| Over-budget PRs | None — **S2/S4/S5 split confirmed by user (2026-08-19)** into S2a/S2b, S4a/S4b, S5a/S5b |
| Chained PRs recommended | Yes (total change ≫ 400) |
| Chain strategy | stacked-to-main (user-confirmed this session) |
| Delivery strategy | ask-on-risk |

**Decision made before apply: Yes** — ask-on-risk gate satisfied: user confirmed chained PRs, chain strategy stacked-to-main, and the S2/S4/S5 split into 12 sub-PRs (2026-08-19). Each sub-PR must stay ≤400 authored changed lines (additions + deletions; generated goldens excluded from authored count but included in snapshot identity).

## Dependency chain (slice order)

S1a → S1b → S2a → S2b → S3a → S3b → S4a → S4b → S5a → S5b → S6a → S6b. Each slice branches from `main` once its parent merges (stacked-to-main); rebase/retarget until only the current slice shows in the diff.

---

# Slice S1a — Shell + guard (`feat/admin-dashboard-1a`)

Guard the unguarded placeholder admin area first (proposal risk: "Page unguarded today"). Files: `apps/web/lib/route-auth.ts`, `apps/web/lib/auth-redirect.ts`, `apps/web/app/(admin)/layout.tsx`, `apps/web/app/(admin)/nav.tsx`, `apps/web/lib/i18n.ts` (nav), `apps/web/e2e/admin-shell.spec.ts` (new).

- [x] **1a.1** `requireAdminPage` page guard — [backend · lib]
      Add `PageGuardResult` type and pure `requireAdminPage(session: RouteSessionLike | null)` to `apps/web/lib/route-auth.ts` (mirrors `guardAdmin`: no session or wrong role or missing `barbershopId` → `{ ok: false, redirectTo: "/login?next=…" | "/" }` decided by caller; ok → `{ ok: true, barbershopId }`).
      Tests (test-first): extend `apps/web/lib/route-auth.test.ts` — guest → not-ok; `barbershop_admin` with tenant → ok with barbershopId; client role → not-ok; admin without tenant → not-ok; null session → not-ok. Verify: `pnpm test apps/web/lib/route-auth.test.ts`.
      Deps: none. Done when: `requireAdminPage` exported, all cases green, `pnpm typecheck` clean.
      Coverage: admin-dashboard §Admin Shell Guard and Navigation (guest + non-admin scenarios); D1.

- [x] **1a.2** `adminLoginPath` redirect helper — [backend · lib]
      Add `DEFAULT_ADMIN_REDIRECT_PATH = "/dashboard"` and `adminLoginPath(pathname)` to `apps/web/lib/auth-redirect.ts` — wraps `sanitizeNextPath`, falls back to `/dashboard` when the `x-pathname` header is absent (design open question).
      Tests (test-first): extend `apps/web/lib/auth-redirect.test.ts` — internal path → `/login?next=%2Fservices`; null/undefined → `/dashboard`; external/`//` paths sanitized → `/dashboard`; query+hash preserved. Verify: `pnpm test apps/web/lib/auth-redirect.test.ts`.
      Deps: 1a.1. Done when: helper exported, cases green, fallback proven by test.
      Coverage: admin-dashboard §Admin Shell Guard and Navigation ("guest redirected to `/login` with an internal `next` path"); D1; design open question (x-pathname fallback).

- [x] **1a.3** PT-BR `admin.nav` i18n strings — [frontend · i18n]
      Add `admin` section to `apps/web/lib/i18n.ts` (`ptBR` dict): nav labels for all 7 pages (Início, Serviços, Barbeiros, Horários, Exceções, Relatórios, Convites, Agenda), sign-out label, aria labels.
      No test-first — pure string additions; asserted via 1a.4/1a.5 render tests and 1a.6 E2E. Verify: `pnpm typecheck`.
      Deps: none. Done when: `translations.admin.nav.*` resolves, no TS errors.
      Coverage: admin-dashboard §Admin PT-BR Copy ("each string resolves from the `admin` i18n section in PT-BR"); D12.

- [x] **1a.4** `(admin)/layout.tsx` server guard + shell — [frontend · page]
      Create `apps/web/app/(admin)/layout.tsx`: `force-dynamic`; `auth()` → guest → `redirect(adminLoginPath(headers().get("x-pathname")))`; `requireAdminPage(session)` not-ok → `redirect(redirectTo)`; ok → render `<Nav/>` + children. Single enforcement point for all 7 admin routes (D1).
      Tests (test-first): create `apps/web/app/(admin)/layout.test.tsx` using `renderToStaticMarkup` + `RedirectError` (login/page.test.tsx pattern; `vi.mock` of `@/lib/auth`, `next/navigation`, `next/headers`) — guest → `RedirectError` to `/login?next=…`, no admin content; client-role session → `RedirectError` to `/`; admin session → nav + children render. Verify: `pnpm test apps/web/app/\(admin\)/layout.test.tsx`; `pnpm typecheck`.
      Deps: 1a.1–1a.3. Done when: all three guard cases proven by test; removing this layout restores the placeholder (rollback boundary = this file + nav.tsx).
      Coverage: admin-dashboard §Admin Shell Guard and Navigation (all three scenarios); D1, D14.

- [x] **1a.5** `(admin)/nav.tsx` client nav — [frontend · page]
      Create `apps/web/app/(admin)/nav.tsx`: client component, `usePathname` active state, 7 links (D6), `signOut({ callbackUrl: "/login" })` action.
      Tests: covered by 1a.4 layout.test.tsx (nav render, links present) + 1a.6 E2E (sign-out). Verify: `pnpm test apps/web/app/\(admin\)/layout.test.tsx`.
      Deps: 1a.3–1a.4. Done when: nav renders 7 links + sign-out; active state applies.
      Coverage: admin-dashboard §Admin Shell Guard and Navigation ("Navigation and sign-out render" scenario); D6.

- [x] **1a.6** E2E `admin-shell.spec.ts` — [e2e]
      Create `apps/web/e2e/admin-shell.spec.ts` using the seeded fixture `admin.e2e@example.com` / `admin-seguro-123` (already in `apps/web/e2e/start-server.ts`): guest opens `/services` → redirected to `/login` with `next`; logged-in admin sees nav links + sign-out; sign-out returns to `/login`.
      Tests: the spec itself (Playwright). Verify: `pnpm exec playwright test -c apps/web/playwright.config.ts admin-shell`.
      Deps: 1a.4–1a.5. Done when: spec green against seeded fixture.
      Coverage: admin-dashboard §Admin Shell Guard and Navigation; proposal success criterion "admin pages gated by role + tenant".

### PR Boundary — S1a

| Field | Value |
|-------|-------|
| Branch | `feat/admin-dashboard-1a` → base `main` (stacked-to-main) |
| Forecast | ~330 changed lines (≤400 ✓) |
| Own tests | route-auth.test.ts, auth-redirect.test.ts, layout.test.tsx, admin-shell.spec.ts |
| Verify | `pnpm test apps/web/lib/route-auth.test.ts apps/web/lib/auth-redirect.test.ts apps/web/app/\(admin\)/layout.test.tsx` + Playwright `admin-shell` |

```
Chain Context — stacked to main
   main
    └── #1a shell+guard  📍 (this PR)
         └── #1b dashboard → #2 services → #3a barbers backend → #3b barbers UI
              → #4 schedules/exceptions → #5 reports/invites → #6a appointments backend → #6b agenda
State: start = unguarded placeholder admin page; end = guarded shell, nav, sign-out.
Prior: none. Follow-ups: #1b dashboard home. Out of scope: domain pages, backend routes.
```

---

# Slice S1b — Dashboard home (`feat/admin-dashboard-1b`)

Files: `apps/web/app/(admin)/dashboard/page.tsx` (modify placeholder), `apps/web/app/(admin)/dashboard/onboarding-card.tsx` (new), `apps/web/lib/i18n.ts` (dashboard strings).

- [x] **1b.1** PT-BR `admin.dashboard` i18n strings — [frontend · i18n]
      Extend the `admin` section of `apps/web/lib/i18n.ts`: onboarding card strings (complete / missing areas / next step), day-metrics tile labels (appointments, pending confirmations, revenue), empty-day copy.
      No test-first — pure strings; asserted via 1b.2/1b.3 tests. Verify: `pnpm typecheck`.
      Deps: S1a merged (nav section exists). Done when: `translations.admin.dashboard.*` resolves.
      Coverage: admin-dashboard §Admin PT-BR Copy; §Dashboard Home; D12.

- [x] **1b.2** `onboarding-card.tsx` presentational card — [frontend · page]
      Create `apps/web/app/(admin)/dashboard/onboarding-card.tsx`: server presentational component — complete state / missing-area list with links / next-step.
      Tests (test-first): create render test with mocked `@/lib/onboarding` — incomplete snapshot lists missing areas; complete snapshot shows completion. Verify: `pnpm test apps/web/app/\(admin\)/dashboard/onboarding-card.test.tsx`.
      Deps: 1b.1. Done when: both states render from props.
      Coverage: admin-dashboard §Dashboard Home ("Incomplete onboarding" scenario).

- [x] **1b.3** `dashboard/page.tsx` server home — [frontend · page]
      Replace the placeholder with a thin `force-dynamic` server component calling libs directly (D2): `getOnboardingSnapshot(db, barbershopId)` → `<OnboardingCard/>`; `generateReport(db, barbershopId, { from: today, to: today, groupBy: "none" })` → rows[0] → day-metrics tiles (D3). Zeroed row when the day is empty.
      Tests (test-first): create `page.test.tsx` (`renderToStaticMarkup`, mocked libs) — incomplete onboarding list renders; zeroed day metrics render without error. Verify: `pnpm test apps/web/app/\(admin\)/dashboard/page.test.tsx`; `pnpm typecheck`.
      Deps: 1b.1–1b.2. Done when: home renders live API data via libs, empty day shows zeros, `pnpm test` green.
      Coverage: admin-dashboard §Dashboard Home (both scenarios); D2, D3; proposal success criterion "Home shows onboarding status + day metrics from live API".

### PR Boundary — S1b

| Field | Value |
|-------|-------|
| Branch | `feat/admin-dashboard-1b` → base `main` (stacked-to-main) |
| Forecast | ~190 changed lines (≤400 ✓) |
| Own tests | onboarding-card.test.tsx, dashboard/page.test.tsx |
| Verify | `pnpm test apps/web/app/\(admin\)/dashboard/` |

```
Chain Context — stacked to main
   main
    └── #1a shell+guard
         └── #1b dashboard home  📍 (this PR)
              └── #2 services → #3a → #3b → #4 → #5 → #6a → #6b
State: start = guarded shell with placeholder home; end = onboarding status + day metrics.
Prior: #1a. Follow-ups: #2 services CRUD. Out of scope: domain pages.
```

# Slice S2a — admin-api core + services fetchers (`feat/admin-dashboard-2a`)

Split CONFIRMED by user (2026-08-19) — sub-PR S2a = tasks 2.1–2.2 (forecast ~250, ≤400). Files: `apps/web/lib/admin-api.ts` (new). S2b (tasks 2.3–2.6, services UI) is the next sub-PR below.

- [x] **2.1** `lib/admin-api.ts` core: `requestJson` + `messageFor` — [backend · lib]
      Create `apps/web/lib/admin-api.ts`: `AdminApiDeps { fetchFn }`, `requestJson` transport (mirrors `booking-api.ts`), `messageFor(code)` central error-code → PT-BR dictionary covering the full pinned table: `INVALID_INPUT`, `INVALID_BODY`, `SESSION_REQUIRED`, `FORBIDDEN_ROLE`, `TENANT_REQUIRED`, `BARBER_NOT_FOUND`, `TENANT_NOT_FOUND`, `PAYMENT_APPOINTMENT_NOT_FOUND`, `MANUAL_PAYMENT_ALREADY_PROCESSED`, `SERVICE_IN_USE` (+ unknown-code fallback).
      Tests (test-first): create `apps/web/lib/admin-api.test.ts` — `messageFor` maps every code to a PT-BR string, unknown code → generic fallback; `requestJson` 200 parse, 4xx code extraction, network/5xx error shape. Verify: `pnpm test apps/web/lib/admin-api.test.ts`.
      Deps: S1a. Done when: transport + full dictionary tested; every pinned code has a PT-BR message.
      Coverage: admin-dashboard §Admin Services Page (409 deactivate guidance); D11; design error-code table (all rows).

- [x] **2.2** admin-api services fetchers — [backend · lib]
      Extend `apps/web/lib/admin-api.ts`: `listAdminServices` (incl. inactive), `createService`, `updateService`, `deactivateService` with Zod `safeParse` of `ServiceInput`/`ServiceUpdate` and typed error surfacing.
      Tests (test-first): extend `admin-api.test.ts` — list returns active+inactive; create POSTs parsed payload; 409 `SERVICE_IN_USE` surfaced with code; invalid payload → client-side error, no fetch (mock asserts no call). Verify: `pnpm test apps/web/lib/admin-api.test.ts`.
      Deps: 2.1. Done when: all four fetchers tested incl. no-fetch-on-invalid.
      Coverage: admin-dashboard §Admin Services Page ("Create and list a service"); 409 `SERVICE_IN_USE` surface.

### PR Boundary — S2a

| Field | Value |
|-------|-------|
| Branch | `feat/admin-dashboard-2a` → base `main` (stacked-to-main) |
| Forecast | ~250 (≤400) |
| Own tests | admin-api.test.ts |
| Verify | `pnpm test apps/web/lib/admin-api.test.ts` |

```
Chain Context — stacked to main
   main
    └── #1a shell+guard
         └── #1b dashboard
              └── #2a admin-api core  📍 (this PR)
                   └── #2b services UI → #3a → #3b → #4a → #4b → #5a → #5b → #6a → #6b
State: start = guarded shell, no admin-api transport; end = requestJson + messageFor + services fetchers, PT-BR code map.
Prior: #1b. Follow-ups: #2b services UI.
```

---

# Slice S2b — Services UI (`feat/admin-dashboard-2b`)

Split CONFIRMED by user (2026-08-19) — sub-PR S2b = tasks 2.3–2.6 (forecast ~230, ≤400). Files: `apps/web/app/(admin)/services/{page.tsx,services-manager.tsx}` (new), `apps/web/app/(admin)/services/` i18n, `apps/web/e2e/services.spec.ts` (new).

- [ ] **2.3** PT-BR `admin.services` i18n strings — [frontend · i18n]
      Extend the `admin` section of `apps/web/lib/i18n.ts`: list/create/edit/deactivate labels, PT-BR empty state, 409 deactivate guidance message, field labels (name, price BRL, duration, active).
      No test-first — pure strings; asserted via 2.4/2.5 tests. Verify: `pnpm typecheck`.
      Deps: 2.1. Done when: `translations.admin.services.*` resolves.
      Coverage: admin-dashboard §Admin PT-BR Copy; §Admin Services Page (PT-BR empty state, deactivate guidance); D12.

- [ ] **2.4** `services-manager.tsx` container — [frontend · manager]
      Create `apps/web/app/(admin)/services/services-manager.tsx`: list (+inactive), create/edit form, deactivate action; empty PT-BR state; 409 → deactivate guidance; injected `fetchFn` deps (login-form / booking-flow DI pattern).
      Tests (test-first): create container test (`// @vitest-environment happy-dom` + @testing-library/react, `vi.mock("next/navigation")`, `afterEach(cleanup)` — booking-flow.container.test.tsx pattern) — create submit POSTs and list updates; 409 shows deactivate guidance; empty list shows PT-BR empty state. Verify: `pnpm test apps/web/app/\(admin\)/services/services-manager.container.test.tsx`.
      Deps: 2.2–2.3. Done when: create/409/empty scenarios green.
      Coverage: admin-dashboard §Admin Services Page ("Create and list a service", "Empty service list", deactivate guidance).

- [ ] **2.5** `services/page.tsx` server page — [frontend · page]
      Create `apps/web/app/(admin)/services/page.tsx`: thin server component rendering `<ServicesManager/>` with server-side fetch (`listAdminServices`).
      Tests (test-first): create page.test.tsx (`renderToStaticMarkup`, mocked manager/libs) — renders manager under guard. Verify: `pnpm test apps/web/app/\(admin\)/services/page.test.tsx`.
      Deps: 2.4. Done when: page renders under layout guard.
      Coverage: admin-dashboard §Admin Services Page; D1 (guard applies).

- [ ] **2.6** E2E `services.spec.ts` — [e2e]
      Create `apps/web/e2e/services.spec.ts`: seeded admin logs in → creates a service (name/price/duration) → appears in the list. Extend `apps/web/e2e/start-server.ts` fixture only if a stable pre-existing service list is needed (keep fixture additive).
      Tests: the spec itself (Playwright). Verify: `pnpm exec playwright test -c apps/web/playwright.config.ts services`.
      Deps: 2.4–2.5. Done when: spec green against seeded fixture.
      Coverage: admin-dashboard §Admin Services Page ("Create and list a service"); proposal success criterion.

### PR Boundary — S2b

| Field | Value |
|-------|-------|
| Branch | `feat/admin-dashboard-2b` → base `main` (stacked-to-main) |
| Forecast | ~230 (≤400) |
| Own tests | services-manager.container.test.tsx, page.test.tsx, services.spec.ts |
| Verify | `pnpm test apps/web/app/\(admin\)/services/` + Playwright `services` |

```
Chain Context — stacked to main
   main
    └── #1a shell+guard
         └── #1b dashboard
              └── #2a admin-api core
                   └── #2b services CRUD UI  📍 (this PR)
                        └── #3a → #3b → #4a → #4b → #5a → #5b → #6a → #6b
State: start = admin-api core, no services UI; end = full services CRUD with PT-BR copy.
Prior: #1a, #1b, #2a. Follow-ups: #3a barbers backend. Out of scope: barbers, schedules, reports, invites, agenda.
```

---

# Slice S3a — Barbers backend (`feat/admin-dashboard-3a`)

Read-side backend gap #1 (proposal risk "Slices 3/6 blocked by API gaps"). Files: `packages/contracts/src/{catalog.ts,index.ts}`, `apps/web/lib/catalog.ts`, `apps/web/app/api/admin/barbers/[id]/services/route.ts` (new GET).

- [ ] **3a.1** Contracts: `BarberView` identity + assignment matrix — [backend · contracts]
      Modify `packages/contracts/src/catalog.ts`: `BarberView` gains `userName: z.string().min(1).nullable()` and `userEmail: z.string().email()`; add `BarberServiceAssignment { serviceId, name, assigned }` and `BarberAssignmentMatrix = z.array(BarberServiceAssignment)`; export from `packages/contracts/src/index.ts`. No `CONTRACT_VERSION` bump (D13).
      Tests (test-first): extend `packages/contracts/src/catalog.test.ts` — BarberView parses with userName/userEmail; rejects missing userEmail; matrix parses mixed assigned flags; empty matrix valid. Verify: `pnpm test packages/contracts/src/catalog.test.ts`; `pnpm typecheck`.
      Deps: S2. Done when: schemas + exports green, no version bump.
      Coverage: catalog delta §Barber Service Assignment Matrix (all scenarios), §Barber Profiles ("Admin list includes user identity"); D13.

- [ ] **3a.2** `lib/catalog.ts` enrichment + matrix lib — [backend · lib]
      Modify `apps/web/lib/catalog.ts`: `listBarbers`/`toBarberView` include linked `user { name, email }` (nullable name); add `getBarberAssignmentMatrix(db, barbershopId, barberId)` → `BarberAssignmentMatrix` with every tenant service and `assigned` flag (no modification).
      Tests (test-first): extend `apps/web/lib/catalog.test.ts` (mocked prisma) — enrichment maps user name/email; tenant-scoped list excludes foreign barbers; matrix includes all tenant services with correct flags; unknown/foreign barber → not-found (no data leak). Verify: `pnpm test apps/web/lib/catalog.test.ts`.
      Deps: 3a.1. Done when: enrichment + matrix lib green incl. scoping.
      Coverage: catalog delta §Barber Profiles ("Admin list includes user identity"), §Barber Service Assignment Matrix (mixed / no-assignments scenarios).

- [ ] **3a.3** GET `api/admin/barbers/[id]/services` route — [backend · route]
      Create `apps/web/app/api/admin/barbers/[id]/services/route.ts`: GET only (read-only), `guardAdmin` (401/403), parse `[id]` param, call matrix lib → 200 `BarberAssignmentMatrix`; unknown/foreign barber → 404 `BARBER_NOT_FOUND` (no data leak).
      Tests (test-first): create `route.test.ts` (`vi.doMock` of `@/lib/{auth,db,catalog}` — reports-route.test.ts pattern) — 200 mixed matrix; 200 all-unassigned; 404 unknown/foreign; 401/403 guard; no state mutation. Verify: `pnpm test "apps/web/app/api/admin/barbers/[id]/services/route.test.ts"`.
      Deps: 3a.2. Done when: all scenarios green; endpoint provably read-only.
      Coverage: catalog delta §Barber Service Assignment Matrix (all three scenarios incl. 404 leak prevention); error-code `BARBER_NOT_FOUND`.

### PR Boundary — S3a

| Field | Value |
|-------|-------|
| Branch | `feat/admin-dashboard-3a` → base `main` (stacked-to-main) |
| Forecast | ~330 changed lines (≤400 ✓) |
| Own tests | contracts/catalog.test.ts, lib/catalog.test.ts, services/route.test.ts |
| Verify | `pnpm test packages/contracts/src/catalog.test.ts apps/web/lib/catalog.test.ts "apps/web/app/api/admin/barbers/[id]/services/route.test.ts"` |

```
Chain Context — stacked to main
   main
    └── #1a → #1b → #2 services
         └── #3a barbers backend  📍 (this PR)
              └── #3b barbers UI → #4 → #5 → #6a → #6b
State: start = BarberView without identity, no matrix endpoint; end = enriched view + read-only matrix GET.
Prior: #1a–#2. Follow-ups: #3b barbers UI consumes it. Out of scope: any assignment mutation.
```

---

# Slice S3b — Barbers UI (`feat/admin-dashboard-3b`)

Files: `apps/web/app/(admin)/barbers/{page.tsx,barbers-manager.tsx}` (new), `apps/web/lib/admin-api.ts` (barbers fetchers), `apps/web/lib/i18n.ts`.

- [ ] **3b.1** admin-api barbers fetchers — [backend · lib]
      Extend `apps/web/lib/admin-api.ts`: `listAdminBarbers`, `createBarber` (userId input), `updateBarber`, `getBarberAssignmentMatrix`, `assignBarberToService`/`unassignBarberFromService` (PUT/DELETE `barbers/:id/services/:serviceId`).
      Tests (test-first): extend `admin-api.test.ts` — list parse; create with userId POSTs; matrix fetch; assign/unassign hit correct method+path; 404 `BARBER_NOT_FOUND` surfaced. Verify: `pnpm test apps/web/lib/admin-api.test.ts`.
      Deps: 3a.3. Done when: all six fetchers tested.
      Coverage: admin-dashboard §Admin Barbers Page ("Toggle a service assignment" via existing endpoints).

- [ ] **3b.2** PT-BR `admin.barbers` i18n strings — [frontend · i18n]
      Extend the `admin` section of `apps/web/lib/i18n.ts`: list/create/edit labels, PT-BR empty state, assignment matrix labels (assigned/unassigned toggle), userId field help text.
      No test-first — pure strings; asserted via 3b.3/3b.4 tests. Verify: `pnpm typecheck`.
      Deps: 3b.1. Done when: `translations.admin.barbers.*` resolves.
      Coverage: admin-dashboard §Admin PT-BR Copy; §Admin Barbers Page (empty state); D12.

- [ ] **3b.3** `barbers-manager.tsx` container — [frontend · manager]
      Create `apps/web/app/(admin)/barbers/barbers-manager.tsx`: list with user name/email, create profile from `userId` text input (D7 — flagged UX debt, no eligible-user selector), edit, assignment matrix toggle; injected `fetchFn` deps.
      Tests (test-first): container test (happy-dom pattern) — toggle calls assign then unassign on the existing endpoints; create with userId submits; matrix renders from fetched data. Verify: `pnpm test apps/web/app/\(admin\)/barbers/barbers-manager.container.test.tsx`.
      Deps: 3b.1–3b.2. Done when: toggle → assign/unassign scenarios green.
      Coverage: admin-dashboard §Admin Barbers Page ("Toggle a service assignment", "Empty barber list"); D7.

- [ ] **3b.4** `barbers/page.tsx` server page — [frontend · page]
      Create `apps/web/app/(admin)/barbers/page.tsx`: thin server component rendering `<BarbersManager/>` with server-side list fetch.
      Tests (test-first): page.test.tsx (`renderToStaticMarkup`, mocked manager/libs) — renders manager; PT-BR empty state path. Verify: `pnpm test apps/web/app/\(admin\)/barbers/page.test.tsx`.
      Deps: 3b.3. Done when: page renders under guard.
      Coverage: admin-dashboard §Admin Barbers Page ("Empty barber list"); catalog delta §Barber Profiles (identity visible in list).

### PR Boundary — S3b

| Field | Value |
|-------|-------|
| Branch | `feat/admin-dashboard-3b` → base `main` (stacked-to-main) |
| Forecast | ~380 changed lines (≤400 ✓) |
| Own tests | admin-api.test.ts (barbers), barbers-manager.container.test.tsx, page.test.tsx |
| Verify | `pnpm test apps/web/lib/admin-api.test.ts apps/web/app/\(admin\)/barbers/` |

```
Chain Context — stacked to main
   main
    └── #1a → #1b → #2 → #3a barbers backend
         └── #3b barbers UI  📍 (this PR)
              └── #4 schedules/exceptions → #5 reports/invites → #6a → #6b
State: start = no barbers UI; end = list with identity, create-from-invite, assignment matrix toggles.
Prior: #3a (matrix GET). Follow-ups: #4 schedules/exceptions. Out of scope: eligible-user selector (D7 debt).
```

# Slice S4a — Schedules UI (`feat/admin-dashboard-4a`)

Split CONFIRMED by user (2026-08-19) — sub-PR S4a = tasks 4.1–4.4 (forecast ~230, ≤400). Files: `apps/web/app/(admin)/schedules/{page.tsx,schedules-manager.tsx}` (new), `apps/web/lib/admin-api.ts`, `apps/web/lib/i18n.ts`. S4b (tasks 4.5–4.6, exceptions UI) is the next sub-PR below.

- [ ] **4.1** admin-api schedules + exceptions fetchers — [backend · lib]
      Extend `apps/web/lib/admin-api.ts`: `listWeeklySchedules`, `upsertWeeklySchedule`, `deleteWeeklySchedule`, `listExceptions`, `createException`, `deleteException` (date, window, optional reason payloads).
      Tests (test-first): extend `admin-api.test.ts` — list/create/delete hit correct method+path; window payload validated client-side (order of `start`/`end` — `WINDOW_ORDER`); invalid payload → no fetch. Verify: `pnpm test apps/web/lib/admin-api.test.ts`.
      Deps: S3b. Done when: all six fetchers tested incl. window-order validation.
      Coverage: admin-dashboard §Admin Schedules and Exceptions Pages (both scenarios); error-code `INVALID_INPUT` (window order).

- [ ] **4.2** PT-BR `admin.schedules` + `admin.exceptions` i18n strings — [frontend · i18n]
      Extend the `admin` section of `apps/web/lib/i18n.ts`: barber selector, day-of-week grid labels, window start/end, exception date + window + optional reason, list/delete labels, PT-BR empty states, cross-link "Exceções".
      No test-first — pure strings; asserted via 4.3–4.6 tests. Verify: `pnpm typecheck`.
      Deps: 4.1. Done when: both sections resolve.
      Coverage: admin-dashboard §Admin PT-BR Copy; §Admin Schedules and Exceptions Pages; D12.

- [ ] **4.3** `schedules-manager.tsx` container — [frontend · manager]
      Create `apps/web/app/(admin)/schedules/schedules-manager.tsx`: barber selector + weekly `dayOfWeek` grid CRUD; header cross-link to Exceções (D6); injected `fetchFn` deps.
      Tests (test-first): container test (happy-dom) — save a weekly window POSTs and appears for the barber; delete removes; cross-link present. Verify: `pnpm test apps/web/app/\(admin\)/schedules/schedules-manager.container.test.tsx`.
      Deps: 4.1–4.2. Done when: "Add a weekly schedule" scenario green.
      Coverage: admin-dashboard §Admin Schedules and Exceptions Pages ("Add a weekly schedule"); D6.

- [ ] **4.4** `schedules/page.tsx` server page — [frontend · page]
      Create `apps/web/app/(admin)/schedules/page.tsx`: thin server component rendering `<SchedulesManager/>`.
      Tests (test-first): page.test.tsx (`renderToStaticMarkup`, mocked manager) — renders under guard. Verify: `pnpm test apps/web/app/\(admin\)/schedules/page.test.tsx`.
      Deps: 4.3. Done when: page renders under guard.
      Coverage: admin-dashboard §Admin Schedules and Exceptions Pages; D1.

### PR Boundary — S4a

| Field | Value |
|-------|-------|
| Branch | `feat/admin-dashboard-4a` → base `main` (stacked-to-main) |
| Forecast | ~230 (≤400) |
| Own tests | admin-api.test.ts (schedules), schedules-manager.container.test.tsx, schedules page.test.tsx |
| Verify | `pnpm test apps/web/lib/admin-api.test.ts apps/web/app/\(admin\)/schedules/` |

```
Chain Context — stacked to main
   main
    └── #1a → #1b → #2a → #2b → #3a → #3b barbers UI
         └── #4a schedules UI  📍 (this PR)
              └── #4b exceptions UI → #5a → #5b → #6a → #6b
State: start = no schedule UI; end = weekly dayOfWeek grid CRUD per barber + cross-link to Exceções.
Prior: #3b. Follow-ups: #4b exceptions. Out of scope: recurring exceptions, bulk import.
```

---

# Slice S4b — Exceptions UI (`feat/admin-dashboard-4b`)

Split CONFIRMED by user (2026-08-19) — sub-PR S4b = tasks 4.5–4.6 (forecast ~240, ≤400). Files: `apps/web/app/(admin)/exceptions/{page.tsx,exceptions-manager.tsx}` (new), `apps/web/lib/admin-api.ts`, `apps/web/lib/i18n.ts`.

- [ ] **4.5** `exceptions-manager.tsx` container — [frontend · manager]
      Create `apps/web/app/(admin)/exceptions/exceptions-manager.tsx`: barber/date picker, window + optional reason, list/delete; PT-BR empty state; injected `fetchFn` deps.
      Tests (test-first): container test (happy-dom) — save full-day exception (day-off) lists it and overrides that date; window+reason variant posts window payload; delete removes. Verify: `pnpm test apps/web/app/\(admin\)/exceptions/exceptions-manager.container.test.tsx`.
      Deps: 4.1–4.2. Done when: "Add a day-off exception" scenario green.
      Coverage: admin-dashboard §Admin Schedules and Exceptions Pages ("Add a day-off exception").

- [ ] **4.6** `exceptions/page.tsx` server page — [frontend · page]
      Create `apps/web/app/(admin)/exceptions/page.tsx`: thin server component rendering `<ExceptionsManager/>`.
      Tests (test-first): page.test.tsx (`renderToStaticMarkup`, mocked manager) — renders under guard. Verify: `pnpm test apps/web/app/\(admin\)/exceptions/page.test.tsx`.
      Deps: 4.5. Done when: page renders under guard.
      Coverage: admin-dashboard §Admin Schedules and Exceptions Pages; D1.

### PR Boundary — S4b

| Field | Value |
|-------|-------|
| Branch | `feat/admin-dashboard-4b` → base `main` (stacked-to-main) |
| Forecast | ~240 (≤400) |
| Own tests | admin-api.test.ts (exceptions), exceptions-manager.container.test.tsx, exceptions page.test.tsx |
| Verify | `pnpm test apps/web/lib/admin-api.test.ts apps/web/app/\(admin\)/exceptions/` |

```
Chain Context — stacked to main
   main
    └── #1a → #1b → #2a → #2b → #3a → #3b barbers UI
         └── #4a schedules UI
              └── #4b exceptions UI  📍 (this PR)
                   └── #5a day-grouping+reports → #5b invites → #6a appointments backend → #6b agenda
State: start = schedules UI, no exceptions UI; end = day-off/window exceptions per barber.
Prior: #3b, #4a. Follow-ups: #5a reports. Out of scope: recurring exceptions, bulk import.
```

---

# Slice S5a — Day grouping + Reports UI (`feat/admin-dashboard-5a`)

Split CONFIRMED by user (2026-08-19) — sub-PR S5a = tasks 5.1–5.6 (forecast ~280, ≤400). Files: `packages/contracts/src/reporting.ts`, `apps/web/lib/reporting.ts`, `apps/web/app/(admin)/reports/{page.tsx,reports-form.tsx}` (new), `apps/web/lib/admin-api.ts`, `apps/web/lib/i18n.ts`. S5b (tasks 5.7–5.8, invites UI) is the next sub-PR below.

- [ ] **5.1** Contract: `ReportGroupBy` += `"day"` — [backend · contracts]
      Modify `packages/contracts/src/reporting.ts`: add `"day"` to the `ReportGroupBy` enum; default stays `"none"` (D4, D5).
      Tests (test-first): extend `packages/contracts/src/reporting.test.ts` — schema accepts `"day"`, rejects unknown, default `"none"`. Verify: `pnpm test packages/contracts/src/reporting.test.ts`; `pnpm typecheck`.
      Deps: S4. Done when: contract green with `"day"` accepted.
      Coverage: admin-dashboard §Admin Reports Page (grouping day/barber/service); D4.

- [ ] **5.2** `reporting.ts` day grouping — [backend · lib]
      Modify `apps/web/lib/reporting.ts`: when `groupBy === "day"`, bucket rows by tenant-local date key via `dateKeyInTz(startsAt, timezone)` (same helper `generateReport` already uses for range boundaries); zeroed rows for empty days.
      Tests (test-first): extend `apps/web/lib/reporting.test.ts` — day bucket groups by local date across a tz boundary; empty period yields zeroed row; `groupBy: "none"` path unchanged. Verify: `pnpm test apps/web/lib/reporting.test.ts`.
      Deps: 5.1. Done when: day bucket + tz behavior green.
      Coverage: admin-dashboard §Admin Reports Page ("Empty report period" zeroed rows); D4; design timezone note (identical to `generateReport`).

- [ ] **5.3** admin-api reports + invites fetchers — [backend · lib]
      Extend `apps/web/lib/admin-api.ts`: `fetchReport` (range + groupBy, returns rows), `sendInvite` (email) with client-side `InviteInput.safeParse` (invalid email → error, no fetch).
      Tests (test-first): extend `admin-api.test.ts` — report query serializes from/to/groupBy; invite POSTs valid email; invalid email → no fetch. Verify: `pnpm test apps/web/lib/admin-api.test.ts`.
      Deps: 5.2. Done when: both fetchers tested incl. no-fetch-on-invalid-email.
      Coverage: admin-dashboard §Admin Reports Page, §Admin Invites Page (both scenarios); error-code `INVALID_INPUT` (invites email).

- [ ] **5.4** PT-BR `admin.reports` + `admin.invites` i18n strings — [frontend · i18n]
      Extend the `admin` section of `apps/web/lib/i18n.ts`: range labels, groupBy labels (day/barber/service), CSV download label, rows table headers, invite email field + success message + invalid-email error, PT-BR empty state.
      No test-first — pure strings; asserted via 5.5–5.8 tests. Verify: `pnpm typecheck`.
      Deps: 5.3. Done when: both sections resolve.
      Coverage: admin-dashboard §Admin PT-BR Copy; §Admin Reports Page; §Admin Invites Page; D12.

- [ ] **5.5** `reports-form.tsx` — [frontend · manager]
      Create `apps/web/app/(admin)/reports/reports-form.tsx`: range + groupBy form with defaults `from` = 1st of current BR month, `to` = today, `groupBy` = "none" (D5); rows table; CSV link via `format=csv` (existing route).
      Tests (test-first): container test (happy-dom) — defaults applied; groupBy change refetches; CSV link points to `format=csv`; zeroed rows render without error. Verify: `pnpm test apps/web/app/\(admin\)/reports/reports-form.container.test.tsx`.
      Deps: 5.3–5.4. Done when: defaults/CSV/zeroed scenarios green.
      Coverage: admin-dashboard §Admin Reports Page ("Download CSV", "Empty report period"); D5.

- [ ] **5.6** `reports/page.tsx` server page — [frontend · page]
      Create `apps/web/app/(admin)/reports/page.tsx`: thin server component rendering `<ReportsForm/>`.
      Tests (test-first): page.test.tsx (`renderToStaticMarkup`, mocked manager) — renders under guard. Verify: `pnpm test apps/web/app/\(admin\)/reports/page.test.tsx`.
      Deps: 5.5. Done when: page renders under guard.
      Coverage: admin-dashboard §Admin Reports Page; D1.

### PR Boundary — S5a

| Field | Value |
|-------|-------|
| Branch | `feat/admin-dashboard-5a` → base `main` (stacked-to-main) |
| Forecast | ~280 (≤400) |
| Own tests | contracts/reporting.test.ts, lib/reporting.test.ts, admin-api.test.ts (reports), reports-form.container.test.tsx, reports page.test.tsx |
| Verify | `pnpm test packages/contracts/src/reporting.test.ts apps/web/lib/reporting.test.ts apps/web/lib/admin-api.test.ts apps/web/app/\(admin\)/reports/` |

```
Chain Context — stacked to main
   main
    └── #1a → #1b → #2a → #2b → #3a → #3b → #4a → #4b exceptions UI
         └── #5a day grouping + reports UI  📍 (this PR)
              └── #5b invites UI → #6a appointments backend → #6b agenda
State: start = no reports UI, no day grouping; end = reports w/ day/barber/service grouping + CSV.
Prior: #4b. Follow-ups: #5b invites. Out of scope: invite list, manual payment.
```

---

# Slice S5b — Invites UI (`feat/admin-dashboard-5b`)

Split CONFIRMED by user (2026-08-19) — sub-PR S5b = tasks 5.7–5.8 (forecast ~200, ≤400). Files: `apps/web/app/(admin)/invites/{page.tsx,invites-form.tsx}` (new), `apps/web/lib/admin-api.ts`, `apps/web/lib/i18n.ts`.

- [ ] **5.7** `invites-form.tsx` — [frontend · manager]
      Create `apps/web/app/(admin)/invites/invites-form.tsx`: email form; client-side `InviteInput.safeParse`; success message on 200; PT-BR error on invalid email; no list (invite-list endpoint out of scope).
      Tests (test-first): container test (happy-dom) — invalid email → PT-BR validation error and no fetch; valid email → POST + success message. Verify: `pnpm test apps/web/app/\(admin\)/invites/invites-form.container.test.tsx`.
      Deps: 5.3–5.4. Done when: both invite scenarios green.
      Coverage: admin-dashboard §Admin Invites Page ("Invite by email", "Invalid email").

- [ ] **5.8** `invites/page.tsx` server page — [frontend · page]
      Create `apps/web/app/(admin)/invites/page.tsx`: thin server component rendering `<InvitesForm/>`.
      Tests (test-first): page.test.tsx (`renderToStaticMarkup`, mocked manager) — renders under guard. Verify: `pnpm test apps/web/app/\(admin\)/invites/page.test.tsx`.
      Deps: 5.7. Done when: page renders under guard.
      Coverage: admin-dashboard §Admin Invites Page; D1.

### PR Boundary — S5b

| Field | Value |
|-------|-------|
| Branch | `feat/admin-dashboard-5b` → base `main` (stacked-to-main) |
| Forecast | ~200 (≤400) |
| Own tests | admin-api.test.ts (invites), invites-form.container.test.tsx, invites page.test.tsx |
| Verify | `pnpm test apps/web/lib/admin-api.test.ts apps/web/app/\(admin\)/invites/` |

```
Chain Context — stacked to main
   main
    └── #1a → #1b → #2a → #2b → #3a → #3b → #4a → #4b → #5a reports UI
         └── #5b invites UI  📍 (this PR)
              └── #6a appointments backend → #6b agenda
State: start = reports UI, no invites UI; end = email invites with PT-BR success/error.
Prior: #5a. Follow-ups: #6a appointments backend. Out of scope: invite list, manual payment.
```

# Slice S6a — Appointments backend (`feat/admin-dashboard-6a`)

Read-side backend gap #2 (proposal risk "Slices 3/6 blocked by API gaps"; pay needs the list endpoint). Files: `packages/contracts/src/booking.ts`, `apps/web/lib/admin-appointments.ts` (new), `apps/web/app/api/admin/appointments/route.ts` (new GET).

- [ ] **6a.1** Contracts: `AdminAppointmentQuery` + `AdminAppointmentView` — [backend · contracts]
      Modify `packages/contracts/src/booking.ts`: add `AdminAppointmentQuery` (status optional, `date` YYYY-MM-DD regex, `barberId: z.string().uuid().optional()`) and `AdminAppointmentView = AppointmentView.extend({ serviceName, barberName nullable, clientName nullable })` (D8, D9).
      Tests (test-first): extend `packages/contracts/src/booking.test.ts` — query accepts valid combos; rejects malformed date/status/barberId; view parses with names; names required. Verify: `pnpm test packages/contracts/src/booking.test.ts`; `pnpm typecheck`.
      Deps: S5. Done when: schemas green incl. `uuid()` validation.
      Coverage: booking delta §Admin Appointment Listing (incl. "Invalid filter value"); D8, D9.

- [ ] **6a.2** `listAdminAppointments` lib — [backend · lib]
      Create `apps/web/lib/admin-appointments.ts`: `listAdminAppointments(db, barbershopId, query)` — parse, tenant scope, tz-aware `date` range `[zonedToUtc(date,"00:00",tz), zonedToUtc(nextDateKey(date),"00:00",tz))` (load `barbershop.timezone`), ordering `startsAt` asc, include service/barber/client names.
      Tests (test-first): create `apps/web/lib/admin-appointments.test.ts` (mocked prisma) — day filter returns only that day in tenant tz (cross-midnight case); status+barberId combined; tenant isolation (foreign excluded); empty → `[]`; ordering asc. Verify: `pnpm test apps/web/lib/admin-appointments.test.ts`.
      Deps: 6a.1. Done when: tz range/ordering/empty/scoping green.
      Coverage: booking delta §Admin Appointment Listing (all five scenarios); D8; design timezone note.

- [ ] **6a.3** GET `api/admin/appointments` route — [backend · route]
      Create `apps/web/app/api/admin/appointments/route.ts`: GET, `guardAdmin` (401/403), `AdminAppointmentQuery.safeParse` on searchParams → 400 `INVALID_INPUT` on miss; call lib → 200 `AdminAppointmentView[]` (empty `[]`); `TENANT_NOT_FOUND` → 404.
      Tests (test-first): create `route.test.ts` (`vi.doMock` of `@/lib/{auth,db,admin-appointments}` — reports-route.test.ts pattern) — 200 with rows; 200 empty `[]`; 400 `INVALID_INPUT` for bad date/status/barberId; 401/403 guard; 404 `TENANT_NOT_FOUND`. Verify: `pnpm test "apps/web/app/api/admin/appointments/route.test.ts"`.
      Deps: 6a.2. Done when: all route scenarios green.
      Coverage: booking delta §Admin Appointment Listing (200/400/404 cases, tenant isolation via lib); error codes `INVALID_INPUT`, `TENANT_NOT_FOUND`.

### PR Boundary — S6a

| Field | Value |
|-------|-------|
| Branch | `feat/admin-dashboard-6a` → base `main` (stacked-to-main) |
| Forecast | ~300 changed lines (≤400 ✓) |
| Own tests | contracts/booking.test.ts, admin-appointments.test.ts, appointments/route.test.ts |
| Verify | `pnpm test packages/contracts/src/booking.test.ts apps/web/lib/admin-appointments.test.ts "apps/web/app/api/admin/appointments/route.test.ts"` |

```
Chain Context — stacked to main
   main
    └── #1a → #1b → #2 → #3a → #3b → #4 → #5 reports/invites
         └── #6a appointments backend  📍 (this PR)
              └── #6b agenda UI + pay
State: start = no admin appointments list endpoint; end = filtered tenant-scoped GET with tz day range.
Prior: #5. Follow-ups: #6b agenda UI consumes it. Out of scope: pay changes (existing route).
```

---

# Slice S6b — Agenda UI + pay (`feat/admin-dashboard-6b`)

Files: `apps/web/app/(admin)/agenda/{page.tsx,agenda-manager.tsx}` (new), `apps/web/lib/admin-api.ts` (appointments + pay fetchers), `apps/web/lib/i18n.ts`, `apps/web/e2e/agenda-pay.spec.ts` (new).

- [ ] **6b.1** admin-api appointments + pay fetchers — [backend · lib]
      Extend `apps/web/lib/admin-api.ts`: `listAdminAppointments` (status/date/barberId query params), `payAppointment` → POST `/api/admin/appointments/:id/pay` mapping 200 `{id,status,paymentStatus}` | 404 `PAYMENT_APPOINTMENT_NOT_FOUND` | 409 `MANUAL_PAYMENT_ALREADY_PROCESSED` to PT-BR via `messageFor`.
      Tests (test-first): extend `admin-api.test.ts` — list serializes query params; pay 200 returns updated view; 409 and 404 surface codes + PT-BR messages. Verify: `pnpm test apps/web/lib/admin-api.test.ts`.
      Deps: 6a.3. Done when: list + pay mapping green incl. 404/409.
      Coverage: booking delta §Status Lifecycle ("Admin pays a pending appointment", "Pay on a non-pending appointment", "Pay on an unknown appointment"); D10 (no backend change — mapping only).

- [ ] **6b.2** PT-BR `admin.agenda` i18n strings — [frontend · i18n]
      Extend the `admin` section of `apps/web/lib/i18n.ts`: filter labels (status/date/barber), pending/confirmed/completed/cancelled status labels, pay action label, PT-BR empty state, pay success/error messages.
      No test-first — pure strings; asserted via 6b.3/6b.4 tests. Verify: `pnpm typecheck`.
      Deps: 6b.1. Done when: `translations.admin.agenda.*` resolves.
      Coverage: admin-dashboard §Admin PT-BR Copy; §Admin Agenda Page (empty state); D12.

- [ ] **6b.3** `agenda-manager.tsx` container — [frontend · manager]
      Create `apps/web/app/(admin)/agenda/agenda-manager.tsx`: filtered list with URL-state filters (status/date/barber — booking-flow pattern), pay button on pending rows, PT-BR empty state; injected `fetchFn` deps.
      Tests (test-first): container test (happy-dom, `vi.mock("next/navigation")`) — filter change updates URL state and refetches; pay on pending → 200 removes from pending set; 409 and 404 show PT-BR messages; empty state renders. Verify: `pnpm test apps/web/app/\(admin\)/agenda/agenda-manager.container.test.tsx`.
      Deps: 6b.1–6b.2. Done when: filter/pay/empty scenarios green.
      Coverage: admin-dashboard §Admin Agenda Page ("Filtered agenda", "Pay a pending appointment", "Empty agenda result"); booking delta §Status Lifecycle pay scenarios.

- [ ] **6b.4** `agenda/page.tsx` server page — [frontend · page]
      Create `apps/web/app/(admin)/agenda/page.tsx`: server component reading `searchParams {status,date,barberId}` → `listAdminAppointments(db, shopId, query)` (server-side `AdminAppointmentQuery` validation, D9) → `<AgendaManager/>`.
      Tests (test-first): page.test.tsx (`renderToStaticMarkup`, mocked libs/manager) — renders rows from searchParams; invalid searchParam handled (400 shape). Verify: `pnpm test apps/web/app/\(admin\)/agenda/page.test.tsx`.
      Deps: 6b.3. Done when: page renders under guard with URL-state wiring.
      Coverage: admin-dashboard §Admin Agenda Page ("Filtered agenda" ordered by start time); D9.

- [ ] **6b.5** E2E `agenda-pay.spec.ts` — [e2e]
      Create `apps/web/e2e/agenda-pay.spec.ts`: seeded admin filters the agenda (status + barber) → pending rows shown → pay a pending appointment → leaves the pending set. Extend `apps/web/e2e/start-server.ts` fixture with a seeded pending appointment + unprofiled barber candidate (additive).
      Tests: the spec itself (Playwright). Verify: `pnpm exec playwright test -c apps/web/playwright.config.ts agenda-pay`.
      Deps: 6b.3–6b.4. Done when: spec green against seeded fixture.
      Coverage: admin-dashboard §Admin Agenda Page ("Filtered agenda", "Pay a pending appointment"); proposal success criterion "Agenda lists/filters appointments; pay updates status".

### PR Boundary — S6b

| Field | Value |
|-------|-------|
| Branch | `feat/admin-dashboard-6b` → base `main` (stacked-to-main) |
| Forecast | ~360 changed lines (≤400 ✓) |
| Own tests | admin-api.test.ts (appointments/pay), agenda-manager.container.test.tsx, page.test.tsx, agenda-pay.spec.ts |
| Verify | `pnpm test apps/web/lib/admin-api.test.ts apps/web/app/\(admin\)/agenda/` + Playwright `agenda-pay` |

```
Chain Context — stacked to main
   main
    └── #1a → #1b → #2 → #3a → #3b → #4 → #5 → #6a appointments backend
         └── #6b agenda UI + pay  📍 (this PR)
State: start = no agenda UI; end = filtered agenda + pay via existing action (chain complete).
Prior: #6a (list endpoint). Follow-ups: none — change done. Out of scope: Pix UI, notifications.
```

---

# Coverage Matrix

Every spec requirement and design decision maps to at least one task. Requirement IDs refer to the delta specs (`admin-dashboard`, `catalog`, `booking`).

| Requirement / Decision | Tasks |
|---|---|
| admin-dashboard §Admin Shell Guard and Navigation (guest / non-admin / nav+sign-out) | 1a.1, 1a.2, 1a.4, 1a.5, 1a.6 |
| admin-dashboard §Dashboard Home (incomplete onboarding / empty day) | 1b.1, 1b.2, 1b.3 |
| admin-dashboard §Admin Services Page (create+list / empty / 409 deactivate) | 2.1–2.6 |
| admin-dashboard §Admin Barbers Page (toggle / empty list) | 3a.1–3a.3, 3b.1–3b.4 |
| admin-dashboard §Admin Schedules and Exceptions Pages | 4.1–4.6 |
| admin-dashboard §Admin Reports Page (CSV / empty period / grouping) | 5.1, 5.2, 5.3, 5.5, 5.6 |
| admin-dashboard §Admin Invites Page (valid / invalid email) | 5.3, 5.7, 5.8 |
| admin-dashboard §Admin Agenda Page (filtered / pay / empty) | 6a.1–6a.3, 6b.1–6b.5 |
| admin-dashboard §Admin PT-BR Copy (all strings from `admin` section) | 1a.3, 1b.1, 2.3, 3b.2, 4.2, 5.4, 6b.2 |
| catalog §Barber Service Assignment Matrix (mixed / none / unknown-foreign 404) | 3a.1, 3a.2, 3a.3 |
| catalog §Barber Profiles (identity in admin list / create / non-admin denied) | 3a.1, 3a.2, 3b.3, 3b.4 |
| booking §Admin Appointment Listing (day / combined / empty / invalid 400 / isolation) | 6a.1, 6a.2, 6a.3 |
| booking §Status Lifecycle (admin pay 200/409/404) | 6b.1, 6b.3 |
| D1 layout guard | 1a.1, 1a.4 |
| D2 dashboard server component | 1b.3 |
| D3 day metrics reuse reports API | 1b.3 |
| D4 `"day"` grouping (contract + reporting) | 5.1, 5.2 |
| D5 report defaults + CSV | 5.5 |
| D6 7 nav links + exceptions cross-link | 1a.5, 4.3 |
| D7 userId text input (UX debt) | 3b.3 |
| D8 `AdminAppointmentView` enrichment | 6a.1, 6a.2 |
| D9 `barberId` uuid validation | 6a.1, 6a.3, 6b.4 |
| D10 pay: no backend change, UI mapping only | 6b.1 |
| D11 `lib/admin-api.ts` centralized mapping | 2.1 |
| D12 `admin` i18n section, no `t()` extension | all i18n tasks (1a.3, 1b.1, 2.3, 3b.2, 4.2, 5.4, 6b.2) |
| D13 no `CONTRACT_VERSION` bump | 3a.1 |
| D14 sub-PR splits S1/S3/S6 | slice boundaries 1a/1b, 3a/3b, 6a/6b |

Non-negotiables check (must NOT be dropped at apply): PT-BR admin i18n ✓ (all i18n tasks); `requireAdminPage`/`adminLoginPath` tests ✓ (1a.1, 1a.2); error-code → PT-BR mapping in `lib/admin-api.ts` ✓ (2.1); day-grouping backend delta reporting.ts + contracts ✓ (5.1, 5.2); assignment matrix route ✓ (3a.3); appointments list route with tz handling ✓ (6a.2, 6a.3); pay action mapping ✓ (6b.1); E2E specs `admin-shell.spec.ts` / `services.spec.ts` / `agenda-pay.spec.ts` ✓ (1a.6, 2.6, 6b.5).

## Open items carried into apply

- **S2 / S4 / S5 line counts**: final split confirmed by task-level counting at apply (ask-on-risk gate) — each sub-PR must stay ≤400 authored changed lines.
- **`x-pathname` header** in `layout.tsx`: community-standard Next.js pattern; fallback `/dashboard` keeps behavior safe if absent (1a.2 covers the fallback in `adminLoginPath`).
- **No schema changes**; backend additions are additive reads — existing clients unaffected (rollback = per-slice revert).
