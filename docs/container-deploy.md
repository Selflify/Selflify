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

Use Docker Engine 25 or newer. The runner mounts the local Docker socket. Enable it on a host where the Selflify administrator is trusted to deploy code. Application containers join a separate network shared with Caddy and the runner. They get no Docker socket, Selflify mounts, or published host ports. The runner sets CPU, memory, process and log limits. This setup is for trusted images on a single host. Applications need to listen on all container interfaces and use the configured internal port, passed as `PORT`.

## Store application data

For SQLite, configure your application to open `/var/lib/app/app.sqlite` and give the user that runs the application write access to `/var/lib/app`. For example, in an image that runs as the `node` user, add these lines before the startup command.

```dockerfile
RUN mkdir -p /var/lib/app && chown node:node /var/lib/app
USER node
```

Run the directory setup as root, before switching to `USER node`. A Dockerfile `VOLUME` declaration is optional. If the image already declares `VOLUME ["/var/lib/app"]`, add a mount with that exact path in Selflify. The application must still listen on `0.0.0.0` using `PORT` and serve the configured HTTP health endpoint.

In Selflify, open the site and go to **Configuration → Container → Persistent volumes**. Select **Add volume**, enter `database` as the **Volume name** and `/var/lib/app` as the **Container path**, then save. Publish the image by digest in **Deploys**. Selflify handles the Docker mount when it starts the release.

Docker creates the named volume on the Selflify host when you publish the image. Keep the same name on the same site to reuse the data. Removing a mount or deleting a site leaves the volume on the host. A new site has its own volumes, even if it reuses the same subdomain. Back up the database separately.

The deployed image still needs an HTTP health endpoint. For a standalone database such as PostgreSQL, run it as a separate service and pass its connection string to your application as an environment secret.

## Deploy Storybook from account

1. Create or open the Storybook site. Open **Configuration → Container** and enter the image repository from the `storybook-image.txt` artifact, omitting the `@sha256:…` suffix. Set port `3000` and health check path `/healthz`.
2. If the GitLab registry is private, enter a username and token with read access to that repository. Under **Environment & secrets**, add `MCP_ACCESS_TOKEN` as a secret. If the client sends an Origin header, add `MCP_ALLOWED_ORIGIN` as a variable.
3. In **Deploys**, paste the complete reference from `storybook-image.txt` into **Image digest reference** and select **Deploy image**. The stable domain switches when the new process returns HTTP 2xx from `/healthz`. Open Storybook at the site root and configure the MCP client with `https://<stable-host>/mcp` and `Authorization: Bearer <MCP_ACCESS_TOKEN>`.
4. To publish from CI, create a token with **Allow container deployments** as its only permission. Store it as `SELFLIFY_DEPLOY_TOKEN` and set `SELFLIFY_SERVER` to the panel origin. Use the CLI version that includes `deploy-image`:

   ```sh
   selflify deploy-image "$(cat storybook-image.txt)" --site storybook
   ```

   The equivalent endpoint is `POST /api/deploy/v1/images` on the panel origin. It takes JSON with `site` and `image` and returns the published release and stable URL. Wait for a successful response before running checks against the stable URL.

## Update and roll back

A failed pull, readiness check, or Caddy apply leaves the previous route in use. The Deploys view shows the active and previous image. Saving settings affects subsequent deployments. To apply new settings to the same image, publish its digest again from the panel. A CI deployment of the active digest reuses that release if the volume mounts are unchanged.

If either release uses volumes, Selflify stops the current container before starting the other one. Expect a service interruption during this switch. If the switch fails, Selflify starts the previous active container again. **Rollback** restores the previous image and its volume mounts. Any database writes or schema migrations made by the newer image remain in the volume.

Secret values are stored in protected files next to the runtime config. The panel shows variable values and masks stored secrets. Existing environment entries appear under **Secrets**. Previous versions of the secret files are kept for restoring config backups. Revoke old registry tokens at the registry when rotating them. Open **View container logs** in the active release to see recent output.
