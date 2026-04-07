# Production Rollout

## 1. Prerequisites

- Linux host with Docker Engine and `docker compose`
- mounted `/var/www` with existing deploy directories
- Cloudflare API token with DNS edit permissions for the target zone
- `AUTH_SECRET` prepared for NextAuth sessions

## 2. Prepare the runtime config

Check these fields in `runtime/selflify.config.json` before the first production launch:

- `server.domain`
- `server.serverIp`
- `server.cloudflareApiToken`
- `server.previewRootDir`
- `server.orphanedRootDir`
- `server.caddyConfigPath`
- `server.caddyAdminAddress`
- `server.selflifyUpstream`

If the config file contains an empty admin section, the first login will go through `/setup`.

## 3. Prepare the environment

Create `.env` with at least:

```env
AUTH_SECRET=replace-with-a-long-random-secret
SELFLIFY_SETUP_TOKEN=replace-with-a-long-random-setup-token
```

Optional overrides:

```env
SELFLIFY_PREVIEW_TTL_DAYS=30
SELFLIFY_ORPHAN_TTL_DAYS=30
SELFLIFY_CLEANUP_INTERVAL_SECONDS=86400
SELFLIFY_BACKUP_KEEP=20
```

## 4. Start the stack

```bash
docker compose up -d --build
```

The production stack includes:

- `selflify`
- `cleanup`
- `caddy`

## 5. First-launch flow

1. Open `http://<server-ip>/setup`
2. Unlock setup with `SELFLIFY_SETUP_TOKEN` from `.env`
3. Create the single admin account
4. Enter the main domain, public server IP, Caddy contact email and Cloudflare token
5. Sign in through `https://<domain>/login` once DNS is ready
6. Open Settings and verify domain, server IP and Cloudflare token

After the first-launch setup completes, plain HTTP requests to `http://<server-ip>` no longer serve the panel directly and are redirected to the configured primary domain.

## 6. Smoke checklist

After the first launch, verify:

- `http://<server-ip>` opens the Next.js app before DNS is ready
- `https://example.dev` opens the Next.js app
- login works and protected routes redirect correctly
- Sites overview loads site inventory and disk stats
- existing stable host opens, for example `https://app.example.dev`
- existing preview host opens, for example `https://pr-6825.app.example.dev`
- creating a site writes to `runtime/selflify.config.json`
- creating a site creates `/var/www/<site>/<main-branch>/index.html`
- `runtime/Caddyfile` changes are applied without restarting the whole stack
- Cloudflare DNS records are created or updated as expected
- cleanup worker is running

Useful commands:

```bash
docker compose ps
docker compose logs -f selflify
docker compose logs -f cleanup
docker compose logs -f caddy
```

## 7. Rollback plan

If rollout fails after deployment:

1. Stop the new stack:

```bash
docker compose down
```

2. Restore the last known-good `runtime/selflify.config.json` backup from `.selflify/backups/config`
3. Restore the last known-good `runtime/Caddyfile` backup from `.selflify/backups/caddy`
4. Start the stack again or temporarily switch traffic back to the previous setup

If a single operation fails inside the running app, Selflify already keeps:

- config snapshots in `.selflify/backups/config`
- caddy snapshots in `.selflify/backups/caddy`
- failed operation status in `runtime/selflify.config.json`

## 8. Known operational note

The current production build still emits one non-blocking Turbopack NFT warning around file-backed config path tracing. The build succeeds and the app runs, but this is still a small technical debt item worth cleaning up later.
