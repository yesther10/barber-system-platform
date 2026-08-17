# Design: Barbershop Platform — Login Frontend Slice

## Technical Approach

Implement the login slice only in `apps/web`, keeping Auth.js as the backend authority and adding a thin App Router UI around it. The page at `app/(auth)/login/page.tsx` becomes a server entry that redirects authenticated users away, computes a sanitized `next` target, and renders a small client form component for credentials plus an optional Google action when `authConfig.providers` includes Google. This satisfies the `user-auth` redirect/feedback requirements and the `booking` login handoff without expanding booking itself.

## Architecture Decisions

| Decision | Options | Choice | Rationale |
|---|---|---|---|
| Submit login | Server action vs client submit to Auth.js | Client component calling `signIn("credentials", { redirect: false })` | Matches Auth.js v5 client flow, keeps inline loading/error state simple, and avoids inventing a custom auth endpoint. |
| Redirect safety | Trust raw `next` vs sanitize internal paths | Shared `sanitizeNextPath()` helper with safe default | Both `/login` and booking handoff need the same rule; centralizing prevents open redirects and drift. |
| Authenticated `/login` behavior | Show page with message vs server redirect | Server redirect before render | Existing app already uses server auth helpers; redirecting in the page avoids guest-only UI flicker. |

## Data Flow

```text
Guest hits /booking
  └─ protected CTA builds internal target via sanitizeNextPath()
      └─ Link to /login?next=/booking?... 

GET /login
  ├─ auth() finds session? yes → redirect(safeNext or /booking)
  └─ no session → render LoginForm(initialNext, googleEnabled)

LoginForm submit
  ├─ validate required fields in UI
  ├─ signIn("credentials", redirect:false)
  ├─ error → show inline message, keep form values
  └─ success → router.replace(safeNext)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/web/app/(auth)/login/page.tsx` | Modify | Replace placeholder with server page that sanitizes `next`, checks session, and renders the login UI. |
| `apps/web/app/(auth)/login/login-form.tsx` | Create | Client component for credentials submit, loading state, inline error, and optional Google action. |
| `apps/web/app/(public)/booking/page.tsx` | Modify | Replace placeholder-only content with a minimal protected booking CTA that demonstrates the login handoff. |
| `apps/web/lib/auth-redirect.ts` | Create | Shared helper for `next` sanitization and safe default resolution for login/booking flows. |
| `apps/web/lib/auth-redirect.test.ts` | Create | Unit tests for internal-path allowlist and malformed/external target rejection. |
| `apps/web/app/(auth)/login/page.test.tsx` | Create | Verify authenticated redirect and guest render behavior at the page boundary. |
| `apps/web/tests/e2e/login-booking-handoff.spec.ts` | Create | Cover booking → login → return, invalid credentials, and unsafe `next` fallback. |

## Interfaces / Contracts

```ts
export interface LoginPageState {
  nextPath: string;
  googleEnabled: boolean;
}

export function sanitizeNextPath(input: string | null | undefined): string;
```

`sanitizeNextPath()` returns only app-internal paths that start with `/`, rejects `//`, absolute URLs, and non-booking/auth malformed values, and falls back to `/booking`.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `sanitizeNextPath()` and login error mapping | Vitest for safe/unsafe redirect cases and known Auth.js error results. |
| Integration | `/login` redirects authenticated users and renders guests correctly | React/Next page test with mocked `auth()` and search params. |
| E2E | booking/login handoff, credentials success/failure, unsafe `next` fallback | Playwright using seeded user credentials and `/booking` CTA flow. |

## Migration / Rollout

No migration required. Roll out as a frontend-only slice in `apps/web`; backend auth and booking API contracts remain unchanged.

## Open Questions

- [ ] None.
