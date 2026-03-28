# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Staple

Staple is an open-source Node.js server + React UI that orchestrates teams of AI agents to run autonomous businesses. It provides org charts, budgets, governance, goal alignment, heartbeat scheduling, and agent coordination. It is **not** an agent framework — it manages the organization agents work in.

## Build & Dev Commands

```bash
pnpm install                  # Install all workspace dependencies
pnpm dev                      # Start API server + UI (auto-creates embedded Postgres)
pnpm dev:server               # Server only
pnpm dev:ui                   # UI only (Vite dev server)
pnpm build                    # Build all packages
pnpm -r typecheck             # Typecheck all packages
pnpm test                     # Run vitest in watch mode
pnpm test:run                 # Run vitest once (CI-friendly)
vitest run server              # Run tests for a single workspace
vitest run packages/db         # Run tests for db package
pnpm test:e2e                 # Run Playwright E2E tests
pnpm db:generate              # Generate Drizzle migrations (compiles db package first)
pnpm db:migrate               # Run pending migrations
```

API starts at `http://localhost:3100`. UI is served from the same port via dev middleware. Embedded Postgres starts automatically when `DATABASE_URL` is unset. Reset dev DB by removing `data/pglite` and restarting.

## Monorepo Structure

pnpm workspace with these packages:

| Package | Path | Purpose |
|---------|------|---------|
| `@stapleai/server` | `server/` | Express 5 REST API, orchestration services, heartbeat scheduler, plugin host |
| `@stapleai/ui` | `ui/` | React 19 + Vite + TailwindCSS 4 + shadcn/ui board interface |
| `stapleai` (CLI) | `cli/` | CLI for onboarding, local server management (`npx stapleai onboard`) |
| `@stapleai/db` | `packages/db/` | Drizzle ORM schema, migrations, embedded Postgres client |
| `@stapleai/shared` | `packages/shared/` | Shared types, constants, Zod validators, API path constants |
| `@stapleai/adapter-utils` | `packages/adapter-utils/` | Shared adapter utilities |
| `@stapleai/plugin-sdk` | `packages/plugins/sdk/` | Plugin development SDK |
| Adapters | `packages/adapters/*/` | Agent adapters: claude-local, codex-local, cursor-local, gemini-local, openclaw-gateway, opencode-local, pi-local |

Each adapter exports three entry points: `./server`, `./ui`, `./cli`.

## Architecture

### Data Flow

All domain entities are **company-scoped**. The server enforces company boundaries in every route/service. The data model follows:

**Company** → has **Projects** → has **Goals** → produces **Issues** (tickets)
**Company** → has **Agents** (with adapters, budgets, API keys) → assigned to Issues
**Company** → has **Routines** (heartbeat-scheduled recurring work)

### Key Patterns

- **Adapter system**: Each AI runtime (Claude Code, Codex, Cursor, etc.) has an adapter in `packages/adapters/`. Adapters handle agent spawning, heartbeats, and communication.
- **Heartbeat scheduler**: Server-side cron that wakes agents on schedule. Agents check their assigned work, execute, and report back.
- **Atomic issue checkout**: Single-assignee task model with atomic checkout semantics — prevents double-work.
- **Budget enforcement**: Monthly cost budgets per agent. Agents auto-pause when budget is exhausted.
- **Approval gates**: Governed actions require board approval before execution.
- **Plugin system**: Runtime-loadable plugins via `@stapleai/plugin-sdk` with sandboxed execution.
- **Activity logging**: All mutations produce activity log entries for audit.

### Server Layer (`server/src/`)

- `routes/` — Express route handlers (one file per domain: agents, issues, goals, companies, etc.)
- `services/` — Business logic layer (heartbeat, budgets, approvals, workspace operations, plugin host)
- `middleware/` — Auth, error handling, request validation
- `auth/` — better-auth integration, board claim, JWT agent auth
- `realtime/` — WebSocket live event broadcasting
- `secrets/` — Secret provider abstraction (local encrypted, env-based)
- `storage/` — File storage abstraction (local disk, S3)

### UI Layer (`ui/src/`)

- `pages/` — Route-level page components (Dashboard, Agents, Issues, Goals, etc.)
- `components/` — Reusable UI components
- `api/` — API client functions (TanStack Query)
- `hooks/` — Custom React hooks
- `context/` — React context providers (company selection, auth)
- `adapters/` — UI-side adapter integration

### Database (`packages/db/`)

- `src/schema/` — Drizzle table definitions (~60 tables)
- `src/migrations/` — SQL migration files
- Uses `drizzle-kit` for migration generation
- Embedded Postgres for local dev, external Postgres for production

## Contract Synchronization

When changing schema or API behavior, update **all** impacted layers in lockstep:
1. `packages/db` — schema and exports
2. `packages/shared` — types, constants, validators
3. `server` — routes and services
4. `ui` — API clients and pages

## Verification Checklist

Before claiming work is done:
```bash
pnpm -r typecheck
pnpm test:run
pnpm build
```

## Key Config

- Server config: `server/src/config.ts` — reads from `.env` and `staple.config.yaml`
- Default port: 3100
- Config env vars are prefixed with `STAPLE_` (e.g., `STAPLE_DEPLOYMENT_MODE`, `STAPLE_SECRETS_PROVIDER`)
- Database: `DATABASE_URL` for external Postgres, unset for embedded
- TypeScript: ES2023 target, NodeNext module resolution, strict mode

## Reference Docs

- `AGENTS.md` — Contributor guide with repo map and engineering rules
- `CONTRIBUTING.md` — PR process and thinking-path format
- `doc/SPEC-implementation.md` — V1 build contract (source of truth for behavior)
- `doc/GOAL.md` + `doc/PRODUCT.md` — Product context
- `doc/DEVELOPING.md` — Extended dev setup guide
- `doc/DATABASE.md` — Database details
