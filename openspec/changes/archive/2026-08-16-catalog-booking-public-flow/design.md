# Design: Public Catalog Booking Flow

## Technical Approach

Additive-only: two new GET endpoints (PR 1) mirroring the services/slots route pattern (thin route + service fn + contract), then a multi-step booking UI (PRs 2-3) mirroring the register slice (server page + client step component + pure DI helpers), BR-tz slot rendering, client-side Pix QR + status poller. No changes to booking/slots/webhook logic.

## Architecture Decisions

| Decision | Options | Choice | Rationale |
|---|---|---|---|
| Barber identity | `PublicBarberView` with vs without `userId` | Without (id, specialties, bio?, active) | `userId` is internal; UI needs only `barberId`. Spec lists exactly these 4 fields. |
| Barbers query | raw `barberService` join vs relation filter | `findMany({ where: { services: { some: { serviceId } } } })` | Mirrors `getPublicServices` scoping; tenant+active+assignment in one query. |
| Payment id resolution | prefix-parsing vs OR-match | `findFirst({ OR: [{providerPaymentId}, {id}, {id: pixForm}] })` scoped to `clientId` | Covers provider_*/pix_*/raw forms in one ownership-scoped query; no prefix assumption. |
| Status payload | full `AppointmentView` vs minimal | `PaymentStatusView { appointmentId, paymentStatus, appointmentStatus }` | Polling needs statuses only; no new sensitive surface. |
| Slot formatting | reuse `lib/slots.ts` vs new `lib/tz.ts` | New client-safe `lib/tz.ts` | `slots.ts` imports `@barber/db` — unsafe in client bundle. Pure Intl, formatter-cache pattern. |
| QR library | `qrcode` vs `qrcode.react` vs server data URL | `qrcode` + `@types/qrcode`, client `toDataURL` | Smallest maintained lib; EMV arrives client-side after POST pix → server render impossible. |
| URL state | React-only vs URL search params | `slug/serviceId/barberId/date/slot` in query | `sanitizeNextPath` keeps `pathname+search` → login handoff preserves selection for free; refresh-safe. |
| Poller | inline `useEffect` vs pure controller | `createStatusPoller` in `lib/payment-poll.ts` | Unit-testable backoff/terminals without React. |

## Data Flow

```text
/booking?slug=… (server page → BookingFlow)
  services ─▶ barbers ─▶ date/slot ─▶ confirm ─▶ login gate
      │           │          │          │
      └─ GET /api/public/barbershops/{slug}/services|barbers|slots
  gate → /login?next=<full /booking query> → LoginForm router.replace(sanitized) → same URL
  create POST /api/bookings → pix POST /api/payments/{id}/pix
  poll GET /api/payments/{providerPaymentId ?? id}: paid | expired | timeout → retry
```

## File Changes

| File | Action | Description |
|---|---|---|
| `packages/contracts/src/catalog.ts` | Modify | +`PublicBarberQuery`, `PublicBarberView` |
| `packages/contracts/src/payments.ts` | Modify | +`PaymentStatusView` |
| `apps/web/lib/catalog.ts` | Modify | +`getPublicBarbersByService` |
| `apps/web/lib/payments.ts` | Modify | +`getPaymentStatusView` (OR-resolve, owner-scoped) |
| `apps/web/app/api/public/barbershops/[slug]/barbers/route.ts` | Create | Thin GET: parse→400; 404 codes |
| `apps/web/app/api/payments/[id]/route.ts` | Create | `guardBookingSession`→401; GET status; 404 |
| `apps/web/lib/tz.ts` | Create | `BR_TIMEZONE`, `formatSlotLocal(iso)`, `todayInTz()` |
| `apps/web/lib/booking-state.ts` | Create | Pure `BookingSelection`/`BookingStep`, `bookingReducer`, query codec |
| `apps/web/lib/booking-api.ts` | Create | DI fetch helpers: services/barbers/slots/createBooking/createPixPayment/fetchPaymentStatus |
| `apps/web/lib/qr.ts` | Create | `qrDataUrl(emv, deps)` (injected `toDataURL`) |
| `apps/web/lib/payment-poll.ts` | Create | `createStatusPoller({ maxAttempts: 10, baseDelayMs: 2000, backoff: ×1.5 })` |
| `apps/web/app/(public)/booking/page.tsx` | Modify | Server: read searchParams, render `<BookingFlow/>` |
| `apps/web/app/(public)/booking/booking-flow.tsx` | Create | Client step machine + login gate + Pix step (QR img + copy fallback) |
| `apps/web/lib/i18n.ts` | Modify | `booking` PT-BR dictionary |
| `apps/web/package.json` | Modify | +`qrcode`, +`@types/qrcode` (dev) |
| `tests/integration/catalog.test.ts` | Modify | Barbers scenarios (assigned-only, 404s, 400) |
| `tests/integration/payments-status.test.ts` | Create | 3 id forms, foreign/unknown 404, unauthenticated 401 |
| `apps/web/e2e/booking-public-flow.spec.ts` | Create | Full journey; QR by `img[src^="data:image/png"]` presence |

## Interfaces / Contracts

```ts
// catalog.ts
export const PublicBarberQuery = z.object({
  barbershopSlug: z.string().min(1), serviceId: z.string().min(1),
});
export const PublicBarberView = z.object({
  id: z.string().min(1),
  specialties: z.array(z.string().min(1)),
  bio: z.string().min(1).optional(),
  active: z.boolean(),
});
// payments.ts
export const PaymentStatusView = z.object({
  appointmentId: z.string().min(1),
  paymentStatus: PaymentStatus,        // pending|paid|expired|refunded
  appointmentStatus: AppointmentStatus,
});
```

Status resolution: `findFirst({ where: { clientId, OR: [{ providerPaymentId: id }, { id }, ...(id.startsWith("pix_") ? [{ id: id.slice(4) }] : [])] } })`.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | `formatSlotLocal` (UTC-3 fixture), `bookingReducer` (order, SLOT_CONFLICT→slot), `booking-api` mapping (SLOT_CONFLICT/PAST_DATE/SERVICE_INACTIVE/BARBER_INACTIVE), `qrDataUrl`, poller terminals | Vitest DI mocks (mirrors `register-form.test.ts`) |
| Integration | Barbers: assigned-only/active, 404s, 400; Status: provider_/pix_/raw, foreign 404, no-session 401 | Testcontainers MySQL (mirrors `tests/integration/booking.test.ts`) |
| E2E | Guest browse → gate → sign-in → return → create → QR image (no decode) → webhook flip → "Pagamento recebido" | Playwright `start-server.ts` fixture |

## Migration / Rollout

No migration. 4-PR feature-branch chain (PR N targets PR N−1): **PR1 backend** (~350) → **PR2 catalog browse UI** (~450: tz, state, services/barbers/slots steps) → **PR3 booking+Pix+status** (~400: create/pix/status, qr, poller, gate) → **PR4 E2E** (~200). Each independently revertible; `qrcode` removable.

## Open Questions

- [ ] E2E paid-flip via POST `/api/webhooks/mercadopago` (fake provider verifies) — if flaky, move paid-state proof to integration only.
- [ ] `active` on `PublicBarberView` is always `true` (query filters) — kept for spec symmetry; confirm no objection.