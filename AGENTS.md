# AGENTS

## Purpose

This repository contains `Selflify`: a filesystem-backed admin panel for managing static SPA sites, preview deploys, generated `Caddy` routing, and Cloudflare DNS records.

Use this file as the first-stop operational guide before making changes.

## Ground Rules

- Use `yarn` only. Do not introduce `npm` or `pnpm` commands.
- The stack is `Next.js App Router`, `React 19`, `TypeScript`, `Chakra UI 3`, and `next-auth`.
- The single source of truth is the active config file:
  - `runtime/selflify.config.json` in production
  - `.dev/selflify.config.json` in the full dev fixture stack
- Prefer minimal, targeted changes. The repo already has working flows for config persistence, Caddy generation, rollback, cleanup, bootstrap, and deploy smoke coverage.

## Key Runtime Facts

- Stable site URL format: `<site>.<domain>`
- Preview URL format: `<deploy>.<site>.<domain>`
- Base preview root inside containers: `/var/www`
- In dev compose, local fixtures from `.dev/var-www` are mounted into container `/var/www`
- In dev compose, `selflify`, `caddy`, and `cleanup` run together; this is the only full-fidelity preview stack
- In host-run dev mode, Caddy commands default to `docker exec selflify-dev-caddy caddy ...` unless `SELFLIFY_CADDY_BIN` is explicitly overridden
- `Caddyfile` is generated from app state, not hand-edited as the main control path
- Runtime `Caddyfile` is expected to be written with restrictive file permissions (`0600`)
- `/sites` and `/settings` intentionally lazy-load expensive metrics / DNS reads; do not move that heavy work back into the initial server render without a strong reason
- Legacy bash generators and `sites.json` are intentionally removed from the repo

## Important Files

- `src/app/`: App Router pages, layouts, route handlers, and server actions
- `src/app/actions.ts`: mutating server actions for setup, settings, sites, and deploys
- `src/auth.ts`: `next-auth` setup
- `src/components/`: reusable admin UI building blocks
- `src/components/form-submit-button.tsx`: shared confirm-dialog submit flow
- `src/lib/config/`: config schema, defaults, path resolution, persistence
- `src/lib/operations.ts`: config operation pipeline, revision checks, rollback-oriented flow
- `src/lib/sites/service.ts`: site/deploy filesystem operations, summaries, paging, and metrics
- `src/lib/system/caddy.ts`: generated `Caddyfile` rendering, validation, reload, password hashing
- `src/lib/system/cloudflare.ts`: Cloudflare DNS sync adapter
- `src/lib/auth/login-rate-limit.ts`: login throttling logic
- `bootstrap/`: base templates and seeding logic for fresh servers
- `cleanup-previews.sh`: thin launcher for the typed stale preview/orphan cleanup runtime
- `docker-compose.yml`: production stack
- `docker-compose.dev.yml`: development stack
- `docker/selflify/Dockerfile`: main app image for prod/dev/cleanup
- `.github/workflows/deploy.yml`: repo checks, bootstrap publish, bootstrap e2e, production deploy
- `e2e/runtime-smoke.spec.ts`: catches runtime console/page errors on key admin flows
- `e2e/bootstrap-install.spec.ts`: verifies bootstrap installer and first-launch flow
- `.dev/var-www/`: tracked dev fixture deploys
- `.dev/Caddyfile.example` and `.dev/selflify.config.example.json`: tracked dev runtime templates
- `branding/`: exported logo/avatar assets for the org and product

## High-Risk Files And Behaviors

- `runtime/` is gitignored mutable production state. Do not add or commit files from it.
- `.dev/selflify.config.json` and `.dev/Caddyfile` are local seeded runtime files and should stay out of commits.
- `.dev/caddy-data`, `.dev/caddy-config`, `.dev/logs` are runtime artifacts and should stay out of commits.
- The tracked `.dev/var-www/**/index.html` files are fixture content. New runtime files under `.dev` should remain ignored.
- `output/`, `coverage/`, `dist/`, and Playwright artifacts are local/build outputs; do not commit them unless the task explicitly needs versioned artifacts.

## UI Conventions

