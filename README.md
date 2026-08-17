# Sistema Barberia

Monorepo for a multi-tenant barbershop scheduling & management platform
(booking, Pix payments, admin panel, reporting, LGPD).

## Stack

- pnpm workspace + Turborepo
- `apps/web` — Next.js (App Router) monolith with PT-BR UI copy
- `apps/worker` — in-repo cron processor (outbox, reminders, reconciliation)
- `packages/contracts` — shared Zod contracts (future native apps)
- `packages/db` — Prisma schema, migrations, seed
- `packages/payments` — provider-agnostic Pix boundary

## Tooling

Unit tests: Vitest · Integration: Testcontainers + MySQL · E2E: Playwright.

## Commands

| Command | Purpose |
|---------|---------|
| `pnpm install` | install workspace deps (Corepack + pnpm `packageManager`) |
| `pnpm dev` | dev servers for all apps |
| `pnpm build` | build all apps/packages (Turbo) |
| `pnpm lint` | lint all apps (Turbo) |
| `pnpm typecheck` | typecheck all apps/packages (Turbo) |
| `pnpm test` | unit tests (Vitest) |
| `pnpm test:integration` | integration tests (Testcontainers; requires Docker) |
| `pnpm test:e2e` | E2E tests (Playwright Chromium) |
| `pnpm verify:full` | full verified runtime sweep: `pnpm test && pnpm test:integration && pnpm test:e2e && pnpm typecheck && pnpm lint && pnpm build` |
| `pnpm ci` | typecheck + lint + build + unit |

Requires Node ≥ 20 and Docker for integration tests. pnpm is managed via
Corepack (`packageManager` field).

## Full verification prerequisites

- Docker for integration tests (`pnpm test:integration`)
- Playwright browsers for E2E: `pnpm exec playwright install --with-deps chromium`

## Local setup & manual testing

From a fresh clone to a running, seeded system:

### Prerequisites

| Tool | Version / Notes |
|------|-----------------|
| Node.js | ≥ 20 (repo `engines` field) |
| pnpm | Via Corepack (`corepack enable`); repo pins `pnpm@9.15.4` |
| Docker | For MySQL 8 — no `docker-compose` file exists in the repo |
| Playwright Chromium | Optional, E2E only: `pnpm exec playwright install --with-deps chromium` |

### 1. Install dependencies

```bash
pnpm install
```

### 2. Start MySQL 8 (Docker)

No compose file — start a container matching the `DATABASE_URL` shape from
`.env.example` (port `3306`, database `barberia`):

```bash
docker run --name barberia-mysql \
  -e MYSQL_ROOT_PASSWORD=root \
  -e MYSQL_DATABASE=barberia \
  -p 3306:3306 \
  -d mysql:8.4
```

### 3. Configure environment

```bash
cp .env.example .env   # repo root — this is the file Prisma and the worker load
```

Fill the values the local setup needs:

- `DATABASE_URL` — match the container above, e.g.
  `mysql://root:root@localhost:3306/barberia?allowPublicKeyRetrieval=true`.
  Keep `allowPublicKeyRetrieval=true`; it's required for MySQL 8 auth over non-TLS.
- `AUTH_SECRET` — generate one: `openssl rand -base64 32`
- `RESEND_API_KEY` / `RESEND_FROM_EMAIL` — the worker exits on boot if unset;
  a placeholder key keeps it running (email sends will fail and retry).
- Optional: `MERCADO_PAGO_WEBHOOK_SECRET` (Pix flows), `AUTH_GOOGLE_ID` /
  `AUTH_GOOGLE_SECRET` (Google sign-in).

> Note: the comment inside `.env.example` mentions `.env.local`, but the code
> reads the **root** `.env`: `packages/db/prisma.config.ts` and
> `apps/worker/src/index.ts` both load it via dotenv. Copy to `.env`.

### 4. Apply migrations and seed

```bash
pnpm --filter @barber/db db:generate   # generate the Prisma client
pnpm --filter @barber/db db:deploy     # apply committed migrations
pnpm --filter @barber/db db:seed       # demo data (idempotent)
```

Use `db:deploy` (not `db:migrate`) for a clean setup — it applies the committed
migrations without prompting for new ones.

### 5. Build workspace packages

```bash
pnpm build
```

`@barber/db`, `@barber/contracts` and `@barber/payments` resolve to `dist/`
builds (gitignored), so they must be compiled before `pnpm dev` works.

### 6. Run

```bash
pnpm dev
```

| App | URL | Notes |
|-----|-----|-------|
| Web (`apps/web`) | http://localhost:3000 | Next.js; health check `GET /api/health` |
| Worker (`apps/worker`) | — | Cron loop; logs `[worker] tick` on start, then every 15 min; requires `RESEND_API_KEY` + `RESEND_FROM_EMAIL` |

### Demo credentials

**There are no demo passwords.** The seed creates users as data fixtures for the
tenant-isolation test suite and **never sets a password hash** (`passwordHash` is
`NULL` on every seeded row). Credentials login rejects accounts without a hash,
and no `Barberia2026!` (or any other hard-coded password) exists anywhere in the
seed.

Seeded accounts — rows exist, but **cannot be used to sign in**:

| Role | Name | Email | Tenant (slug) |
|------|------|-------|---------------|
| BARBERSHOP_ADMIN | Admin Tesoura | `admin@tesoura.example` | tesoura-de-ouro |
| BARBER | Carlos Ferreira | `barbeiro@tesoura.example` | tesoura-de-ouro |
| CLIENT | Maria Silva | `cliente@tesoura.example` | tesoura-de-ouro |
| BARBER | Renato Alves | `barbeiro@navalha.example` | barba-e-navalha |
| CLIENT | João Pereira | `cliente@navalha.example` | barba-e-navalha |

To test login today, **register a new client** at `/register` — registration
sets a password hash and signs the account in automatically. Admin/barber
logins require a password hash on the account: the invite flow exists
(`/api/admin/invites` → accept), but creating an invite needs an authenticated
BARBERSHOP_ADMIN, so it is not reachable on a fresh seed.

### Demo data (seeded)

| Tenant | Slug | Service | Barber | Schedule | Appointment |
|--------|------|---------|--------|----------|-------------|
| Tesoura de Ouro | `tesoura-de-ouro` | Corte — R$ 45 / 30 min | Carlos Ferreira (corte, barba) | Tue 09:00–18:00 | 2026-08-11 13:00 UTC |
| Barba & Navalha | `barba-e-navalha` | Corte Degradê — R$ 60 / 40 min | Renato Alves (degradê) | Wed 10:00–19:00 | 2026-08-12 14:00 UTC |

Both tenants run in `America/Sao_Paulo`. Each barber is linked to their
tenant's service (`barberService`), so the seeded data mirrors a real tenant.

### Manual test journey

1. `curl http://localhost:3000/api/health` → `200` JSON.
2. Open http://localhost:3000 → register a client at `/register` (the LGPD
   privacy checkbox is mandatory) → auto signed in, landing on `/booking`.
3. `/booking` is currently a **placeholder** ("Agendamento") — the services →
   barbers → slots → Pix payment flow is planned but not implemented yet.
4. Sign out and sign back in at `/login` with the account you registered — the
   credentials flow works for accounts that have a password hash.
5. `/dashboard` is also a **placeholder** ("Painel administrativo") — services,
   barbers, schedule and reports arrive in later phases.
