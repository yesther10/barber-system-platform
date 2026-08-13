# Design: Barbershop Platform v1

## Technical Approach

Multi-tenant barbershop SaaS: Next.js (App Router) monolith + in-repo worker, TS everywhere, Prisma/MySQL, Zod contracts shared with future native apps. REST API-first — logic lives in route handlers/service modules, never components. Resolves the two deferred choices: Pix provider and cancellation defaults.

## Architecture Decisions

| # | Decision | Options | Decision |
|---|----------|---------|----------|
| 1 | Pix provider | MP vs PagSeguro | **Mercado Pago** (below) |
| 2 | Cancellation defaults | unspecified | 24h free-cancel; reject late (below) |
| 3 | Tenant isolation | `barbershop_id` vs RLS | `barbershop_id` + app scoping; RLS couples to Supabase |
| 4 | Slot conflicts | app lock vs exclusion | app lock: `SELECT ... FOR UPDATE` on barber + transactional re-validation (MySQL has no exclusion constraints) |
| 5 | Webhooks | trust body vs verify-then-fetch | HMAC verify → fetch by id → idempotent apply |
| 6 | No-show | extra status vs flag | `noShowAt` flag — a status violates spec lifecycle |

### Decision 1: Pix provider — Mercado Pago

| Criterion | MP | PagSeguro |
|-----------|----|-----------|
| Node/TS SDK | Official, TS types (v2.6.0) | None — PHP/Java only |
| Pix fee | 0.99% | 0.99% |
| Docs / webhooks | High; HMAC x-signature | Medium; limited |
| Sandbox / BR share | Test users; most-used | Yes; popular |

Rationale: only MP has an official TypeScript SDK — PagSeguro forces hand-rolled REST with self-maintained types. Equal fees; MP leads on docs, webhooks, adoption. PagSeguro demands payer CPF/birth-date, conflicting with LGPD minimal-PII. Provider-agnostic boundary keeps migration open.

### Decision 2: Cancellation defaults

Per-tenant overridable: `freeCancelWindowHours: 24`; `lateCancelPolicy: "reject"` (inside window → 409; admin may force-cancel); `rescheduleWindowHours: 24`; no-show via `noShowAt` flag — no fee v1, counted in reports.

## Monorepo Layout

- `apps/web` — Next.js: `app/(public)/booking`, `app/(auth)/`, `app/(admin)/`; `app/api/**` handlers; `lib/` services (booking, slots, payments, reporting), `lib/auth.ts`, `lib/tenant.ts`; `emails/` React Email (PT-BR).
- `apps/worker` — standalone Node, cron 15 min: `outboxScan`, `reminderScan`, `paymentReconcile`.
- `packages/contracts` — Zod schemas (booking, catalog, auth, payments, reporting, lgpd); validated at API edge; reused by RN apps.
- `packages/db` — Prisma schema + migrations + seed.
- `packages/payments` — `PixProvider` (`createPayment`, `getPayment`, `refund`, `verifyWebhook`) + `mercadoPago.ts`.

## Data Model (Prisma sketch)

```
Barbershop: id, slug, name, timezone, slotGranularity(15|30), confirmationMode(auto|manual),
  freeCancelWindowHours=24, lateCancelPolicy=reject, rescheduleWindowHours=24,
  reminderLeadHours=24, pixProvider, pixCredentials
User: id, email, passwordHash?, name, phone?, role(client|barber|barbershop_admin),
  barbershopId?, consentAcceptedAt?, consentPolicyVersion?
Barber: id, barbershopId, userId, specialties (Json string[]), bio?, active
Service: id, barbershopId, name, priceBRL, durationMinutes, active
BarberService: barberId, serviceId          -- m2m assignment (specialties)
Schedule: id, barberId, dayOfWeek(1-7), startTime, endTime
ScheduleException: id, barberId, date, startTime, endTime, reason
Appointment: id, barbershopId, barberId, clientId, serviceId, startsAt, endsAt (UTC),
  status(pending|confirmed|completed|cancelled), priceSnapshot,
  paymentStatus(pending|paid|expired|refunded), paymentProviderId?, noShowAt?, cancelReason?
EmailNotification: id, appointmentId, type(confirmation|reminder|reschedule|cancellation),
  status(queued|sent|failed), retryCount, nextAttemptAt    -- transactional outbox
PaymentWebhookEvent: id, providerEventId UNIQUE, payload    -- idempotency ledger
```

