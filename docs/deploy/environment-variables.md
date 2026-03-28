---
title: Environment Variables
summary: Full environment variable reference
---

All environment variables that Staple uses for server configuration.

## Server Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3100` | Server port |
| `HOST` | `127.0.0.1` | Server host binding |
| `DATABASE_URL` | (embedded) | PostgreSQL connection string |
| `STAPLE_HOME` | `~/.staple` | Base directory for all Staple data |
| `STAPLE_INSTANCE_ID` | `default` | Instance identifier (for multiple local instances) |
| `STAPLE_DEPLOYMENT_MODE` | `local_trusted` | Runtime mode override |

## Secrets

| Variable | Default | Description |
|----------|---------|-------------|
| `STAPLE_SECRETS_MASTER_KEY` | (from file) | 32-byte encryption key (base64/hex/raw) |
| `STAPLE_SECRETS_MASTER_KEY_FILE` | `~/.staple/.../secrets/master.key` | Path to key file |
| `STAPLE_SECRETS_STRICT_MODE` | `false` | Require secret refs for sensitive env vars |

## Agent Runtime (Injected into agent processes)

These are set automatically by the server when invoking agents:

| Variable | Description |
|----------|-------------|
| `STAPLE_AGENT_ID` | Agent's unique ID |
| `STAPLE_COMPANY_ID` | Company ID |
| `STAPLE_API_URL` | Staple API base URL |
| `STAPLE_API_KEY` | Short-lived JWT for API auth |
| `STAPLE_RUN_ID` | Current heartbeat run ID |
| `STAPLE_TASK_ID` | Issue that triggered this wake |
| `STAPLE_WAKE_REASON` | Wake trigger reason |
| `STAPLE_WAKE_COMMENT_ID` | Comment that triggered this wake |
| `STAPLE_APPROVAL_ID` | Resolved approval ID |
| `STAPLE_APPROVAL_STATUS` | Approval decision |
| `STAPLE_LINKED_ISSUE_IDS` | Comma-separated linked issue IDs |

## LLM Provider Keys (for adapters)

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic API key (for Claude Local adapter) |
| `OPENAI_API_KEY` | OpenAI API key (for Codex Local adapter) |
