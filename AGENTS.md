# AGENTS

## Purpose

This repository contains `Selflify`: a filesystem-backed admin panel for managing static SPA sites, preview deploys, Caddy routing, and Cloudflare DNS records.

Use this file as the first-stop operational guide before making changes.

## Ground Rules

- Use `yarn` only. Do not introduce `npm` or `pnpm` commands.
- The app is built with `Next.js App Router`, `React 19`, `TypeScript`, `Chakra UI 3`, and `next-auth`.
- The single source of truth is `selflify.config.json`.
- `sites.json` is legacy migration input only. Do not build new runtime logic around it.
- Prefer minimal, targeted changes. This project already has working runtime flows for config persistence, Caddy generation, backups, rollback, and cleanup.

## Key Runtime Facts

- Stable site URL format: `<site>.<domain>`
- Preview URL format: `<deploy>.<site>.<domain>`
- Base preview root inside containers: `/var/www`
- In dev compose, local fixtures from `.dev/var-www` are mounted into container `/var/www`
- In dev compose, `selflify`, `caddy`, and `cleanup` run together; this is the only full-fidelity preview stack
- In host-run dev mode, Caddy commands default to `docker exec selflify-dev-caddy caddy ...` unless `SELFLIFY_CADDY_BIN` is explicitly overridden
- Caddy config is generated from app state, not hand-edited as the main control path

## Important Files

- `app/`: App Router pages, layouts, and server actions
- `app/actions.ts`: mutating server actions for setup, settings, sites, and deploys
- `auth.ts`: `next-auth` setup
- `components/`: admin UI building blocks
- `lib/config/`: config schema, defaults, path resolution, persistence
- `lib/operations.ts`: config operation pipeline, revision checks, rollback-oriented flow
- `lib/sites/service.ts`: site/deploy filesystem operations and summaries
- `lib/system/caddy.ts`: Caddyfile generation, validation, reload, password hashing
- `lib/system/cloudflare.ts`: Cloudflare DNS sync adapter
- `cleanup-previews.sh`: stale preview/orphan cleanup script
- `docker-compose.yml`: production stack
- `docker-compose.dev.yml`: development stack
- `docker/selflify/Dockerfile`: main app image for prod/dev/cleanup
- `.dev/var-www/`: tracked dev fixture deploys

## High-Risk Files And Behaviors

- `selflify.config.json` is file-backed runtime state. Running the app can mutate it.
- `.dev/Caddyfile` is also runtime-generated in development.
- Do not commit incidental runtime mutations to `selflify.config.json` or `.dev/Caddyfile` unless the task explicitly requires changing the seeded examples.
- `.dev/caddy-data`, `.dev/caddy-config`, `.dev/logs` are runtime artifacts and should stay out of commits.
- `.dev/var-www/**/index.html` files are tracked fixture content. Other runtime files under `.dev/var-www` should remain ignored.

## UI Conventions

- Chakra UI is the UI library. Follow the existing component patterns.
- Forms currently use explicit labels above inputs. Keep that pattern.
- The main admin flow is:
  - `/setup`
  - `/login`
  - `/sites`
  - `/sites/[site]`
  - `/settings`
- `Dashboard` is a legacy redirect to `/sites`. Do not reintroduce a duplicate list view.

## Config And Path Rules

- `config.server.previewRootDir` is the canonical base path for sites.
- The effective preview root may still be overridden by `SELFLIFY_PREVIEW_ROOT` for direct host-side development, but the default dev path assumes the compose stack.
- Keep path handling centralized in `lib/config/paths.ts`.
- If you change path semantics, verify the full `docker-compose.dev.yml` stack first, then direct `yarn dev` as a secondary mode.
- In dev compose, `node_modules` and `.next` are container-owned volumes on purpose; do not revert them to host bind mounts unless you also solve cross-platform SWC/runtime issues.

## Auth Rules

- Panel auth uses `next-auth` credentials strategy.
- Preview auth for site previews is separate and is implemented through `caddy hash-password`.
- Keep login UI copy generic: `Login` / `Password`, without extra “admin” wording unless the task explicitly asks for it.

## Commands

Install:

```bash
yarn install
```

Run locally:

```bash
yarn dev --hostname 127.0.0.1 --port 3100
```

Run checks:

```bash
yarn lint
yarn test:run
yarn typecheck
yarn build
```

Useful extras:

```bash
yarn format
yarn format:check
yarn test:coverage
docker compose -f docker-compose.dev.yml config
docker compose config
```

## Change Checklist

For UI-only changes:

- Run `yarn lint`

For TypeScript or logic changes:

- Run `yarn lint`
- Run `yarn test:run`
- Run `yarn typecheck`

For routing, config, or runtime changes:

- Run `yarn lint`
- Run `yarn test:run`
- Run `yarn typecheck`
- Run `yarn build`

For Docker or dev environment changes:

- Run `docker compose -f docker-compose.dev.yml config`
- Run `docker compose config` if production compose was touched

## Testing Notes

- `Vitest` covers service and operation invariants.
- If you touch config operations, rollback logic, or filesystem workflows, update or add tests in `lib/*.test.ts`.
- If you touch Caddy generation, verify rendered paths still point at `/var/www/...` in the effective runtime.

## Commit Hygiene

- Keep commits focused by change type.
- Before committing, check `git status` for accidental runtime diffs.
- Pay special attention to:
  - `selflify.config.json`
  - `.dev/Caddyfile`
  - generated `.dev` runtime state

## When In Doubt

- Prefer changing typed config/schema/service layers over scattering ad-hoc logic in pages.
- Prefer preserving current operational behavior over “cleaner” abstractions that skip rollback, revision checks, or runtime safety.
