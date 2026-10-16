import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { SelflifyConfig, SiteConfig } from "@/lib/config/schema";
import { deployNamePattern, siteSlugPattern } from "@/lib/config/schema";
import { readSelflifyConfig } from "@/lib/config/service";
import { ConfigConflictError, type ConfigOperationContext } from "@/lib/operations";
import { authorizeMcp, McpAccessError } from "@/lib/mcp/auth";
import { assertSiteStorage, checkDeploy, readDeployFiles } from "@/lib/mcp/deploy-check";
import {
  getDeploySummary,
  getSiteSummary,
  getStableUrl,
  listPreviewDeployPage,
} from "@/lib/sites/service";
import {
  resetSitePreviewAccess,
  updateSite,
  updateSitePreviewAccess,
  updateSiteStableAlias,
} from "@/lib/use-cases/sites";
import { isValidHostname } from "@/lib/utils/hostname";

type Auth = ReturnType<typeof authorizeMcp>;
type Data = Record<string, unknown>;
const deployField = z.string().regex(deployNamePattern);
const siteField = z
  .string()
  .regex(siteSlugPattern)
  .optional()
  .describe("Site slug. Required when the token grants access to multiple sites.");
const revisionField = z.number().int().nonnegative();
const readAnnotations = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };

function publicSite(config: SelflifyConfig, site: SiteConfig) {
  return {
    slug: site.slug,
    name: site.name,
    mainBranch: site.mainBranch,
    stableUrl: getStableUrl(config, site),
    stableAlias: site.stableAlias,
    stableAliasAutoTls: site.stableAliasAutoTls,
    stableAliasUseCloudflare: site.stableAliasUseCloudflare,
    previewAuthEnabled: site.previewAuth.enabled,
    createdAt: site.createdAt,
    updatedAt: site.updatedAt,
    configRevision: config.configRevision,
  };
}

function requireStable(auth: Auth) {
  if (!auth.token.scopes.includes("stable:write")) {
    throw new McpAccessError(403, "Stable deployment permission is required.");
  }
}

function toolError(error: unknown) {
  const code =
    error instanceof ConfigConflictError
      ? "config_conflict"
      : error instanceof McpAccessError
        ? `access_${error.status}`
        : "operation_failed";
  // Gateway errors can include paths, commands or credentials. Keep those in the panel.
  const message =
    error instanceof ConfigConflictError || error instanceof McpAccessError
      ? error.message
      : "Operation failed. Inspect the operation status in Selflify.";
  return {
    isError: true,
    content: [{ type: "text" as const, text: JSON.stringify({ code, message }) }],
  };
}

