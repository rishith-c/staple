# Docker Quickstart

Run Staple in Docker without installing Node or pnpm locally.

## One-liner (build + run)

```sh
docker build -t staple-local . && \
docker run --name staple \
  -p 3100:3100 \
  -e HOST=0.0.0.0 \
  -e STAPLE_HOME=/staple \
  -v "$(pwd)/data/docker-staple:/staple" \
  staple-local
```

Open: `http://localhost:3100`

Data persistence:

- Embedded PostgreSQL data
- uploaded assets
- local secrets key
- local agent workspace data

All persisted under your bind mount (`./data/docker-staple` in the example above).

## Compose Quickstart

```sh
docker compose -f docker-compose.quickstart.yml up --build
```

Defaults:

- host port: `3100`
- persistent data dir: `./data/docker-staple`

Optional overrides:

```sh
STAPLE_PORT=3200 STAPLE_DATA_DIR=./data/pc docker compose -f docker-compose.quickstart.yml up --build
```

If you change host port or use a non-local domain, set `STAPLE_PUBLIC_URL` to the external URL you will use in browser/auth flows.

## Authenticated Compose (Single Public URL)

For authenticated deployments, set one canonical public URL and let Staple derive auth/callback defaults:

```yaml
services:
  staple:
    environment:
      STAPLE_DEPLOYMENT_MODE: authenticated
      STAPLE_DEPLOYMENT_EXPOSURE: private
      STAPLE_PUBLIC_URL: https://desk.koker.net
```

`STAPLE_PUBLIC_URL` is used as the primary source for:

- auth public base URL
- Better Auth base URL defaults
- bootstrap invite URL defaults
- hostname allowlist defaults (hostname extracted from URL)

Granular overrides remain available if needed (`STAPLE_AUTH_PUBLIC_BASE_URL`, `BETTER_AUTH_URL`, `BETTER_AUTH_TRUSTED_ORIGINS`, `STAPLE_ALLOWED_HOSTNAMES`).

Set `STAPLE_ALLOWED_HOSTNAMES` explicitly only when you need additional hostnames beyond the public URL host (for example Tailscale/LAN aliases or multiple private hostnames).

## Claude + Codex Local Adapters in Docker

The image pre-installs:

- `claude` (Anthropic Claude Code CLI)
- `codex` (OpenAI Codex CLI)

If you want local adapter runs inside the container, pass API keys when starting the container:

```sh
docker run --name staple \
  -p 3100:3100 \
  -e HOST=0.0.0.0 \
  -e STAPLE_HOME=/staple \
  -e OPENAI_API_KEY=... \
  -e ANTHROPIC_API_KEY=... \
  -v "$(pwd)/data/docker-staple:/staple" \
  staple-local
```

Notes:

- Without API keys, the app still runs normally.
- Adapter environment checks in Staple will surface missing auth/CLI prerequisites.

## Untrusted PR Review Container

If you want a separate Docker environment for reviewing untrusted pull requests with `codex` or `claude`, use the dedicated review workflow in `doc/UNTRUSTED-PR-REVIEW.md`.

That setup keeps CLI auth state in Docker volumes instead of your host home directory and uses a separate scratch workspace for PR checkouts and preview runs.

## Onboard Smoke Test (Ubuntu + npm only)

Use this when you want to mimic a fresh machine that only has Ubuntu + npm and verify:

- `npx stapleai onboard --yes` completes
- the server binds to `0.0.0.0:3100` so host access works
- onboard/run banners and startup logs are visible in your terminal

Build + run:

```sh
./scripts/docker-onboard-smoke.sh
```

Open: `http://localhost:3131` (default smoke host port)

Useful overrides:

```sh
HOST_PORT=3200 STAPLEAI_VERSION=latest ./scripts/docker-onboard-smoke.sh
STAPLE_DEPLOYMENT_MODE=authenticated STAPLE_DEPLOYMENT_EXPOSURE=private ./scripts/docker-onboard-smoke.sh
SMOKE_DETACH=true SMOKE_METADATA_FILE=/tmp/staple-smoke.env STAPLEAI_VERSION=latest ./scripts/docker-onboard-smoke.sh
```

Notes:

- Persistent data is mounted at `./data/docker-onboard-smoke` by default.
- Container runtime user id defaults to your local `id -u` so the mounted data dir stays writable while avoiding root runtime.
- Smoke script defaults to `authenticated/private` mode so `HOST=0.0.0.0` can be exposed to the host.
- Smoke script defaults host port to `3131` to avoid conflicts with local Staple on `3100`.
- Smoke script also defaults `STAPLE_PUBLIC_URL` to `http://localhost:<HOST_PORT>` so bootstrap invite URLs and auth callbacks use the reachable host port instead of the container's internal `3100`.
- In authenticated mode, the smoke script defaults `SMOKE_AUTO_BOOTSTRAP=true` and drives the real bootstrap path automatically: it signs up a real user, runs `stapleai auth bootstrap-ceo` inside the container to mint a real bootstrap invite, accepts that invite over HTTP, and verifies board session access.
- Run the script in the foreground to watch the onboarding flow; stop with `Ctrl+C` after validation.
- Set `SMOKE_DETACH=true` to leave the container running for automation and optionally write shell-ready metadata to `SMOKE_METADATA_FILE`.
- The image definition is in `Dockerfile.onboard-smoke`.
