# CLI Reference

Staple CLI now supports both:

- instance setup/diagnostics (`onboard`, `doctor`, `configure`, `env`, `allowed-hostname`)
- control-plane client operations (issues, approvals, agents, activity, dashboard)

## Base Usage

Use repo script in development:

```sh
pnpm stapleai --help
```

First-time local bootstrap + run:

```sh
pnpm stapleai run
```

Choose local instance:

```sh
pnpm stapleai run --instance dev
```

## Deployment Modes

Mode taxonomy and design intent are documented in `doc/DEPLOYMENT-MODES.md`.

Current CLI behavior:

- `stapleai onboard` and `stapleai configure --section server` set deployment mode in config
- runtime can override mode with `STAPLE_DEPLOYMENT_MODE`
- `stapleai run` and `stapleai doctor` do not yet expose a direct `--mode` flag

Target behavior (planned) is documented in `doc/DEPLOYMENT-MODES.md` section 5.

Allow an authenticated/private hostname (for example custom Tailscale DNS):

```sh
pnpm stapleai allowed-hostname dotta-macbook-pro
```

All client commands support:

- `--data-dir <path>`
- `--api-base <url>`
- `--api-key <token>`
- `--context <path>`
- `--profile <name>`
- `--json`

Company-scoped commands also support `--company-id <id>`.

Use `--data-dir` on any CLI command to isolate all default local state (config/context/db/logs/storage/secrets) away from `~/.staple`:

```sh
pnpm stapleai run --data-dir ./tmp/staple-dev
pnpm stapleai issue list --data-dir ./tmp/staple-dev
```

## Context Profiles

Store local defaults in `~/.staple/context.json`:

```sh
pnpm stapleai context set --api-base http://localhost:3100 --company-id <company-id>
pnpm stapleai context show
pnpm stapleai context list
pnpm stapleai context use default
```

To avoid storing secrets in context, set `apiKeyEnvVarName` and keep the key in env:

```sh
pnpm stapleai context set --api-key-env-var-name STAPLE_API_KEY
export STAPLE_API_KEY=...
```

## Company Commands

```sh
pnpm stapleai company list
pnpm stapleai company get <company-id>
pnpm stapleai company delete <company-id-or-prefix> --yes --confirm <same-id-or-prefix>
```

Examples:

```sh
pnpm stapleai company delete PAP --yes --confirm PAP
pnpm stapleai company delete 5cbe79ee-acb3-4597-896e-7662742593cd --yes --confirm 5cbe79ee-acb3-4597-896e-7662742593cd
```

Notes:

- Deletion is server-gated by `STAPLE_ENABLE_COMPANY_DELETION`.
- With agent authentication, company deletion is company-scoped. Use the current company ID/prefix (for example via `--company-id` or `STAPLE_COMPANY_ID`), not another company.

## Issue Commands

```sh
pnpm stapleai issue list --company-id <company-id> [--status todo,in_progress] [--assignee-agent-id <agent-id>] [--match text]
pnpm stapleai issue get <issue-id-or-identifier>
pnpm stapleai issue create --company-id <company-id> --title "..." [--description "..."] [--status todo] [--priority high]
pnpm stapleai issue update <issue-id> [--status in_progress] [--comment "..."]
pnpm stapleai issue comment <issue-id> --body "..." [--reopen]
pnpm stapleai issue checkout <issue-id> --agent-id <agent-id> [--expected-statuses todo,backlog,blocked]
pnpm stapleai issue release <issue-id>
```

## Agent Commands

```sh
pnpm stapleai agent list --company-id <company-id>
pnpm stapleai agent get <agent-id>
pnpm stapleai agent local-cli <agent-id-or-shortname> --company-id <company-id>
```

`agent local-cli` is the quickest way to run local Claude/Codex manually as a Staple agent:

- creates a new long-lived agent API key
- installs missing Staple skills into `~/.codex/skills` and `~/.claude/skills`
- prints `export ...` lines for `STAPLE_API_URL`, `STAPLE_COMPANY_ID`, `STAPLE_AGENT_ID`, and `STAPLE_API_KEY`

Example for shortname-based local setup:

```sh
pnpm stapleai agent local-cli codexcoder --company-id <company-id>
pnpm stapleai agent local-cli claudecoder --company-id <company-id>
```

## Approval Commands

```sh
pnpm stapleai approval list --company-id <company-id> [--status pending]
pnpm stapleai approval get <approval-id>
pnpm stapleai approval create --company-id <company-id> --type hire_agent --payload '{"name":"..."}' [--issue-ids <id1,id2>]
pnpm stapleai approval approve <approval-id> [--decision-note "..."]
pnpm stapleai approval reject <approval-id> [--decision-note "..."]
pnpm stapleai approval request-revision <approval-id> [--decision-note "..."]
pnpm stapleai approval resubmit <approval-id> [--payload '{"...":"..."}']
pnpm stapleai approval comment <approval-id> --body "..."
```

## Activity Commands

```sh
pnpm stapleai activity list --company-id <company-id> [--agent-id <agent-id>] [--entity-type issue] [--entity-id <id>]
```

## Dashboard Commands

```sh
pnpm stapleai dashboard get --company-id <company-id>
```

## Heartbeat Command

`heartbeat run` now also supports context/api-key options and uses the shared client stack:

```sh
pnpm stapleai heartbeat run --agent-id <agent-id> [--api-base http://localhost:3100] [--api-key <token>]
```

## Local Storage Defaults

Default local instance root is `~/.staple/instances/default`:

- config: `~/.staple/instances/default/config.json`
- embedded db: `~/.staple/instances/default/db`
- logs: `~/.staple/instances/default/logs`
- storage: `~/.staple/instances/default/data/storage`
- secrets key: `~/.staple/instances/default/secrets/master.key`

Override base home or instance with env vars:

```sh
STAPLE_HOME=/custom/home STAPLE_INSTANCE_ID=dev pnpm stapleai run
```

## Storage Configuration

Configure storage provider and settings:

```sh
pnpm stapleai configure --section storage
```

Supported providers:

- `local_disk` (default; local single-user installs)
- `s3` (S3-compatible object storage)
