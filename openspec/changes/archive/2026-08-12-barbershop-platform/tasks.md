# Tasks: Barbershop Platform — Login Frontend Slice

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 220-340 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | single PR |
| Delivery strategy | ask-always |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Deliver login UI, redirect guard, booking handoff, and slice tests | PR 1 | Single slice; keep unit, page, and e2e coverage together |

## Phase 1: Foundation

- [x] 1.1 RED: Create `apps/web/lib/auth-redirect.test.ts` for safe internal `next` paths, external URL rejection, and `/booking` fallback.
- [x] 1.2 GREEN: Create `apps/web/lib/auth-redirect.ts` with `sanitizeNextPath()` shared by login and booking pages.
- [x] 1.3 REFACTOR: Update `apps/web/app/(auth)/login/page.tsx` to sanitize `searchParams.next`, call `auth()`, and redirect authenticated users before render.

## Phase 2: Login UI

- [x] 2.1 RED: Create `apps/web/app/(auth)/login/page.test.tsx` for guest render, authenticated redirect, and Google action hidden when provider is absent.
- [x] 2.2 GREEN: Create `apps/web/app/(auth)/login/login-form.tsx` as a client form with required-field validation, `signIn("credentials", { redirect:false })`, loading state, and inline auth error.
- [x] 2.3 REFACTOR: Finish `apps/web/app/(auth)/login/page.tsx` to pass safe `next` and `googleEnabled` into `login-form.tsx`.

## Phase 3: Booking Handoff

- [x] 3.1 RED: Add a page assertion proving `apps/web/app/(public)/booking/page.tsx` links guests to `/login?next=<internal-booking-path>` only.
- [x] 3.2 GREEN: Update `apps/web/app/(public)/booking/page.tsx` with the protected booking CTA using `sanitizeNextPath()` and the safe login handoff.

## Phase 4: Verification

- [x] 4.1 RED: Create `apps/web/tests/e2e/login-booking-handoff.spec.ts` for booking→login→return, invalid credentials, and unsafe `next` fallback.
- [x] 4.2 GREEN: Implement the minimal Playwright flow using seeded credentials and the booking CTA entry point.
- [x] 4.3 Verify `pnpm test -- apps/web/lib/auth-redirect.test.ts apps/web/app/(auth)/login/page.test.tsx` and `pnpm test:e2e -- login-booking-handoff.spec.ts`.
