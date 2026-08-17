# Tasks: Public Catalog Booking Flow

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 900-1,300 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → PR 2 → PR 3 → PR 4 |
| Delivery strategy | ask-always |
| Chain strategy | pending (stacked-to-main default; confirm) |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Barbers + status endpoints, contracts, integration tests | PR 1 | ~350; tests with code |
| 2 | `lib/tz.ts`, booking-api, services→barber→slot steps, i18n, unit tests | PR 2 | Depends PR 1; ~450 |
| 3 | Confirm, login gate, create, Pix QR, poller, waiting, unit tests | PR 3 | Depends PR 2; ~400 |
| 4 | E2E: full journey + handoff + error copy | PR 4 | Depends PR 3; ~200 |

## Phase 1: PR 1 — Backend Endpoints (TDD)

Run: `pnpm test:integration`.

- [x] 1.1 RED: Extend `tests/integration/catalog.test.ts` — `getPublicBarbersByService` returns only active service-assigned barbers as `PublicBarberView` (id, specialties, bio?, active, no userId); unknown slug `TENANT_NOT_FOUND`; inactive/unknown service `SERVICE_NOT_FOUND`; missing serviceId `INVALID_INPUT`.
- [x] 1.2 RED: Create `tests/integration/payments-status.test.ts` — `provider_*`, `pix_*` (stripped), raw id resolve; foreign/unknown `PAYMENT_APPOINTMENT_NOT_FOUND`; no session 401 `SESSION_REQUIRED`.
- [x] 1.3 GREEN: `PublicBarberQuery`+`PublicBarberView` in `packages/contracts/src/catalog.ts`; `PaymentStatusView` in `packages/contracts/src/payments.ts`. Run: `pnpm typecheck`.
- [x] 1.4 GREEN: `getPublicBarbersByService(db, slug, serviceId)` in `apps/web/lib/catalog.ts` — `findMany({ where: { barbershopId, active: true, services: { some: { serviceId } } } })` + `toPublicBarberView`. Verify: 1.1.
- [x] 1.5 GREEN: `getPaymentStatusView(db, clientId, id)` in `apps/web/lib/payments.ts` — owner-scoped OR-match (`providerPaymentId`/`id`/`pix_`-stripped). Verify: 1.2.
- [x] 1.6 GREEN: `apps/web/app/api/public/barbershops/[slug]/barbers/route.ts` — parse `serviceId` → 400; 404 mapping; `force-dynamic` (mirrors `slots/route.ts`). Verify: 1.1.
- [x] 1.7 GREEN: `apps/web/app/api/payments/[id]/route.ts` — `guardBookingSession` → 401; status GET; 404 (mirrors `pix/route.ts`). Verify: 1.2.

## Phase 2: PR 2 — Catalog Browse UI (TDD)

Run: `pnpm test -- <touched test>`; phase `pnpm typecheck`.

- [x] 2.1 RED: `apps/web/lib/tz.test.ts` — `formatSlotLocal("2026-08-20T12:00:00.000Z")` → "09:00" (UTC-3); `todayInTz()`.
- [x] 2.2 GREEN: `apps/web/lib/tz.ts` (client-safe, no `@barber/db`) — `BR_TIMEZONE`, `formatSlotLocal`, `todayInTz()` (Intl cache). Verify: 2.1.
- [x] 2.3 RED: `apps/web/lib/booking-state.test.ts` — reducer step order; query codec round-trips `slug/serviceId/barberId/date/slot`.
- [x] 2.4 GREEN: `apps/web/lib/booking-state.ts` — `BookingSelection`/`BookingStep`, `bookingReducer`, search-param codec (refresh-safe, feeds login `next`). Verify: 2.3.
- [x] 2.5 RED: `apps/web/lib/booking-api.test.ts` — DI fetch helpers map 404/400 to step failures.
- [x] 2.6 GREEN: `apps/web/lib/booking-api.ts` — `fetchPublicServices/Barbers/Slots(deps, …)`, injected `fetchFn`. Verify: 2.5.
- [x] 2.7 GREEN: `apps/web/app/(public)/booking/booking-flow.tsx` (client) — services→barbers→date/slot; BR-tz grid; past dates blocked; PT-BR empty states; URL params drive state. Verify: 2.8.
- [x] 2.8 GREEN: `booking-flow.test.tsx` — step progression + empty states (DI mocks, mirrors `register-form.test.ts`).
- [x] 2.9 GREEN: `apps/web/app/(public)/booking/page.tsx` — reads searchParams, renders `<BookingFlow/>`; extend `page.test.tsx`.
- [x] 2.10 GREEN: `booking` PT-BR dictionary in `apps/web/lib/i18n.ts`. Verify: `pnpm typecheck`.

