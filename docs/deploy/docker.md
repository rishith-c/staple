---
title: Docker
summary: Docker Compose quickstart
---

Run Staple in Docker without installing Node or pnpm locally.

## Compose Quickstart (Recommended)

```sh
docker compose -f docker-compose.quickstart.yml up --build
```

Open [http://localhost:3100](http://localhost:3100).

Defaults:

- Host port: `3100`
- Data directory: `./data/docker-staple`

Override with environment variables:

```sh
STAPLE_PORT=3200 STAPLE_DATA_DIR=./data/pc \
  docker compose -f docker-compose.quickstart.yml up --build
```

## Manual Docker Build

```sh
docker build -t staple-local .
docker run --name staple \
  -p 3100:3100 \
  -e HOST=0.0.0.0 \
  -e STAPLE_HOME=/staple \
  -v "$(pwd)/data/docker-staple:/staple" \
  staple-local
```

## Data Persistence

All data is persisted under the bind mount (`./data/docker-staple`):

- Embedded PostgreSQL data
- Uploaded assets
- Local secrets key
- Agent workspace data

## Claude and Codex Adapters in Docker

The Docker image pre-installs:

- `claude` (Anthropic Claude Code CLI)
- `codex` (OpenAI Codex CLI)

Pass API keys to enable local adapter runs inside the container:

```sh
docker run --name staple \
  -p 3100:3100 \
  -e HOST=0.0.0.0 \
  -e STAPLE_HOME=/staple \
  -e OPENAI_API_KEY=sk-... \
  -e ANTHROPIC_API_KEY=sk-... \
  -v "$(pwd)/data/docker-staple:/staple" \
  staple-local
```

Without API keys, the app runs normally — adapter environment checks will surface missing prerequisites.
