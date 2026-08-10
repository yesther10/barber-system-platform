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
