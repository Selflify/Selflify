# MCP access

Selflify serves a remote MCP endpoint at `https://<panel-domain>/mcp`. Agents can read site settings and storage statistics, check a deployment, change site settings and manage publication of a local build. Each connection grants access to selected sites or all sites. A separate user account is not required.

The endpoint uses Streamable HTTP with JSON responses and no persistent client sessions. It accepts POST requests. GET and DELETE return 405. Browser sessions do not authenticate MCP requests.

## Authorize a connection

OAuth-capable MCP clients can connect without a manually supplied token. Selflify publishes discovery metadata and supports registration of public clients. The client opens `/mcp/authorize`, where the owner signs in and chooses sites and permissions before approving the connection.

Selected sites are identified by their deployment IDs. Deleting and recreating a site with the same slug does not restore access. All sites includes current sites and sites created later. The consent page states that behavior before approval.

Read access is required. Other permissions start disabled, and the owner can grant only permissions requested by the client.

| Permission            | Access                                                                                                          |
| --------------------- | --------------------------------------------------------------------------------------------------------------- |
| Read & inspect        | Read settings, deployments and statistics, and check HTTPS availability.                                        |
| Manage settings       | Change site settings and preview password protection.                                                           |
| Deploy previews       | Upload and publish preview builds.                                                                              |
| Publish to production | Upload and publish stable builds. Also required with settings access to change the main branch or stable alias. |

OAuth uses authorization codes with S256 PKCE and an exact registered redirect address. Codes expire after five minutes and can be exchanged once. Access tokens last one hour. Refresh credentials rotate on use, and the connection expires after 30 days. Reusing a consumed refresh credential revokes the connection. Tokens are bound to this MCP resource, and refresh credentials are never projected into the upload container.

Open MCP access in the panel sidebar to inspect and revoke connections. Revocation invalidates access and refresh credentials. Settings changes check access again under the operation lock.

## Create a manual token

For clients that use explicit headers, open `/mcp/authorize` without OAuth parameters. Enter a connection name, choose sites and permissions, and select an expiry period of 7, 30 or 90 days. Copy the token when it is shown. Selflify stores its hash, and the token cannot be displayed again.

The site's Configuration screen still supports individual deploy tokens with optional MCP permissions. Existing deploy tokens do not gain MCP access automatically.

## Connect a client

Use an MCP client that supports a remote HTTP URL and an explicit Authorization header. Configure the URL as `https://<panel-domain>/mcp` and the header as `Authorization: Bearer <token>`.

For clients with a JSON configuration, the equivalent settings are:

```json
{
  "mcpServers": {
    "selflify": {
      "url": "https://panel.example.com/mcp",
      "headers": {
        "Authorization": "Bearer <token>"
      }
    }
  }
}
```

The exact configuration format depends on the client. Use its secret or environment variable storage for a manual token, and keep credentials out of version control. OAuth clients need only the endpoint URL and open Selflify's consent page to request access. The authorization server supports public clients with `token_endpoint_auth_method=none`, authorization code grants with S256 PKCE, and refresh tokens.

Discovery endpoints are `/.well-known/oauth-protected-resource/mcp` and `/.well-known/oauth-authorization-server`. Registration, token exchange and revocation are under `/mcp/oauth/register`, `/mcp/oauth/token` and `/mcp/oauth/revoke`. The MCP 401 challenge includes the resource metadata URL.

In the full development compose stack, use `http://127.0.0.1:8080/mcp`. Direct host development can use the port passed to `yarn dev`. Production requests must use the configured panel hostname. A supplied Origin header must match the panel's HTTPS origin. Development mode also permits loopback origins.

The development compose stack sets `SELFLIFY_MCP_PUBLIC_ORIGIN` to `http://127.0.0.1:8080` by default. Override it when the client reaches the stack through another origin. For direct host development, set the variable to the port used by `yarn dev`. Without an override, discovery uses `https://<configured-panel-domain>`. Plain HTTP origins are allowed only for loopback hosts in development mode. The override must contain only the origin, with no path or trailing slash.

## Available tools

Use `list_sites` to discover permitted sites. Site tools accept an optional `site` slug, which is required when the connection covers multiple sites. A connection with one permitted site keeps the previous behavior when `site` is omitted. Attempts to access an unapproved site are rejected. Tools do not accept arbitrary filesystem paths.

