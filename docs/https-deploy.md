# HTTPS deployments

Selflify accepts static builds through a separate upload service. The CLI package is maintained in `packages/selflify-cli`. Existing SSH uploads continue to work for deployments which have not been published through the API.

## Deploy from CI

First, open the site's Configuration screen and create a deploy token. Choose an expiry date within the next year. Preview access is enabled, and stable access requires a separate checkbox. Copy the token when it is shown and store it as `SELFLIFY_DEPLOY_TOKEN` in your CI secrets.

Second, install `@selflify/selflify-cli` as a development dependency in the project that produces the build. Set `SELFLIFY_SERVER` to the HTTPS origin of the panel.

Third, run the command after building the site:

```bash
yarn selflify deploy ./dist --site app --deploy pr-123
```

The main branch name selects stable. The server checks the current main branch again when publishing, so a preview token cannot publish to a branch which became stable during the upload.

The package is prepared for publication from this repository. Before its first registry release, run the source directly with `node packages/selflify-cli/bin/selflify.mjs` or install the archive produced by `yarn workspace @selflify/selflify-cli pack`.

## Storage and publication

The active config remains the source of site settings and token permissions. Tokens contain 32 random bytes, and config stores their SHA-256 hashes. Newly created sites have an immutable deployment ID. Existing sites use an ID derived from their slug and creation time, so recreating a slug does not restore its old tokens.

The panel writes a minimal projection to `runtime/deploy-permissions/permissions.json`. The projection contains site IDs, slugs, main branch names, the domain, preview root and token hashes. It contains no panel credentials or Cloudflare secrets. Config writes first replace the projection with an empty permission set, then write config and restore the projection. A crash between writes denies uploads until startup prepares permissions again.

Archives are staged under `<previewRoot>/.selflify-uploads/<uploadId>`. Published builds are stored under `<previewRoot>/<site>/<deploy>/.selflify/releases/<uploadId>`. A relative `.selflify/current` symlink selects the active build. The service creates that link and replaces it atomically. Client archives cannot contain links.

Caddy checks for the managed build and uses it as the file root. Before the first API publication, Caddy serves existing files from the original deploy directory. Those legacy files remain on disk after publication. Subsequent rsync writes to the legacy root do not change the managed build; use the CLI for that deploy after migration.

Requests to `.selflify` paths return 404. The service rejects symlinks in publication directories and verifies archive paths before writing files. Publication, site mutations and cleanup share a filesystem lock under `runtime/deploy-coordination`, with a heartbeat and recovery after an abandoned lease.

Cleanup keeps the current release, the most recent previous release and releases less than a day old. Preview TTL still applies to the whole deploy directory. Retaining previous releases does not make their assets available through the active URL. Use content-hashed assets, and account for requests from already open pages when replacing a build.

## Docker isolation

Production compose includes `deploy-init` and `upload`. The init service prepares writable site directories, generates routing and projects permissions before the other services start. The upload service runs as UID 10001 with group 0. Its root filesystem is read-only, all capabilities are dropped, and privilege escalation is disabled.

The upload container mounts only the preview root, the read-only permission directory, coordination directory and its state volume. It has no panel config, panel environment secrets, Caddy configuration or Docker socket. Caddy's admin listener uses a Unix socket mounted only into the panel and Caddy containers, so the upload service cannot call the admin API over the network.

The upload service can write to every site's storage. A compromise of that process can therefore affect all sites. The service does not execute uploaded builds or user commands.

The two additional GHCR packages, `selflify-upload` and `selflify-deploy-init`, must be public before unauthenticated bootstrap installations can pull them. The deploy workflow builds both images.

For development, prepare the fixture files before starting the compose stack:

```bash
yarn dev:prepare
docker compose -f docker-compose.dev.yml up --build
```

The local CLI can use `http://127.0.0.1:8080` with `--allow-local-http`. Host-run panel development does not start an upload service. If you point a host-run panel at the compose Caddy instance, set `SELFLIFY_CADDY_ADMIN_BIND=unix//run/caddy-admin/admin.sock` so generated configuration preserves socket isolation. Containerized Caddy commands use that address inside the container.

## API contract

All endpoints require `Authorization: Bearer <deploy-token>`. API versions are part of the URL.

| Method and endpoint                       | Body                                                       | Result                                           |
| ----------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------ |
| `POST /api/deploy/v1/uploads`             | JSON with `site`, `deploy`, compressed `size` and `sha256` | Upload ID and state. Requires `Idempotency-Key`. |
| `PUT /api/deploy/v1/uploads/:id/content`  | Gzip tar stream with matching `Content-Length`             | Validated upload state.                          |
| `POST /api/deploy/v1/uploads/:id/publish` | Empty                                                      | Published state, timestamp and URL.              |
| `GET /api/deploy/v1/uploads/:id`          | Empty                                                      | Current state and publication result.            |

An upload belongs to the token that created it. Every request checks token expiry, revocation, site identity and scope. Publication repeats those checks under the same lock used by token revocation.

The service journals publication before switching the pointer. After a crash, it compares the pointer with the journal and records the completed publication or marks it failed. A retry of a completed publication returns its existing result, including when a newer build has since been deployed.

## Limits and operations

The service accepts up to four pending uploads, with up to two content transfers at once. Archives are limited to 128 MiB compressed and 512 MiB of file contents. Paths are limited to 512 characters, with at most 20,000 entries. Expanded tar headers and padding are also bounded. A transfer has a five-minute deadline.

Pending uploads expire after 30 minutes. A periodic worker removes staging data. Upload records expire after seven days, and creation stops at 5,000 records. The service reserves enough disk headroom for all pending builds before accepting another upload. Authenticated upload creation is limited to ten requests per token per minute. Caddy-proxied requests share a global budget of 600 per minute.

The panel lazily reads last token use and the latest 20 upload records when Configuration is opened. Structured container logs contain token IDs, upload IDs and deployment metadata, but no token secrets or request bodies. Docker rotates upload logs at 10 MB and keeps three files.

Use one upload service per instance on a local filesystem. Multiple upload replicas are not supported because in-progress transfer ownership is held in process memory. Do not run rsync or other filesystem writers concurrently against managed releases, because they do not acquire Selflify's lock.

The full deployment browser test requires an initialized stack and test credentials. It creates a temporary site, publishes preview and stable builds, revokes a token and removes the site. In dev compose the panel and upload API use different ports:

```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 \
E2E_DEPLOY_SERVER=http://127.0.0.1:8080 \
yarn e2e:deploy
```

Set `E2E_SETUP_LOGIN`, `E2E_SETUP_PASSWORD` and `E2E_PRIMARY_DOMAIN` when the test instance uses different values. Use a dedicated fixture instance for this test.

To verify the implementation:

```bash
yarn lint
yarn test:run
yarn cli:test
yarn typecheck
yarn build
SELFLIFY_TEST_CADDY_HTTP=1 yarn test:run src/lib/system/caddy.http.test.ts
yarn e2e e2e/runtime-smoke.spec.ts
docker compose -f docker-compose.dev.yml config
docker compose config
yarn workflow:lint
```
