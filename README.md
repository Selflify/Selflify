# Selflify

Filesystem-backed admin panel for managing static SPA preview environments.

The project uses `Yarn 4` as the package manager.

## Current state

Implemented:

- Next.js App Router + TypeScript application
- Chakra UI dark admin shell
- `next-auth` credentials auth
- single source of truth in `selflify.config.json`
- site inventory, site details, settings and setup/login flows
- Caddyfile generation and zero-downtime reload hooks
- Cloudflare DNS sync adapter
- cleanup script for stale preview deploys and orphaned site directories
- scheduled cleanup worker in `docker-compose`
- production `docker-compose.yml`
- development `docker-compose.dev.yml`

## Tooling

Useful local commands:

```bash
yarn lint
yarn lint:fix
yarn format
yarn format:check
yarn test:run
yarn test:coverage
```

## Local development

1. Install dependencies:

```bash
yarn install
```

2. Ensure `AUTH_SECRET` is set in `.env` or export it in your shell.

3. Start the app:

```bash
yarn dev --hostname 127.0.0.1 --port 3100
```

The application will read `selflify.config.json` by default.

Useful optional overrides:

```bash
SELFLIFY_PREVIEW_ROOT=./.dev/var-www
SELFLIFY_CADDY_CONFIG_PATH=./.dev/Caddyfile
SELFLIFY_CADDY_BIN=caddy
SELFLIFY_CADDY_ADMIN_ADDRESS=http://caddy:2019
SELFLIFY_BACKUP_ROOT=./.selflify/backups
SELFLIFY_BACKUP_KEEP=20
SELFLIFY_MOCK_CLOUDFLARE=1
SELFLIFY_SKIP_CADDY_RELOAD=1
```

In local development, the recommended behavior is:

- mock Cloudflare DNS operations
- validate generated `Caddyfile`, but do not call `caddy reload`
- keep a small rolling backup set for config and Caddy snapshots

## Dev compose

```bash
docker compose -f docker-compose.dev.yml up --build
```

This runs:

- `selflify` on `http://localhost:3000`
- `cleanup` worker against `.dev/var-www`
- `caddy` on `http://localhost:8080`

## Production rollout

Production rollout, migration, smoke checks and rollback steps are documented in [docs/production-rollout.md](/Users/aleksnick/dev/Selflify/docs/production-rollout.md).

## Config migration

To migrate the old `sites.json` into the new config format:

```bash
yarn migrate:config
```

Use `--force` to overwrite an existing `selflify.config.json`.

## Cleanup job

`cleanup-previews.sh` now reads `selflify.config.json`, removes stale preview directories for configured sites and purges orphaned site directories after TTL.

Optional overrides:

```bash
SELFLIFY_CONFIG_PATH=./selflify.config.json
SELFLIFY_PREVIEW_TTL_DAYS=30
SELFLIFY_ORPHAN_TTL_DAYS=30
SELFLIFY_CLEANUP_INTERVAL_SECONDS=86400
```
