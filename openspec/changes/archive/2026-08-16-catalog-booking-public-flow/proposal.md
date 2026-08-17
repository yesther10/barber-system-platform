# Proposal: Public Catalog Booking Flow

## Intent

The booking page is a placeholder ("O fluxo de agendamento chega na fase de catálogo"). Backend is complete in main (public services, slots, `POST /api/bookings`, `POST /api/payments/[id]/pix`, webhook) but clients cannot book end-to-end through the UI. This change ships the public flow: services → barber → slot → confirm → login gate → create booking → Pix QR → live payment status.

## Scope

### In Scope
- New `GET /api/public/barbershops/[slug]/barbers?serviceId=` — active barbers assigned to the service via `BarberService`
- New session-gated `GET /api/payments/[id]` — current payment + appointment status
- Multi-step booking UI in `apps/web/app/(public)/booking/` (services → barber → date/slot → confirm → login gate → booking → Pix QR → status polling)
- `America/Sao_Paulo` constant + slot formatting helper (`lib/tz.ts`) — NO tenant metadata endpoint
- QR image rendered from the EMV `qrCode` string (`qrcode` dep, `lib/qr.ts`)
- PT-BR copy in `lib/i18n.ts`; unit + E2E tests

### Out of Scope
- Admin UI; reschedule/cancel UI (APIs exist, UI deferred); slot computation changes; tenant metadata endpoint; email notification UI; multi-locale i18n

## Capabilities

> Contract for sdd-spec. Research done against `openspec/specs/`.

### New Capabilities
None

### Modified Capabilities
- `catalog`: public barber browse by service — tenant resolved by slug, only active barbers with a `BarberService` assignment for the requested service are returned
- `booking`: public booking flow UI — step-wise client flow reusing the Booking-to-Login Handoff requirement; slot times rendered in BR timezone
- `payments`: payment status read — session-gated GET returning payment/appointment status for the Pix confirmation screen; QR image rendering from the EMV payload

## Approach

Mirror the services/slots public route pattern: thin route + service fn. Barbers: resolve tenant by slug, join `barberService` on `serviceId`, filter `active`. Status: resolve appointment by `providerPaymentId` (fallback: appointmentId), scope via `guardBookingSession`. UI: server page + client step components (mirrors register slice); `lib/tz.ts` formats UTC ISO slots in BR tz; `lib/qr.ts` renders EMV to image; poll status with backoff until `paid` → "Pagamento recebido".

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `packages/contracts/src/catalog.ts` | Modified | +`PublicBarberQuery`, `PublicBarberView` |
| `packages/contracts/src/payments.ts` | Modified | +`PaymentStatusView` |
| `apps/web/lib/catalog.ts` | Modified | +`getPublicBarbersByService` |
| `apps/web/app/api/public/barbershops/[slug]/barbers/route.ts` | New | Public barbers GET |
| `apps/web/app/api/payments/[id]/route.ts` | New | Session-gated status GET |
| `apps/web/app/(public)/booking/` | Modified | Placeholder → multi-step flow |
| `apps/web/lib/tz.ts`, `lib/qr.ts` | New | BR tz + QR helpers |
| `apps/web/lib/i18n.ts` | Modified | Booking copy dictionary |
| `apps/web/package.json` | Modified | +`qrcode` |
| `apps/web/e2e/booking-public-flow.spec.ts` | New | Full-flow E2E |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Payment id resolution (fake provider returns id ≠ providerId) | Med | Status route matches `providerPaymentId` OR `appointmentId`; align fake provider |
| Slot tz rendering errors | Low | Single `lib/tz.ts` + unit tests (Intl) |
| Webhook latency → stale status on screen | Med | Poll with backoff; clear pending state |
| QR lib bundle weight | Low | `qrcode` (small, maintained), client-side render |
| E2E flakiness (QR render) | Med | Assert image presence, not decode |

## Rollback Plan

Additive endpoints: revert backend PR independently (new routes/contracts only, no schema changes). UI: revert per-PR — placeholder page restored. `qrcode` dep removable. No migrations or feature flags.

## Dependencies

- Existing endpoints in main: services, slots, bookings, Pix, webhook; E2E fixture (`/tmp/opencode/barber-system-platform-e2e.json`)
- New dep: `qrcode`

## Success Criteria

- [ ] Guest browses services → assigned barbers → BR-tz slots → confirm → login gate → booking created
- [ ] Pix QR image renders; status flips to "Pagamento recebido" after webhook confirmation
- [ ] Contract zod tests + unit tests + E2E suite pass

## Size Forecast

Backend ~300–450 (contracts + routes + lib + unit tests); UI ~400–600; E2E ~150–250 → total ~900–1,300 changed lines. Exceeds the 400-line review budget → 4 chained PRs mirroring the register-UI chain: (1) backend endpoints, (2) catalog browse UI, (3) booking + Pix + status UI, (4) E2E.

`Decision needed before apply: Yes` — `Chained PRs recommended: Yes` — `400-line budget risk: High`