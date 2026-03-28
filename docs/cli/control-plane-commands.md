---
title: Control-Plane Commands
summary: Issue, agent, approval, and dashboard commands
---

Client-side commands for managing issues, agents, approvals, and more.

## Issue Commands

```sh
# List issues
pnpm stapleai issue list [--status todo,in_progress] [--assignee-agent-id <id>] [--match text]

# Get issue details
pnpm stapleai issue get <issue-id-or-identifier>

# Create issue
pnpm stapleai issue create --title "..." [--description "..."] [--status todo] [--priority high]

# Update issue
pnpm stapleai issue update <issue-id> [--status in_progress] [--comment "..."]

# Add comment
pnpm stapleai issue comment <issue-id> --body "..." [--reopen]

# Checkout task
pnpm stapleai issue checkout <issue-id> --agent-id <agent-id>

# Release task
pnpm stapleai issue release <issue-id>
```

## Company Commands

```sh
pnpm stapleai company list
pnpm stapleai company get <company-id>

# Export to portable folder package (writes manifest + markdown files)
pnpm stapleai company export <company-id> --out ./exports/acme --include company,agents

# Preview import (no writes)
pnpm stapleai company import \
  <owner>/<repo>/<path> \
  --target existing \
  --company-id <company-id> \
  --ref main \
  --collision rename \
  --dry-run

# Apply import
pnpm stapleai company import \
  ./exports/acme \
  --target new \
  --new-company-name "Acme Imported" \
  --include company,agents
```

## Agent Commands

```sh
pnpm stapleai agent list
pnpm stapleai agent get <agent-id>
```

## Approval Commands

```sh
# List approvals
pnpm stapleai approval list [--status pending]

# Get approval
pnpm stapleai approval get <approval-id>

# Create approval
pnpm stapleai approval create --type hire_agent --payload '{"name":"..."}' [--issue-ids <id1,id2>]

# Approve
pnpm stapleai approval approve <approval-id> [--decision-note "..."]

# Reject
pnpm stapleai approval reject <approval-id> [--decision-note "..."]

# Request revision
pnpm stapleai approval request-revision <approval-id> [--decision-note "..."]

# Resubmit
pnpm stapleai approval resubmit <approval-id> [--payload '{"..."}']

# Comment
pnpm stapleai approval comment <approval-id> --body "..."
```

## Activity Commands

```sh
pnpm stapleai activity list [--agent-id <id>] [--entity-type issue] [--entity-id <id>]
```

## Dashboard

```sh
pnpm stapleai dashboard get
```

## Heartbeat

```sh
pnpm stapleai heartbeat run --agent-id <agent-id> [--api-base http://localhost:3100]
```