### Post-verify fix batch (2026-08-14, PR 2b — verify-report C-1/C-2)

- [x] F1 C-1 fix: `booking-flow.tsx` stores slots/error with their date and renders only on date match (`slotsFetchParams`/`slotsForRender`/`slotsErrorForRender` pure helpers) — stale grid can never be clicked into the new date's selection; past-date no-request guard unit-tested.
- [x] F2 C-2 tests: `booking-flow.container.test.tsx` (happy-dom + @testing-library/react, injected `fetchFn` deps) — loading→data, loading→error (404/network), past-date/no-date no-fetch, stale grid cleared on date change. New root devDeps: happy-dom, @testing-library/react, @testing-library/dom.
- [x] F3 Verify: `pnpm test` 244/244, `pnpm typecheck` 9/9, `pnpm lint` 0 errors; coverage `booking-flow.tsx` 40% → 63.6% lines (branch 43.8% → 74.3%).

## Phase 3: PR 3 — Booking + Pix + Status (TDD)

Run: `pnpm test -- <touched test>`; phase `pnpm typecheck`.

- [x] 3.1 RED: Extend `apps/web/lib/booking-api.test.ts` — `SLOT_CONFLICT` (409) → slot step, `PAST_DATE`/`SERVICE_INACTIVE`/`BARBER_INACTIVE` → PT-BR; `createPixPayment`/`fetchPaymentStatus` shapes.
- [x] 3.2 GREEN: Add `createBooking`/`createPixPayment`/`fetchPaymentStatus` to `apps/web/lib/booking-api.ts` (error map per design). Verify: 3.1.
- [x] 3.3 RED: `apps/web/lib/payment-poll.test.ts` — 10 attempts, 2s base, ×1.5 backoff; `paid`/`expired` terminal; timeout stops.
- [x] 3.4 GREEN: `apps/web/lib/payment-poll.ts` — pure `createStatusPoller`. Verify: 3.3.
- [x] 3.5 RED: `apps/web/lib/qr.test.ts` — `qrDataUrl(emv, deps)` calls injected `toDataURL`; null emv → null.
- [x] 3.6 GREEN: `apps/web/lib/qr.ts`; add `qrcode` + `@types/qrcode` (dev) to `apps/web/package.json`. Verify: 3.5.
- [x] 3.7 GREEN: Extend `booking-flow.tsx` — confirm; login gate `/login?next=<sanitized /booking query>` (`sanitizeNextPath`); `router.replace` returns to same step; POST booking → POST pix → waiting screen (QR `img[src^="data:image/png"]` + clipboard fallback); poll → "Pagamento recebido". Verify: 2.8.
- [x] 3.8 GREEN: PT-BR confirm/gate/pix/waiting/error copy in `apps/web/lib/i18n.ts`. Verify: `pnpm typecheck`.

### Post-verify fix batch (PR 3 — verify-report B-1)

- [x] B-1 fix: `booking-flow.tsx` stores barbers/error with their `serviceId` and renders only on service match (`barbersForRender`/`barbersErrorForRender` pure helpers) — previous service's barbers can never render for the current service; typecheck regression in the barbers effect closure fixed during PR 3 apply (serviceId narrowing lost inside `.then`).

## Phase 4: PR 4 — E2E (TDD)

Run: `pnpm test:e2e -- booking-public-flow.spec.ts`.

- [x] 4.1 RED: `apps/web/e2e/booking-public-flow.spec.ts` (fixture `start-server.ts` + `/tmp/opencode/barber-system-platform-e2e.json`) — browse → BR-tz slot → confirm → gate preserves selection → sign-in → booking → Pix QR visible → webhook paid flip → "Pagamento recebido"; conflict → slot step PT-BR copy. Verified 2026-08-16: spec delivered (193 lines, 2 journeys); RED by mechanism + empirically observed (pix route 500 wedged dev server pre-fix `9e407d6`).
- [x] 4.2 GREEN: Run journey; assert QR by presence, not decode; if paid-flip via `POST /api/webhooks/mercadopago` flaky, prove paid state in integration only (design open question). Verified 2026-08-16: targeted E2E 2/2 green (12.7s + 1.9s); full suite 15/2 (2 failures pre-existing W-1, proven independent via isolation run); paid-flip via admin mark-paid in separate context — webhook→paid proven at integration (`payments-worker.test.ts:163,194`), open question resolved; unit 294/294, typecheck 9/9, lint 0 errors. Run: `pnpm exec playwright test -c apps/web/playwright.config.ts apps/web/e2e/booking-public-flow.spec.ts` (pnpm `--` filter broken).