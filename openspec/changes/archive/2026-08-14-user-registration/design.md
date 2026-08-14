# Design: User Registration — Frontend Slice

## Technical Approach

Expose the existing consent-gated `POST /api/auth/register` (already in main) through a thin register UI in `apps/web`, mirroring the login slice. Server `page.tsx` sanitizes `next` and redirects authenticated users away; client `register-form.tsx` validates locally (confirm-password, consent, `RegisterInput` contract), POSTs to the existing route, auto signs in via Auth.js credentials, and replaces the route with the sanitized target. No backend, contract, or schema changes.

## Architecture Decisions

| Decision | Options | Choice | Rationale |
|---|---|---|---|
| Submit path | Import `registerClient()` directly vs POST existing route | `POST /api/auth/register` | `registerClient` is server-only (Prisma store) — not client-callable. The route already maps errors to codes; reuse it as-is. |
| Contract validation | Duplicate zod rules vs reuse `RegisterInput` | `RegisterInput.safeParse` from `@barber/contracts` | Single source of truth; field-level messages mirror server codes; no drift. |
| Redirect safety | Trust page-passed `next` vs re-sanitize | Page sanitizes once; helper re-applies `sanitizeNextPath` before `router.replace` | Reuses `lib/auth-redirect.ts` — no duplicated logic; defense-in-depth for the post-register hop. |
| Consent version | Hardcode vs import | `CURRENT_CONSENT_POLICY_VERSION` from `lib/consent.ts` | Single source, shown on checkbox and sent in payload. |
| Entry point | Link inside `LoginForm` vs page | Next `<Link>` in login `page.tsx` below the form | Server component, matches proposal's file change. |

## Data Flow

```text
GET /register?next=...
  ├─ auth() has session? yes → redirect(sanitizeNextPath(next))
  └─ no → render RegisterForm(nextPath)

RegisterForm submit (client)
  ├─ local checks: confirm===password, consent checked, RegisterInput.safeParse
  ├─ POST /api/auth/register {email, password, name, phone?, consent:true,
  │     consentPolicyVersion: CURRENT_CONSENT_POLICY_VERSION}
  │   ├─ 201 → signIn("credentials", { email, password, redirect: false })
  │   │     ├─ ok  → router.replace(sanitizeNextPath(nextPath))
  │   │     └─ err → stay on /register, form alert
  │   ├─ 409 → "e-mail já cadastrado" on e-mail field
  │   └─ 400 → consent / field / generic messages (table below)
```

## Error Mapping

| HTTP | Body `error` | PT-BR message | Target |
|---|---|---|---|
| 409 | `EMAIL_TAKEN` | "e-mail já cadastrado" | e-mail field |
| 400 | `CONSENT_REQUIRED` | "É preciso aceitar a política de privacidade para continuar." | consent checkbox |
| 400 | `INVALID_INPUT` | generic "Verifique os dados informados." (unreachable via UI — client validates the same contract first) | form alert |
| 400 | `INVALID_BODY` | generic form alert | form alert |
| — | signIn error | "Não foi possível entrar automaticamente. Entre pela tela de login." | form alert |

Field-level messages for mismatch/consent/contract failures are produced client-side by the pre-submit checks, satisfying the spec's field-level requirement without backend changes.

## File Changes

| File | Action | Description |
|---|---|---|
| `apps/web/app/(auth)/register/page.tsx` | Create | Server page: sanitize `next`, `auth()` redirect, render form |
| `apps/web/app/(auth)/register/register-form.tsx` | Create | Client form + exported `submitRegistration` helper |
| `apps/web/app/(auth)/login/page.tsx` | Modify | "Criar conta" link → `/register` below the form |
| `apps/web/app/(auth)/register/register-form.test.ts` | Create | Unit tests for helper |
| `apps/web/app/(auth)/register/page.test.tsx` | Create | Page boundary tests |
| `apps/web/e2e/register.spec.ts` | Create | Playwright E2E |

## Interfaces / Contracts

```ts
export interface RegistrationPayload {
  name: string; email: string; phone?: string;
  password: string; confirmPassword: string;
  consent: boolean; nextPath: string;
}
export type RegistrationResult =
  | { ok: true; destination: string }
  | { ok: false; field: "email" | "consent" | "confirmPassword" | "form"; message: string };

export async function submitRegistration(
  deps: { fetchFn: typeof fetch; signInFn: typeof signIn },
  payload: RegistrationPayload,
): Promise<RegistrationResult>;
```

Dependency injection mirrors `submitCredentials(signInFn, payload)` for unit-testability. Payload sent to the API is `RegisterInput`-shaped: `{ email, password, name, phone?, consent: true, consentPolicyVersion: CURRENT_CONSENT_POLICY_VERSION }`.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | `submitRegistration`: mismatch/consent/contract blocks, 409/400 mapping, signIn+redirect, unsafe `next` fallback | Vitest with injected fetch/signIn mocks (mirrors `login-form.test.ts`) |
| Integration | Authed redirect, guest render, sanitized `next` prop | `page.test.tsx` with `vi.doMock` + `renderToStaticMarkup` (mirrors `login/page.test.tsx`) |
| E2E | register → auto sign-in → sanitized redirect; duplicate e-mail; mismatch; consent unchecked | Playwright `e2e/register.spec.ts` |

## Migration / Rollout

No migration required. Frontend-only slice, single PR (~250–350 lines, under 400-line budget). Revert the commit to roll back.

## Explicitly NOT Designed (Deferred)

- Email verification, password reset, rate limiting, e-mail normalization
- Barber self-signup (invite-only), tenant assignment
- Google OAuth on register
- Server-side per-field error detail payload (API returns codes only; client maps)
- Privacy-policy content (`/privacidade` route exists — link only)

## Open Questions

- [ ] Copy convention: login uses voseo ("Informá") vs PT-BR spec ("Informe") — keep this slice internally consistent; flag cleanup for follow-up.