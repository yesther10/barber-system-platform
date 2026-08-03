# Proposal: Barbershop Platform v1 (multi-tenant scheduling & management)

## Intent

Multi-tenant scheduling + management platform for barbershops, sold to N shops:

- **Clients**: book/cancel/reschedule, pay via Pix, PT-BR confirmations & reminders.
- **Admins**: manage barbers/services/schedules, confirm bookings, take Pix, reports.
- **Platform**: tenant onboarding & isolation (`barbershop_id` scoping), per-tenant policies, LGPD.

## Scope

### In Scope
- Tenant onboarding: signup + setup (services, barbers, policies, Pix credentials)
- Booking: services → barber → slot grid → login (REQUIRED) → book → Pix → confirmation
- Admin panel: barbers/services CRUD, schedules + exceptions, appointments (walk-ins, status), clients, reports + CSV
- Notifications: outbox + in-repo cron; PT-BR emails
- Auth: email/password + Google OAuth (Auth.js v5); roles; barber invites
- Payments: Pix, webhook, status on appointments
- Per-tenant policies: auto/manual confirmation; cancellation windows
- LGPD: consent, privacy policy, PII delete/export

### Out of Scope
Mobile apps (future contract consumers); non-Pix payments; guest checkout; marketplace; external cron SaaS; multi-branch (stretch, deferred).

## Capabilities

### New Capabilities
- `tenant-management`: onboarding, isolation, settings
- `user-auth`: dual auth, roles, invites
- `catalog`: services, barbers, schedules
- `booking`: slots, conflict prevention, lifecycle
- `payments`: Pix, webhooks, status
- `notifications`: outbox, emails, reminders
- `reporting`: metrics, revenue, CSV
- `lgpd-compliance`: consent, PII lifecycle

### Modified Capabilities
None (greenfield).

## Approach

Monorepo: `apps/web` (Next.js + TS), `apps/worker` (cron: outbox + reminders), `packages/contracts` (Zod, future mobile), `packages/db` (Prisma + Postgres). Multi-tenant: `Barbershop` root aggregate, `barbershop_id` on all entities, scoped queries. Slot conflicts: Postgres exclusion constraint (btree_gist) + transactional re-validation. Idempotent webhooks. Resend + React Email via outbox. Supabase SP region (LGPD).

## Affected Areas

- New: `apps/web/*`, `apps/worker/*`, `packages/contracts/*`, `packages/db/*`
- Modified: `openspec/config.yaml` (stack context, strict_tdd, test command)

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Tenant isolation leaks | Med | barbershop_id on all queries; per-tenant tests |
| Pix provider choice | Med | Provider-agnostic module; design decision |
| LGPD enforcement | Med | Consent-first UX, SP residency, deletion flows |
| Serverless cron limits | Low | In-repo worker (decision #8) |

## Open Questions

Pix provider (Mercado Pago vs PagSeguro) — design decision; cancellation defaults — confirm per tenant.

## Rollback Plan

Feature flags per tenant; reversible migrations; disable Pix webhook → manual fallback; outbox retry prevents lost emails.

## Dependencies

Payment provider, Postgres (Supabase SP), Resend, Auth.js v5, Next.js, Prisma.

## Success Criteria

- [ ] Tenant data isolated (integration-tested)
- [ ] Concurrent double-booking impossible (DB-enforced)
- [ ] Pix paid → appointment confirmed via webhook
- [ ] PT-BR flows + emails deliverable (SPF/DKIM/DMARC)
- [ ] LGPD consent captured, exportable, deletable