- Chakra UI is the UI library. Follow the existing component patterns.
- Forms use explicit labels above inputs. Keep that pattern.
- The main admin flow is:
  - `/setup`
  - `/login`
  - `/sites`
  - `/sites/[site]`
  - `/settings`
- `Dashboard` is a legacy redirect to `/sites`. Do not reintroduce a duplicate list view.
- Destructive actions should stay visually consistent through the shared button/dialog patterns. Do not invent one-off danger styles.

## Config And Path Rules

- `config.server.previewRootDir` is the canonical base path for sites.
- The effective preview root may still be overridden by `SELFLIFY_PREVIEW_ROOT` for direct host-side development, but the default dev path assumes the compose stack.
- Keep path handling centralized in `src/lib/config/paths.ts`.
- If you change path semantics, verify the full `docker-compose.dev.yml` stack first, then direct `yarn dev` as a secondary mode.
- In dev compose, `node_modules` and `.next` are container-owned volumes on purpose; do not revert them to host bind mounts unless you also solve cross-platform SWC/runtime issues.

## Auth And Security Rules

- Panel auth uses `next-auth` credentials strategy.
- Preview auth for site previews is separate and is implemented through `caddy hash-password`.
- Keep login UI copy generic: `Login` / `Password`, without extra “admin” wording unless the task explicitly asks for it.
- `/setup` is only for uninitialized instances. Do not reintroduce flows that leak existing secrets or silently overwrite an already configured admin.
- Login flow is rate-limited. Preserve that protection when touching auth or credentials handling.
- Never prefill an existing Cloudflare token into `/setup`.

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
yarn e2e e2e/runtime-smoke.spec.ts
yarn typecheck
yarn build
```

Useful extras:

```bash
yarn dev:prepare
yarn workflow:lint
yarn format
yarn format:check
yarn test:coverage
yarn e2e:bootstrap-install
yarn cleanup:run
yarn bootstrap:bundle
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

For routing, config, runtime, auth, or server-action changes:

- Run `yarn lint`
- Run `yarn test:run`
- Run `yarn typecheck`
- Run `yarn build`

For browser runtime stability changes:

- Run `yarn e2e e2e/runtime-smoke.spec.ts`

For Docker or dev environment changes:

- Run `docker compose -f docker-compose.dev.yml config`
- Run `docker compose config` if production compose was touched

For workflow / CI changes:

- Run `yarn workflow:lint`

## Testing Notes

- `Vitest` covers service and operation invariants.
- If you touch config operations, rollback logic, or filesystem workflows, update or add tests in `src/lib/*.test.ts`.
- If you touch Caddy generation, verify rendered paths still point at `/var/www/...` in the effective runtime.
- `Playwright` smoke tests exist for the main admin runtime and for bootstrap install.
- The deploy workflow depends on a working bootstrap installer. If you touch `bootstrap/`, `scripts/install-selflify.sh`, compose bootstrap paths, or first-launch setup, re-check the bootstrap e2e path.

## CI / Deploy Facts

- Production deploys are driven by `.github/workflows/deploy.yml`.
- Current flow is:
  - `repo-checks`
  - `publish-bootstrap`
  - `bootstrap-e2e`
  - `deploy`
- Production deploy expects the server to be bootstrapped already and to persist:
  - `runtime/selflify.config.json`
  - `runtime/Caddyfile`
- The workflow should not overwrite runtime state on the server.

## Public Repos And Website

- Main product repo: `Selflify/Selflify`
- Public website: `https://selflify.github.io/`
- Website source is maintained in the separate repo `Selflify/selflify.github.io`
- GitHub org overview content lives in `Selflify/.github`
- Do not assume edits to the public website belong in this repo unless the task explicitly says so

## Commit Hygiene

- Keep commits focused by change type.
- Before committing, check `git status` for accidental runtime diffs.
- Pay special attention to:
  - `runtime/`
  - `.dev/selflify.config.json`
  - `.dev/Caddyfile`
  - generated `.dev` runtime state
  - build/test artifacts in `output/`, `coverage/`, `dist/`

## When In Doubt

- Prefer changing typed config/schema/service layers over scattering ad-hoc logic in pages.
- Prefer preserving current operational behavior over “cleaner” abstractions that skip rollback, revision checks, or runtime safety.