| Tool                 | Behavior                                                                                                                                                                   |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list_sites`         | Returns all sites accessible to the connection without calculating filesystem metrics.                                                                                     |
| `get_site`           | Returns public settings and `configRevision`.                                                                                                                              |
| `get_site_stats`     | Returns the deployment count and site size in bytes. Sizes can be cached for 90 seconds.                                                                                   |
| `list_deploys`       | Returns the stable deployment and a page of previews. Accepts `query`, `offset` and `limit`, with a maximum limit of 100. `totalCount` and `nextOffset` describe previews. |
| `check_deploy`       | Checks files and HTTPS for `deploy`, with an optional `expectedCommit`.                                                                                                    |
| `update_site`        | Sets `name` and `mainBranch`. Requires `expectedRevision`.                                                                                                                 |
| `update_site_alias`  | Sets `alias`, `autoTls` and `useCloudflare`. An empty alias removes it. Requires `expectedRevision`.                                                                       |
| `set_preview_auth`   | Sets a preview `login` and `password`. Requires `expectedRevision`.                                                                                                        |
| `reset_preview_auth` | Removes preview authentication and makes previews public. Requires `expectedRevision`.                                                                                     |
| `prepare_deploy`     | Creates an upload using `deploy`, compressed `size`, archive `sha256` and `idempotencyKey`. Returns an upload ID, absolute temporary `uploadUrl` and expiry time.          |
| `get_deploy_status`  | Reads an upload owned by the same token using `uploadId`.                                                                                                                  |
| `publish_deploy`     | Publishes a validated upload using `uploadId`. A retry returns the existing publication result.                                                                            |

Settings tools require MCP settings permission. Upload tools require MCP read permission plus the applicable preview or stable deployment permission. Upload ownership and publication permissions are enforced by the existing upload service.

## Publish without a merge request

Ask the agent to build the current working copy locally and deploy it to a named preview. A commit, push and merge request are not required. The server accepts static build files and does not execute source code or build commands.

The agent can use the existing CLI after building:

```bash
yarn selflify deploy ./dist --site app --deploy dev-feature
```

Set `SELFLIFY_SERVER` to the panel origin and provide a deploy token through `SELFLIFY_DEPLOY_TOKEN`. The CLI uploads and publishes the build. The agent can then call `check_deploy` through MCP.

An agent can also control publication through MCP. First, it creates a gzip tar archive containing `index.html` at the root and calculates its size and SHA-256 hash. Second, it calls `prepare_deploy` with those values and a unique idempotency key. Third, it sends the archive to the returned absolute `uploadUrl` using PUT and a matching Content-Length, without an Authorization header. OAuth connections require no separate deploy token, CLI credentials or manually configured API origin. Finally, it calls `publish_deploy` and checks the deployment.

The upload URL grants permission to transfer only that archive for up to 30 minutes from upload creation, and no later than the access token expiry. It cannot read status or publish a build. The server checks current site identity and deployment permissions when receiving and validating the archive. Revoking the connection or rotating its access token invalidates the URL. Treat the URL as a secret. If it expires, prepare a new upload with a new idempotency key. This flow works for every permitted site, including sites created later when the connection grants access to all sites.

Archives travel through the existing HTTPS upload API. MCP tool arguments do not carry archive bytes or local directory paths. The existing upload limits and atomic publication rules apply. See [HTTPS deployments](https-deploy.md).

The panel reaches the upload service using `SELFLIFY_UPLOAD_UPSTREAM`, which defaults to `upload:3001` in compose. For direct host development, set the variable to the reachable upload service host and port. Its value has no URL scheme or path.

## Check readiness

`check_deploy` reports file presence, `index.html`, the active managed release ID and the HTTP result. It performs a GET with a five-second timeout, does not follow redirects and does not send preview passwords. It discards the response body.

A protected deployment returns `auth_required` for HTTP 401, so `ready` remains false even when its files exist. A successful response proves availability from the Selflify server's network. It does not prove availability from every client or browser runtime correctness.

To verify a particular commit, include `__preview_commit__/<commit>` in the build and pass the same lowercase hexadecimal SHA as `expectedCommit`. The SHA must contain 40 to 64 characters. Caddy serves marker paths without the SPA fallback. Selflify checks that the marker exists in the active build and returns successfully over HTTPS. Without a marker, an HTTP 200 response alone cannot identify the build. Uncommitted builds can be identified by their managed release ID, but a Git SHA alone does not describe uncommitted changes.

Changing the main branch through MCP requires an existing deployment containing `index.html`. MCP will not create a placeholder for that change.

## Errors and limits

Read the current `configRevision` before changing settings and pass it as `expectedRevision`. A conflict requires another read before retrying. Successful changes return the committed revision, operation ID and status. A `partial` status means settings were applied but a later step, such as DNS synchronization, failed. Inspect the operation status in the panel.

The endpoint accepts JSON bodies up to 64 KiB and allows eight active requests per process. It limits requests to 60 per token per minute and 600 total per process per minute. Rate limits reset on process restart. The upload service has its own transfer and publication limits.

Tool failures use MCP's `isError` result. Authentication failures before protocol handling return HTTP 401 or 403. Gateway errors returned to agents omit internal commands, paths and credentials. Mutation logs contain tool names and token IDs without input values or secrets. Server tokens, password hashes and local storage paths are omitted from tool results.
