# Tasks: Barbershop Platform v1

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main (feature branch feat/wu2-data-layer, each work unit stacked)
400-line budget risk: High

| # | Work unit (PR) | Scope | lines |
|---|----------------|-------|-----------|
| 1 | Bootstrap+CI | monorepo, Testcontainers, skeletons, i18n PT-BR | 600 |
| 2 | Data layer | contracts, Prisma schema, migration, seed, scoping | 700 |
| 3 | Auth+tenants | Auth.js, roles, consent, invites, onboarding | 800 |
| 4 | Catalog | services/barbers/schedules CRUD, slots, API | 900 |
| 5 | Booking | lifecycle, conflict prevention, outbox tx | 800 |
| 6 | Payments | PixProvider+MP, webhook idempotency, manual paid | 700 |
| 7 | Worker | outbox, reminders, PT-BR emails, reconcile | 700 |
| 8 | Reporting | reports, revenue, CSV BOM, admin UI | 600 |
| 9 | LGPD+E2E | export/delete, policy, Playwright, hardening | 800 |

Verify/PR: `pnpm test && pnpm test:integration` (+e2e PR 9).

## Phase 1: Bootstrap

- [x] 1.1 pnpm+Turbo monorepo: apps/{web,worker}, packages/{contracts,db,payments}
- [x] 1.2 Vitest+Testcontainers+Playwright; test scripts
- [x] 1.3 CI: typecheck, lint, build, tests
- [x] 1.4 Skeletons: web+worker apps, layouts, Tailwind, PT-BR i18n, cron
- [x] 1.5 config.yaml: strict_tdd=true, test_command=vitest run

## Phase 2: Data layer

- [x] 2.1 contracts: Zod schemas (auth, catalog, booking, payments, reporting, lgpd)
- [x] 2.2 Prisma: all entities; barbershopId scoping
- [x] 2.3 btree_gist + no_overlap migration; seed A/B
- [x] 2.4 lib/tenant.ts requireTenant()/scope() where-injection
- [x] 2.5 Tests: cross-tenant 404; scoped listing (spec)

## Phase 3: Auth+Tenants

- [ ] 3.1 lib/auth.ts: Auth.js v5, Credentials+Google, session role+tenant
- [ ] 3.2 register: consent-gated, refuse without consent (spec)
- [ ] 3.3 Middleware: /api/admin/* 403; booking 401
- [ ] 3.4 Invites: single-use token → tenant barber; reused rejected (spec)
- [ ] 3.5 Onboarding flow; incomplete → guided; policies auto|manual+windows
- [ ] 3.6 Tests: role 403, consent refusal, Google→client, invite-once (spec)

## Phase 4: Catalog+Booking

- [ ] 4.1 CRUD services/barbers/schedules/exceptions; deactivate → unbookable (spec)
- [ ] 4.2 lib/slots.ts: schedule−exceptions−appointments; 15|30; fit duration; past date error
- [ ] 4.3 Public API: GET services + slots (Zod)
- [ ] 4.4 POST /api/bookings: auth, snapshot, tx appointment+outbox, revalidate slot
- [ ] 4.5 Lifecycle + reschedule/cancel: window rules, atomic slot move, outbox
- [ ] 4.6 Tests: double-booking one-409, slot grid, invalid transitions (spec)

## Phase 5: Payments+Worker

- [ ] 5.1 packages/payments: PixProvider + mercadoPago adapter
- [ ] 5.2 payments/:id/pix: pending+QR; failure keeps appointment
- [ ] 5.3 Webhook HMAC→fetch→idempotent (UNIQUE); paid→confirmed; manual paid
- [ ] 5.4 Worker: PT-BR emails→Resend, backoff; reminderScan once; reconcile
- [ ] 5.5 Tests: webhook dup no-change, crash-after-commit, reminder once (spec)

## Phase 6: LGPD+Hardening

- [ ] 6.1 Reports: counts by barber/service, rates, zeroed empty; revenue; CSV+BOM (spec)
- [ ] 6.2 PT-BR privacy policy page; withdrawal stops non-essential processing (spec)
- [ ] 6.3 me/export JSON; me/delete: cancel future, anonymize PII, keep legal rows (spec)
- [ ] 6.4 E2E: browse→login→book→QR; admin→book; cancel windows; 409
- [ ] 6.5 Full verify: scenario audit, README, suites green
