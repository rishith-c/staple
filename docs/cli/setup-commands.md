---
title: Setup Commands
summary: Onboard, run, doctor, and configure
---

Instance setup and diagnostics commands.

## `stapleai run`

One-command bootstrap and start:

```sh
pnpm stapleai run
```

Does:

1. Auto-onboards if config is missing
2. Runs `stapleai doctor` with repair enabled
3. Starts the server when checks pass

Choose a specific instance:

```sh
pnpm stapleai run --instance dev
```

## `stapleai onboard`

Interactive first-time setup:

```sh
pnpm stapleai onboard
```

First prompt:

1. `Quickstart` (recommended): local defaults (embedded database, no LLM provider, local disk storage, default secrets)
2. `Advanced setup`: full interactive configuration

Start immediately after onboarding:

```sh
pnpm stapleai onboard --run
```

Non-interactive defaults + immediate start (opens browser on server listen):

```sh
pnpm stapleai onboard --yes
```

## `stapleai doctor`

Health checks with optional auto-repair:

```sh
pnpm stapleai doctor
pnpm stapleai doctor --repair
```

Validates:

- Server configuration
- Database connectivity
- Secrets adapter configuration
- Storage configuration
- Missing key files

## `stapleai configure`

Update configuration sections:

```sh
pnpm stapleai configure --section server
pnpm stapleai configure --section secrets
pnpm stapleai configure --section storage
```

## `stapleai env`

Show resolved environment configuration:

```sh
pnpm stapleai env
```

## `stapleai allowed-hostname`

Allow a private hostname for authenticated/private mode:

```sh
pnpm stapleai allowed-hostname my-tailscale-host
```

## Local Storage Paths

| Data | Default Path |
|------|-------------|
| Config | `~/.staple/instances/default/config.json` |
| Database | `~/.staple/instances/default/db` |
| Logs | `~/.staple/instances/default/logs` |
| Storage | `~/.staple/instances/default/data/storage` |
| Secrets key | `~/.staple/instances/default/secrets/master.key` |

Override with:

```sh
STAPLE_HOME=/custom/home STAPLE_INSTANCE_ID=dev pnpm stapleai run
```

Or pass `--data-dir` directly on any command:

```sh
pnpm stapleai run --data-dir ./tmp/staple-dev
pnpm stapleai doctor --data-dir ./tmp/staple-dev
```
