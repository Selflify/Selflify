# Deploy HTTP containers

Selflify can serve a site's stable domain and alias from a Docker image pinned by SHA-256 digest. The existing upload path serves static PR previews.

## Enable the runner

On a Selflify host with the updated Compose file and images, run:

```sh
touch runtime/enable-containers
docker compose --profile containers pull
docker compose --profile containers up -d
```

The production workflow uses the marker to keep the profile enabled during updates. For local development, run `docker compose -f docker-compose.dev.yml --profile containers up --build`.

Use Docker Engine 25 or newer. The runner mounts the local Docker socket. Enable it on a host where the Selflify administrator is trusted to deploy code. Application containers join a separate network shared with Caddy and the runner. They get no Docker socket, Selflify mounts, or published host ports. The runner sets CPU, memory, process and log limits. This setup is for trusted images on a single host. Applications need to listen on all container interfaces and use the configured internal port, passed as `PORT`. Keep durable data in external services.

## Deploy Storybook from account

1. Create or open the Storybook site. Open **Configuration → Container** and enter the image repository from the `storybook-image.txt` artifact, omitting the `@sha256:…` suffix. Set port `3000` and health check path `/healthz`.
2. If the GitLab registry is private, enter a username and token with read access to that repository. In **Environment variables**, enter a JSON object with `MCP_ACCESS_TOKEN` set to the token the Storybook client will use. If the client sends an Origin header, also set `MCP_ALLOWED_ORIGIN` to the allowed origin.
3. In **Deploys**, paste the complete reference from `storybook-image.txt` into **Image digest reference** and select **Deploy image**. The stable domain switches when the new process returns HTTP 2xx from `/healthz`. Open Storybook at the site root and configure the MCP client with `https://<stable-host>/mcp` and `Authorization: Bearer <MCP_ACCESS_TOKEN>`.
4. To publish from CI, create a token with **Allow container deployments** as its only permission. Store it as `SELFLIFY_DEPLOY_TOKEN` and set `SELFLIFY_SERVER` to the panel origin. Use the CLI version that includes `deploy-image`:

   ```sh
   selflify deploy-image "$(cat storybook-image.txt)" --site storybook
   ```

   The equivalent endpoint is `POST /api/deploy/v1/images` on the panel origin. It takes JSON with `site` and `image` and returns the published release and stable URL. Wait for a successful response before running checks against the stable URL.

## Update and roll back

A failed pull, readiness check, or Caddy apply leaves the previous route in use. The Deploys view shows the active and previous image. **Rollback** checks the previous process before restoring its route. Saving settings affects subsequent deployments. To apply new settings to the same image, publish its digest again from the panel. A CI retry for the already active digest returns that release.

Secret values are stored in protected files next to the runtime config. The panel shows variable names and whether registry credentials are configured. Previous versions of the secret files are kept for restoring config backups. Revoke old registry tokens at the registry when rotating them. Open **View container logs** in the active release to see recent output.
