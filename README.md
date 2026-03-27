# Selflify

Filesystem-backed admin panel for managing static SPA preview environments.

The project uses `Yarn 4` as the package manager.

## Current state

Implemented:

- Next.js App Router + TypeScript application
- Chakra UI dark admin shell
- `next-auth` credentials auth
- single source of truth in `selflify.config.json`
- setup/login flow plus a combined `Sites` overview instead of separate dashboard + sites lists
- site details and global settings screens
- Caddyfile generation and zero-downtime reload hooks
- Cloudflare DNS sync adapter
- config operations with revision checks, backups and rollback hooks
- cleanup script for stale preview deploys and orphaned site directories
- scheduled cleanup worker in `docker-compose`
- production `docker-compose.yml`
- development `docker-compose.dev.yml`
- dev fixture deploy directories in `.dev/var-www`

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
The base preview root also comes from `selflify.config.json` and defaults to `/var/www`.
If no admin account is configured yet, the app will redirect to `/setup`.

Useful optional overrides:

```bash
SELFLIFY_CADDY_CONFIG_PATH=./.dev/Caddyfile
SELFLIFY_CADDY_ADMIN_ADDRESS=http://caddy:2019
SELFLIFY_CADDY_CONTAINER=selflify-dev-caddy
SELFLIFY_BACKUP_ROOT=./.selflify/backups
SELFLIFY_BACKUP_KEEP=20
SELFLIFY_MOCK_CLOUDFLARE=1
SELFLIFY_SKIP_CADDY_RELOAD=0
```

If you run `yarn dev` directly on your host and want fixture files instead of `/var/www`, add:

```bash
SELFLIFY_PREVIEW_ROOT=./.dev/var-www
SELFLIFY_UPSTREAM=host.docker.internal:3000
```

If you want to use a host-installed Caddy binary instead of the dev container, add:

```bash
SELFLIFY_CADDY_BIN=/usr/local/bin/caddy
```

In local development, the recommended behavior is:

- mock Cloudflare DNS operations
- allow real Caddy reloads inside the dev compose stack
- keep a small rolling backup set for config and Caddy snapshots

## Main flows

- `/setup`: create the first account when `selflify.config.json` does not have credentials yet
- `/login`: sign in with the configured credentials
- `/sites`: metrics + site inventory + site creation modal
- `/sites/[site]`: update the site, inspect deploys, remove preview deploys or delete the site
- `/settings`: domain, Caddy, Cloudflare and credentials settings

## Dev compose

```bash
docker compose -f docker-compose.dev.yml up --build
```

This runs:

- `selflify` on `http://localhost:3000`
- `cleanup` worker against `/var/www` mounted from `.dev/var-www`
- `caddy` on `http://localhost:8080`

This is the full-fidelity development stack. It is the mode that correctly reflects preview
directories, free-space reporting, masked token display and generated Caddy updates.

You can still run `yarn dev --hostname 0.0.0.0 --port 3000` directly on the host for isolated UI
work, but that host-side mode is not the full preview stack unless you also override the filesystem
paths manually.

Inside the containers, the base preview root is always `/var/www`.
In development, `docker-compose.dev.yml` mounts local fixture files from `.dev/var-www` into that path.
`Caddy` proxies the admin panel to the `selflify` service inside the compose network by default.
When you intentionally run host-side `yarn dev`, Selflify can still use `docker exec selflify-dev-caddy caddy ...` for validation and password hashing unless `SELFLIFY_CADDY_BIN` is explicitly overridden.

## Dev fixtures

The repo contains minimal static fixture deploys for the current sites in [`.dev/var-www`](/Users/aleksnick/dev/Selflify/.dev/var-www).

Examples:

- [`.dev/var-www/app/stable/index.html`](/Users/aleksnick/dev/Selflify/.dev/var-www/app/stable/index.html)
- [`.dev/var-www/app/pr-6825/index.html`](/Users/aleksnick/dev/Selflify/.dev/var-www/app/pr-6825/index.html)
- [`.dev/var-www/storybook/release-3-189-30/index.html`](/Users/aleksnick/dev/Selflify/.dev/var-www/storybook/release-3-189-30/index.html)

They exist so that local `Caddy` and the `Sites` screen can immediately see stable and preview deploy directories without waiting for real builds.

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