// The upload service still owns permission checks, ownership, validation and publication.
async function uploadRequest(
  authorization: string,
  endpoint: string,
  method: string,
  body?: Data,
  key?: string,
) {
  const upstream = process.env.SELFLIFY_UPLOAD_UPSTREAM ?? "upload:3001";
  let response: Response;
  try {
    response = await fetch(`http://${upstream}/api/deploy/v1/uploads${endpoint}`, {
      method,
      headers: {
        Authorization: authorization,
        "Content-Type": "application/json",
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new McpAccessError(
      503,
      "Upload service is unavailable. Retry using the same upload ID or idempotency key.",
    );
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new McpAccessError(
      response.status,
      "Upload request rejected. Check token permissions and upload state.",
    );
  }
  const result = z
    .object({
      id: z.string().uuid(),
      state: z.string(),
      url: z.string().optional(),
      publishedAt: z.string().optional(),
    })
    .parse(await response.json());
  return result;
}

export function createSelflifyMcpServer(authorization: string) {
  const server = new McpServer(
    { name: "selflify", version: "0.1.0" },
    {
      instructions:
        "Use list_sites to discover permitted sites. Pass site to site tools when access includes multiple sites. Build static files locally and transfer archives with the Selflify CLI or HTTPS upload URL. Read configRevision before settings changes. check_deploy observes HTTPS from the server without preview passwords. Publication status alone does not prove HTTPS readiness.",
    },
  );

  async function execute(
    name: string,
    run: (config: SelflifyConfig, auth: Auth) => Promise<Data>,
    write = false,
    siteSlug?: string,
  ) {
    let tokenId: string | undefined;
    try {
      const config = await readSelflifyConfig();
      const auth = authorizeMcp(config, authorization, write ? "mcp:write" : "mcp:read", siteSlug);
      if (
        siteSlug === undefined &&
        auth.sites.length !== 1 &&
        !["list_sites", "get_deploy_status", "publish_deploy"].includes(name)
      ) {
        throw new McpAccessError(
          400,
          "Pass a site slug. Use list_sites to discover permitted sites.",
        );
      }
      tokenId = auth.token.id;
      const data = await run(config, auth);
      if (write || name === "prepare_deploy" || name === "publish_deploy") {
        console.info(
          JSON.stringify({
            event: "mcp-operation",
            tool: name,
            tokenId,
            site: siteSlug ?? (auth.sites.length === 1 ? auth.site.slug : undefined),
            status: typeof data.status === "string" ? data.status : "completed",
            operationId: data.operationId,
          }),
        );
      }
      return {
        content: [{ type: "text" as const, text: JSON.stringify(data) }],
        structuredContent: data,
      };
    } catch (error) {
      console.info(
        JSON.stringify({ event: "mcp-operation", tool: name, tokenId, status: "failed" }),
      );
      return toolError(error);
    }
  }

  async function change(
    auth: Auth,
    run: (context: ConfigOperationContext) => Promise<unknown>,
    guard?: (config: SelflifyConfig, fresh: Auth) => void | Promise<void>,
  ): Promise<Data> {
    let applied: Data | undefined;
    await run({
      authorize: async (config) => {
        const fresh = authorizeMcp(config, authorization, "mcp:write", auth.site.slug);
        if (fresh.site.slug !== auth.site.slug)
          throw new McpAccessError(403, "Site access changed.");
        await assertSiteStorage(config, fresh.site);
        await guard?.(config, fresh);
      },
      onApplied: (config) => {
        const site = config.sites.find((entry) => entry.slug === auth.site.slug)!;
        applied = {
          site: publicSite(config, site),
          operationId: config.operations.lastOperationId,
          status: config.operations.lastStatus,
          message:
            config.operations.lastStatus === "partial"
              ? "Settings applied, but a post-apply step failed. Inspect Selflify."
              : null,
        };
      },
    });
    if (!applied) throw new Error("Missing operation result.");
    return applied;
  }

  server.registerTool(
    "list_sites",
    {
      description: "List sites accessible with this token. Does not calculate filesystem metrics.",
      inputSchema: {},
      annotations: readAnnotations,
    },
    async () =>
      execute("list_sites", async (config, auth) => ({
        sites: auth.sites.map((site) => publicSite(config, site)),
      })),
  );

  server.registerTool(
    "get_site",
    {
      description: "Read permitted site settings and current configRevision. Secrets are omitted.",
      inputSchema: { site: siteField },
      annotations: readAnnotations,
    },
    async ({ site }) =>
      execute(
        "get_site",
        async (config, auth) => ({ site: publicSite(config, auth.site) }),
        false,
        site,
      ),
  );

  server.registerTool(
    "get_site_stats",
    {
      description:
        "Calculate this site's deploy count and filesystem usage. Size metrics may be cached for 90 seconds; this is not visitor analytics.",
      inputSchema: { site: siteField },
      annotations: readAnnotations,
    },
    async ({ site }) =>
      execute(
        "get_site_stats",
        async (config, auth) => {
          await assertSiteStorage(config, auth.site);
          const summary = await getSiteSummary(config, auth.site);
          return {
            site: auth.site.slug,
            deployCount: summary.deployCount,
            totalSizeBytes: summary.totalSizeBytes,
            measuredAt: new Date().toISOString(),
          };
        },
        false,
        site,
      ),
  );

  server.registerTool(
    "list_deploys",
    {
      description: "Read the stable deployment and a paginated list of previews for this site.",
      inputSchema: {
        site: siteField,
        query: z.string().max(120).default(""),
        offset: z.number().int().nonnegative().default(0),
        limit: z.number().int().min(1).max(100).default(20),
      },
      annotations: readAnnotations,
    },
    async (args) =>
      execute(
        "list_deploys",
        async (config, auth) => {
          await assertSiteStorage(config, auth.site);
          await readDeployFiles(config, auth.site, auth.site.mainBranch);
          const [page, stable] = await Promise.all([
            listPreviewDeployPage(config, auth.site, args),
            getDeploySummary(config, auth.site, auth.site.mainBranch),
          ]);
          const safe = (entry: NonNullable<typeof stable>) => ({
            name: entry.name,
            url: entry.url,
            isMainBranch: entry.isMainBranch,
            sizeBytes: entry.sizeBytes,
            modifiedAt: entry.modifiedAt,
          });
          return {
            stable: stable ? safe(stable) : null,
            items: page.items.map(safe),
            totalCount: page.totalCount,
            nextOffset: page.nextOffset,
          };
        },
        false,
        args.site,
      ),
  );

  server.registerTool(
    "check_deploy",
    {
      description:
        "Check files, active release and HTTPS from the server. Optionally verify an expected commit marker. Does not follow redirects or bypass preview auth.",
      inputSchema: {
        site: siteField,
        deploy: deployField,
        expectedCommit: z
          .string()
          .regex(/^[a-f0-9]{40,64}$/)
          .optional(),
      },
      annotations: { ...readAnnotations, openWorldHint: true },
    },
    async ({ site, deploy, expectedCommit }) =>
      execute(
        "check_deploy",
        (config, auth) => checkDeploy(config, auth.site, deploy, expectedCommit),
        false,
        site,
      ),
  );

  server.registerTool(
    "update_site",
    {
      description:
        "Update site name and main branch using expectedRevision. A main branch change requires stable:write and an existing build containing index.html.",
      inputSchema: {
        site: siteField,
        name: z.string().trim().min(1).max(120),
        mainBranch: deployField,
        expectedRevision: revisionField,
      },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    async ({ site, name, mainBranch, expectedRevision }) =>
      execute(
        "update_site",
        async (_config, auth) =>
          change(
            auth,
            (context) =>
              updateSite(auth.site.slug, { name, mainBranch }, expectedRevision, context),
            async (config, fresh) => {
              if (mainBranch === fresh.site.mainBranch) {
                await readDeployFiles(config, fresh.site, mainBranch);
                return;
              }
              requireStable(fresh);
              if (!(await readDeployFiles(config, fresh.site, mainBranch)).hasIndex) {
                throw new McpAccessError(
                  409,
                  "The requested main branch has no index.html. Publish a build first.",
                );
              }
            },
          ),
        true,
        site,
      ),
  );

  server.registerTool(
    "update_site_alias",
    {
      description:
        "Update the stable alias. Requires mcp:write, stable:write and expectedRevision. Empty alias removes it.",
      inputSchema: {
        site: siteField,
        alias: z
          .string()
          .trim()
          .max(253)
          .refine((value) => !value || isValidHostname(value)),
        autoTls: z.boolean(),
        useCloudflare: z.boolean(),
        expectedRevision: revisionField,
      },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    async ({ site, alias, autoTls, useCloudflare, expectedRevision }) =>
      execute(
        "update_site_alias",
        async (_config, auth) =>
          change(
            auth,
            (context) =>
              updateSiteStableAlias(
                auth.site.slug,
                {
                  stableAlias: alias,
                  stableAliasAutoTls: autoTls,
                  stableAliasUseCloudflare: useCloudflare,
                },
                expectedRevision,
                context,
              ),
            (_config, fresh) => requireStable(fresh),
          ),
        true,
        site,
      ),
  );

  server.registerTool(
    "set_preview_auth",
    {
      description:
        "Enable or update preview access. Password is required and never returned. Requires mcp:write and expectedRevision.",
      inputSchema: {
        site: siteField,
        login: z
          .string()
          .trim()
          .min(1)
          .max(128)
          .regex(/^[A-Za-z0-9_.@-]+$/),
        password: z.string().min(8).max(128),
        expectedRevision: revisionField,
      },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    async ({ site, login, password, expectedRevision }) =>
      execute(
        "set_preview_auth",
        async (_config, auth) =>
          change(auth, (context) =>
            updateSitePreviewAccess(
              auth.site.slug,
              { previewLogin: login, previewPassword: password },
              expectedRevision,
              context,
            ),
          ),
        true,
        site,
      ),
  );

  server.registerTool(
    "reset_preview_auth",
    {
      description:
        "Remove preview authentication, making previews public. Requires mcp:write and expectedRevision.",
      inputSchema: { site: siteField, expectedRevision: revisionField },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    async ({ site, expectedRevision }) =>
      execute(
        "reset_preview_auth",
        async (_config, auth) =>
          change(auth, (context) =>
            resetSitePreviewAccess(auth.site.slug, expectedRevision, context),
          ),
        true,
        site,
      ),
  );

  server.registerTool(
    "prepare_deploy",
    {
      description:
        "Create an upload for a locally built gzip tar archive. Returns a relative HTTPS upload path; send the archive outside MCP with PUT and the same bearer token. Requires preview:write or stable:write. Reuse idempotencyKey on retries.",
      inputSchema: {
        site: siteField,
        deploy: deployField,
        size: z
          .number()
          .int()
          .positive()
          .max(128 * 1024 * 1024),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{16,128}$/),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ site, deploy, size, sha256, idempotencyKey }) =>
      execute(
        "prepare_deploy",
        async (_config, auth) => {
          const upload = await uploadRequest(
            authorization,
            "",
            "POST",
            { site: auth.site.slug, deploy, size, sha256 },
            idempotencyKey,
          );
          return {
            ...upload,
            uploadPath: `/api/deploy/v1/uploads/${upload.id}/content`,
            uploadMethod: "PUT",
            contentLength: size,
          };
        },
        false,
        site,
      ),
  );

  server.registerTool(
    "get_deploy_status",
    {
      description:
        "Read the status of an upload owned by this token. Publication status does not prove HTTPS readiness.",
      inputSchema: { uploadId: z.string().uuid() },
      annotations: readAnnotations,
    },
    async ({ uploadId }) =>
      execute("get_deploy_status", async () => uploadRequest(authorization, `/${uploadId}`, "GET")),
  );

  server.registerTool(
    "publish_deploy",
    {
      description:
        "Atomically publish a validated upload owned by this token. Environment permissions are checked again by the upload service. Then use check_deploy to verify HTTPS readiness.",
      inputSchema: { uploadId: z.string().uuid() },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ uploadId }) =>
      execute("publish_deploy", async () =>
        uploadRequest(authorization, `/${uploadId}/publish`, "POST"),
      ),
  );

  return server;
}
