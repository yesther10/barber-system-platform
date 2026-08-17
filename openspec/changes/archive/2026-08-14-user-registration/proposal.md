# Proposal: User Registration

## Intent

Clients cannot create an account through the UI: there is no register page, no "Criar conta" link, and no post-register sign-in. The backend (`POST /api/auth/register`, `lib/register.ts`) is already merged in main — this change exposes it to users. Barbers remain invite-only.

## Scope

### In Scope
- Register page `apps/web/app/(auth)/register/page.tsx` (server component, mirrors login slice)
- Client form `register-form.tsx` + exported `submitRegistration` helper (unit-testable, mirrors `login-form.tsx`)
- "Confirm password" field — client-side validation only, NO contract change
- LGPD consent checkbox (required) showing `CURRENT_CONSENT_POLICY_VERSION` + link to `/privacidade`
- "Criar conta" link on the login page
- Auto sign-in post-register via `signIn("credentials", { redirect: false })` + `router.replace(sanitizeNextPath(next))`
- PT-BR copy; error mapping (409 → "e-mail já cadastrado", 400 consent/invalid → field-level messages)
- Unit tests (`register-form.test.ts`, `page.test.tsx`) + E2E

### Out of Scope
- Email verification, rate limiting, email normalization
- Barber self-signup (stays invite-only), tenant assignment
- Any schema/contract/API changes (frontend-only slice)
- Google OAuth on register

## Capabilities

> Contract for sdd-spec. Research done against `openspec/specs/`.

### New Capabilities
None

### Modified Capabilities
- `user-auth`: adds public registration UI requirement — signup form with consent capture and confirm-password, post-register auto sign-in with sanitized redirect, "Criar conta" entry point on `/login`.

## Approach

Mirror the login slice: server `page.tsx` sanitizes `next` and redirects authenticated users; client `register-form.tsx` validates (confirm-password, consent, zod contract via `RegisterInput`), calls `registerClient()` from `lib/register.ts`, then auto signs in and `router.replace(sanitizeNextPath(next))` reusing `lib/auth-redirect.ts`. Error mapping: 409 → duplicate e-mail; 400 consent → checkbox message; 400 invalid → field messages.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/web/app/(auth)/register/page.tsx` | New | Server page, sanitizes `next` |
| `apps/web/app/(auth)/register/register-form.tsx` | New | Client form + `submitRegistration` helper |
| `apps/web/app/(auth)/login/page.tsx` | Modified | "Criar conta" link |
| `apps/web/app/(auth)/register/` tests | New | Vitest unit tests |
| `apps/web/e2e/register.spec.ts` | New | Playwright E2E |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Open register endpoint (no rate limit) | High | Accepted, deferred; not introduced by this slice |
| MySQL case-insensitive e-mail uniqueness | Med | Accepted, deferred to backend follow-up |
| Copy inconsistency: login uses voseo ("Informá"), PT-BR convention ("Informe") | Med | Flag for follow-up cleanup; keep this slice consistent internally |

## Rollback Plan

Single PR, frontend-only. Revert the commit — no schema/migration/API changes, no feature flag required. Users lose the register entry point only.

## Dependencies

- `POST /api/auth/register` + `lib/register.ts` already in main
- Auth.js v5 credentials provider; `sanitizeNextPath` existing

## Success Criteria

- [ ] Guest registers via UI with valid data → auto-signed-in, redirected to sanitized `next`
- [ ] Duplicate e-mail, consent-unchecked, and password mismatch each show clear PT-BR errors
- [ ] "Criar conta" link visible on `/login`; unit + E2E suites pass

## Size Forecast

~250–350 changed lines — single PR, under 400-line review budget. `400-line budget risk: Low`.