Isolation: every tenant entity carries `barbershopId`; `lib/tenant.ts` injects `where: { barbershopId: session.tenant }`; cross-tenant → 404.

Conflict prevention — MySQL has no exclusion constraints, so the guard is application-level in the booking transaction (WU5):

```
tx: SELECT ... FOR UPDATE barber row   -- serializes concurrent bookings for the same barber
    → re-check overlap in code (against appointments in [startsAt, endsAt))
    → INSERT appointment + outbox atomically
overlap found → 409
```

Slot conflict guarantee therefore lives in the booking service, not the DB.

## API Surface

| Endpoint | Access | Notes |
|----------|--------|-------|
| `GET /api/public/barbershops/:slug/services` | public | catalog browse |
| `GET /api/public/barbershops/:slug/slots?service=&barber=&date=` | public | slot projection |
| `POST /api/bookings`; `PUT .../:id` (reschedule); `POST .../:id/cancel` | client (401) | lifecycle |
| `POST /api/payments/:id/pix` | client | QR payload; retryable |
| `POST /api/webhooks/mercadopago` | provider HMAC | verify → fetch → apply |
| `POST /api/auth/register`; `POST /api/admin/invites` | public / admin | consent-gated; single-use token |
| `/api/admin/{barbers,services,schedules,appointments,reports}` | barbershop_admin (403) | manual payment, refund, CSV |
| `POST /api/me/export`; `DELETE /api/me` | client | LGPD |

All Zod-validated from `packages/contracts`; same endpoints serve future mobile.

## Worker

Every 15 min: (1) **outbox** — `queued|failed` past `nextAttemptAt` → render React Email → Resend → `sent`/`failed`, exponential backoff; (2) **reminders** — confirmed where `startsAt − lead ≤ now`, none sent → one email, flag-guarded; (3) **reconcile** — MP payments `pending` > 10 min → fetch status → apply if `approved` (webhook-loss safety net). All writes idempotent.

## Data Flow (booking → paid)

```
Client → POST /api/bookings → tx: re-validate slot → INSERT appointment(pending) + outbox → 201
POST /api/payments/:id/pix → PixProvider.createPayment → QR
MP webhook → HMAC verify → GET /payments/:id → approved → tx: paid + confirmed (auto) + outbox → 200
Duplicate webhook → providerEventId UNIQUE violation → ack, no state change
Worker reconcile catches webhooks MP never delivered
```

## Auth

Auth.js v5: Credentials (bcrypt) + Google; new Google users auto-provisioned `client` with consent record. Session callback attaches `role` + `barbershopId`; middleware: `/api/bookings*` → 401 without session, `/api/admin/*` → 403 without role. Barber invites: signed single-use token → tenant-scoped `barber`. Consent: signup checkbox stores timestamp + policy version; withdrawal stops non-essential processing.

## Non-Functional

- **Responsive**: Tailwind mobile-first; booking flow phone-optimized.
- **i18n**: PT-BR UI copy + emails; English code; single locale v1.
- **LGPD**: DB hosted in Brazil region (data residency); minimal PII; export → structured JSON ≤ 15 days; deletion → cancel future appointments, null PII, keep anonymized legal rows.

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit (Vitest, RED-GREEN-REFACTOR) | slot projection, status transitions (invalid rejected), window rules, `reminderAt`, price snapshot | pure domain services |
| Integration (Vitest + real MySQL) | booking tx + outbox atomicity; **concurrent double-booking — two parallel inserts, exactly one succeeds**; cross-tenant → 404; webhook duplicate → no change; outbox retry | Testcontainers; per-tenant fixtures |
| E2E (Playwright) | browse → login → book → QR; admin + schedule → client books; cancel in/out window; conflict 409 | critical paths |

Flip `strict_tdd: true`, `test_command: "vitest run"` in `openspec/config.yaml` during apply.

## Migration / Rollout

Greenfield: `prisma migrate dev` in dependency order; MySQL schema ships with WU2; the app-level slot lock ships with the WU5 booking service. Per-tenant payments flag; webhook disable → manual in-shop fallback; outbox prevents lost emails. No data migration.

## Open Questions

- [ ] Google OAuth: client must provide Google Cloud project + consent screen credentials
- [ ] Mercado Pago production onboarding (CPF/CNPJ + Pix key) — client account
- [ ] Client domain + SPF/DKIM/DMARC for Resend deliverability
