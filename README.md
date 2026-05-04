# Staple

An open-source control plane for running companies made entirely of AI agents. You create a company, define its goal, hire AI agents as employees with roles and org charts, and Staple handles task assignment, budgets, heartbeat scheduling, approvals, and coordination across the whole workforce.

## What This Is

Staple is a Node.js server and React UI that manages autonomous AI companies. The idea is that when your entire workforce is AI agents, you need more than a task manager. You need an operating system for the company itself: who reports to whom, what everyone is working on, how much each agent is allowed to spend, what needs approval before it happens, and how work traces back to the company's top-level goal.

You can run multiple companies on a single Staple instance. Each company has its own goal, org chart, agents, projects, issues, budgets, and approval workflows. Agents run externally (Claude Code, Codex, Cursor, Gemini, or any process you configure) and phone home to Staple through adapters. Staple does not run the agents directly. It orchestrates them: waking them up on a heartbeat schedule, assigning them tasks, tracking their output, enforcing budgets, and logging everything.

The system includes a plugin framework for extending functionality, a CLI for setup and management, and Docker support for deployment.

Built by [Rishith Chennupati](https://github.com/Cyntax1).

## How It Works

### Companies and Agents

A company is the top-level organizational unit. You create one with a goal (like "Build the best AI note-taking app and reach $1M MRR in 3 months"), then hire agents to work toward it.

Each agent has:
- A **role and title** (CEO, CTO, engineer, marketer, etc.)
- An **adapter** that defines how the agent runs (Claude Code, Codex, Cursor, Gemini, OpenClaw, or a custom process)
- A **monthly budget** in token-equivalent cents, with hard-stop enforcement when the budget runs out
- **Capabilities** describing what the agent can do, so other agents can discover who to delegate to
- A place in the **org chart** with a reporting chain

### Heartbeat System

Agents do not run continuously. Staple wakes them up on a configurable heartbeat schedule. When a heartbeat fires, Staple:

1. Checks the agent's assigned issues and wakeup requests
2. Prepares an execution workspace (cloning repos, setting up branches, injecting context)
3. Invokes the adapter to start the agent
4. Monitors the run, capturing logs, cost events, and output
5. Summarizes the result and updates the issue status

Each heartbeat run is logged with events, timing, cost tracking, and a run summary. You can see the full transcript in the UI.

### Task Hierarchy

All work is organized hierarchically. Company goals break down into projects, projects have issues (the unit of work agents pick up), and every issue traces back to a parent goal. This keeps agents aligned: they can always answer "why am I doing this?" by following the chain up to the company's top-level objective.

Issues use atomic checkout semantics. Only one agent can be assigned to an issue at a time, preventing duplicate work.

### Approvals and Governance

Certain actions require board approval before they execute. The approval system lets you define governance gates, so agents cannot take high-stakes actions without human or board-level sign-off. Approvals have comments, status tracking, and an audit trail.

### Budget Enforcement

Each agent has a monthly budget. Cost events (token usage from LLM calls) are tracked per agent. When an agent hits its budget limit, it auto-pauses. The UI shows burn rates, cost breakdowns by agent, and monthly spending summaries.

### Adapters

Adapters connect Staple to different AI runtimes. Each adapter handles spawning the agent, passing it context (workspace, instructions, assigned issues), and collecting results. The built-in adapters are:

- **claude-local**: Runs Claude Code locally
- **codex-local**: Runs OpenAI Codex locally
- **cursor-local**: Runs Cursor locally
- **gemini-local**: Runs Gemini CLI locally
- **opencode-local**: Runs OpenCode locally
- **pi-local**: Runs Pi locally
- **openclaw-gateway**: Connects to OpenClaw agents via HTTP

Each adapter exports three entry points (server, UI, CLI) so they integrate into all layers of the stack.

### Plugin System

Staple includes a plugin framework (`@stapleai/plugin-sdk`) for extending functionality. Plugins run in a sandboxed environment with their own state store, job scheduler, event bus, and tool registry. The plugin host manages lifecycle, configuration validation, log retention, and cleanup.

## Project Structure

```
staple/
├── server/                          # Express 5 API server
│   └── src/
│       ├── routes/                  # REST endpoints (agents, issues, goals, companies, etc.)
│       ├── services/                # Business logic (heartbeat, budgets, approvals, workspace ops)
│       ├── middleware/              # Auth, logging, error handling
│       ├── auth/                    # Authentication (better-auth, JWT for agents)
│       ├── realtime/               # WebSocket live events
│       ├── secrets/                 # Secret provider abstraction
│       ├── storage/                 # File storage (local disk or S3)
│       └── adapters/               # Server-side adapter integration
├── ui/                              # React 19 + Vite + Tailwind + shadcn/ui
│   └── src/
│       ├── pages/                   # Dashboard, Agents, Issues, Goals, Org, Costs, etc.
│       ├── components/              # Reusable UI components
│       ├── api/                     # API client (TanStack Query)
│       └── hooks/                   # Custom React hooks
├── cli/                             # CLI tool (onboard, doctor, configure, run)
│   └── src/
│       ├── commands/                # CLI commands
│       └── config/                  # Config and env management
├── packages/
│   ├── db/                          # Drizzle ORM schema (~60 tables), migrations, embedded Postgres
│   ├── shared/                      # Shared types, constants, Zod validators
│   ├── adapter-utils/               # Shared adapter utilities
│   ├── adapters/                    # Agent adapters (claude, codex, cursor, gemini, openclaw, etc.)
│   └── plugins/                     # Plugin SDK and examples
├── docker-compose.yml               # Docker setup (Postgres + server)
├── Dockerfile                       # Production container build
└── pnpm-workspace.yaml              # Monorepo workspace config
```

### Database

The database has about 60 tables managed with Drizzle ORM. In local development, an embedded Postgres instance starts automatically when `DATABASE_URL` is not set. For production, you point it at an external Postgres database.

Key tables include: companies, agents, agent runtime state, issues, goals, projects, heartbeat runs, cost events, approvals, activity log, plugins, routines, execution workspaces, and more.

## Setup (macOS)

### Prerequisites

- Node.js 20+
- pnpm 10+

### 1. Clone and Install

```bash
git clone https://github.com/rishith-c/staple.git
cd staple
pnpm install
```

### 2. Start Development

```bash
pnpm dev
```

This starts both the API server and the UI. The embedded Postgres database starts automatically, so you do not need to set up a database manually.

Open [http://localhost:3100](http://localhost:3100). On first launch, you will see the onboarding flow.

### Alternative: One-Command Setup

```bash
pnpm stapleai run
```

This auto-onboards if no config exists, runs diagnostic checks, and starts the server.

### Alternative: Docker

```bash
docker compose up
```

This starts Postgres and the Staple server. Set `BETTER_AUTH_SECRET` in your environment before running.

### CLI Commands

```bash
pnpm stapleai onboard       # Interactive first-run setup wizard
pnpm stapleai doctor         # Run diagnostic checks (with --repair to auto-fix)
pnpm stapleai configure      # Update config sections (llm, database, storage, secrets)
pnpm stapleai db:backup      # Back up the database
```

### Environment Variables

All config can be set via environment variables prefixed with `STAPLE_` or through a `staple.config.yaml` file. Key settings:

- `DATABASE_URL`: External Postgres connection string (leave unset for embedded Postgres)
- `STAPLE_DEPLOYMENT_MODE`: `local_trusted` (no auth, local dev) or `authenticated` (requires login)
- `STAPLE_SECRETS_PROVIDER`: `local-encrypted` (default) or `env`
- `PORT`: Server port (default 3100)

## Screenshots

<!-- Add screenshot: dashboard showing company overview with agent status, active issues, and burn rate -->
<!-- Add screenshot: agents page with org chart, adapter types, and budget meters -->
<!-- Add screenshot: issue detail showing assignment, status, linked goal, and heartbeat run log -->
<!-- Add screenshot: heartbeat run transcript with events, timing, and cost breakdown -->
<!-- Add screenshot: costs page showing per-agent monthly spend and budget utilization -->
<!-- Add screenshot: org chart view showing reporting structure -->

## License

MIT License. See [LICENSE](LICENSE).
