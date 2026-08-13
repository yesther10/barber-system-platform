# Proposal: Barbershop Platform — frontend login slice

## Intent

Unblock the first reviewable booking-to-auth UX. Backend auth already exists, but `/login` and `/booking` are placeholders, so protected booking currently has no usable path for clients.

## Scope

### In Scope
- Build `/login` as a functional client entry for email/password sign-in.
- Show Google sign-in only when its env config is present; otherwise hide it cleanly.
- From booking-required actions, send users to `/login?next=<protected-target>` and return them after success.
- Define the minimal `/booking` placeholder behavior needed to trigger login when auth is required.
- Add loading, inline error, and authenticated-user redirect UX for `/login`.

### Out of Scope
- Registration, forgot-password, reset-password, invite acceptance, and tenant onboarding UX.
- Completing the booking form, Pix, confirmation screens, or admin auth UX.
- Assuming Google OAuth is enabled in local/prod environments.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `user-auth`: add frontend login page behavior, provider visibility rules, and post-login redirect handling.
- `booking`: define how protected booking actions route unauthenticated users into login.

## Approach

Implement a small App Router slice in `apps/web` only. Reuse existing auth endpoints/session behavior, keep `/login` server-safe, and gate Google UI from runtime/env availability instead of assuming provider setup. `/booking` should stay narrow: a CTA or protected action that proves the auth handoff works.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/web/app/(auth)/login/*` | Modified | Real login page and redirect UX |
| `apps/web/app/(public)/booking/*` | Modified | Auth-required entry point to login |
| `openspec/changes/barbershop-platform/specs/user-auth/spec.md` | Modified | Frontend login requirements |
| `openspec/changes/barbershop-platform/specs/booking/spec.md` | Modified | Booking-to-login handoff |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Redirect loops or bad `next` values | Med | Restrict to internal paths; test authenticated/guest flows |
| Google button shown without provider | Low | Render from env/provider availability check |

## Rollback Plan

Revert `/login` and `/booking` UI changes, remove redirect wiring, and fall back to the current placeholder pages without touching backend auth.

## Dependencies

- Existing Auth.js backend/session wiring
- Existing protected booking endpoint behavior (401)

## Success Criteria

- [ ] Guests can reach `/login` from a booking-required action and return to the intended page after sign-in.
- [ ] `/login` supports email/password, handles failure states, and hides Google when unavailable.
