# Tasks: User Registration — Frontend Slice

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 280-380 |
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
| 1 | Register UI, helper, page, login entry point, unit + E2E tests | PR 1 | Single frontend-only slice; tests kept with code per unit |

## Phase 1: Registration Helper (Unit, TDD)

- [x] 1.1 RED: Create `apps/web/app/(auth)/register/register-form.test.ts` for `submitRegistration` (injected fetch/signIn mocks, mirrors `login-form.test.ts`): confirm mismatch → `{field:"confirmPassword"}`, consent unchecked → `{field:"consent"}`, contract-invalid → `{field:"form"}`; 409 → e-mail "e-mail já cadastrado"; 400 CONSENT_REQUIRED → consent; 400 INVALID_BODY → form alert; 201 → signIn("credentials",{redirect:false}) + destination `sanitizeNextPath(next)`; unsafe `next` → `/booking`. Verify: `pnpm test -- apps/web/app/(auth)/register/register-form.test.ts`.
- [x] 1.2 GREEN: Create `apps/web/app/(auth)/register/register-form.tsx` exporting `submitRegistration(deps, payload)` — POST `apps/web/app/api/auth/register` (existing route; do NOT import `registerClient` from `lib/register.ts` — server-only Prisma) with `RegisterInput`-shaped body `{email, password, name, phone?, consent: true, consentPolicyVersion: CURRENT_CONSENT_POLICY_VERSION}` from `apps/web/lib/consent.ts`; map errors per design table; on 201 call `signIn("credentials", {email, password, redirect: false})` then `router.replace(sanitizeNextPath(nextPath))` reusing `apps/web/lib/auth-redirect.ts`. Verify: same unit test green.
- [x] 1.3 GREEN: Add `RegisterForm` component UI — name, e-mail, optional phone, password, confirm-password, consent checkbox showing `CURRENT_CONSENT_POLICY_VERSION` + link to `/privacidade`, loading state, PT-BR copy, per-field errors.

## Phase 2: Register Page (Boundary)

- [x] 2.1 RED: Create `apps/web/app/(auth)/register/page.test.tsx` with `vi.doMock` + `renderToStaticMarkup` (mirrors `login/page.test.tsx`): guest render passes sanitized `next` to form; authenticated session → `redirect(sanitizeNextPath(next))`.
- [x] 2.2 GREEN: Create `apps/web/app/(auth)/register/page.tsx` server component — `pickFirst(searchParams.next)` → `sanitizeNextPath`, `auth()` → `redirect(nextPath)` when session exists, render `<RegisterForm nextPath=...>`. Verify: `pnpm test -- apps/web/app/(auth)/register/page.test.tsx`.

## Phase 3: Login Entry Point

- [x] 3.1 RED: Extend `apps/web/app/(auth)/login/page.test.tsx` asserting a "Criar conta" link with href `/register` renders below the form.
- [x] 3.2 GREEN: Modify `apps/web/app/(auth)/login/page.tsx` — add `<Link href="/register">Criar conta</Link>` below `<LoginForm>`. Verify: `pnpm test -- apps/web/app/(auth)/login/page.test.tsx`.

## Phase 4: E2E Verification

- [x] 4.1 RED: Create `apps/web/e2e/register.spec.ts` (mirrors `e2e/login-booking-handoff.spec.ts`): guest register → auto sign-in → sanitized redirect; duplicate e-mail → "e-mail já cadastrado" on e-mail field; password mismatch → blocked with field error; consent unchecked → blocked with checkbox error.
- [x] 4.2 GREEN: Run flows with unique e-mails via `request.post("/api/auth/register")` seed pattern; assert PT-BR messages and `/booking` fallback for unsafe `next`.
- [x] 4.3 Verify: `pnpm test -- apps/web/app/(auth)/register/register-form.test.ts apps/web/app/(auth)/register/page.test.tsx apps/web/app/(auth)/login/page.test.tsx && pnpm test:e2e -- register.spec.ts`.