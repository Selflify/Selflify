# Selflify

Filesystem-backed admin panel for managing static SPA preview environments.

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
- production `docker-compose.yml`
- development `docker-compose.dev.yml`

## Local development

1. Install dependencies:

```bash
npm install
```

2. Ensure `AUTH_SECRET` is set in `.env` or export it in your shell.

3. Start the app:

```bash
npm run dev -- --hostname 127.0.0.1 --port 3100
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
- `caddy` on `http://localhost:8080`

## Config migration

To migrate the old `sites.json` into the new config format:

```bash
npm run migrate:config
```

Use `--force` to overwrite an existing `selflify.config.json`.

## Cleanup job

`cleanup-previews.sh` now reads `selflify.config.json`, removes stale preview directories for configured sites and purges orphaned site directories after TTL.

Optional overrides:

```bash
SELFLIFY_CONFIG_PATH=./selflify.config.json
SELFLIFY_PREVIEW_TTL_DAYS=30
SELFLIFY_ORPHAN_TTL_DAYS=30
```
