import crypto from "node:crypto";

import type { SelflifyConfig } from "@/lib/config/schema";
import { getDeploymentSiteId, hashDeploySecret, tokenAllowsSite } from "@/lib/deploy/permissions";
import { mcpResource } from "@/lib/mcp/oauth-urls";

export class McpAccessError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// Re-run this against the current config inside the operation lock before writes.
export function authorizeMcp(
  config: SelflifyConfig,
  authorization: string | null,
  scope: "mcp:read" | "mcp:write" = "mcp:read",
  siteSlug?: string,
) {
  const match = /^Bearer slf_([a-f0-9-]{36})\.([A-Za-z0-9_-]{43})$/.exec(authorization ?? "");
  if (!match) throw new McpAccessError(401, "Invalid MCP token.");
  const token = config.deployTokens.find((entry) => entry.id === match[1]);
  const supplied = Buffer.from(hashDeploySecret(match[2]), "hex");
  const expected = Buffer.from(token?.secretHash ?? "0".repeat(64), "hex");
  if (
    !crypto.timingSafeEqual(supplied, expected) ||
    !token ||
    token.revokedAt ||
    Date.parse(token.expiresAt) <= Date.now() ||
    (token.oauth && token.oauth.resource !== mcpResource(config)) ||
    !config.admin.login ||
    !config.admin.passwordHash
  ) {
    throw new McpAccessError(401, "Invalid MCP token.");
  }
  if (!token.scopes.includes("mcp:read") || !token.scopes.includes(scope)) {
    throw new McpAccessError(403, "Token does not grant this MCP permission.");
  }
  const sites = config.sites.filter((entry) => tokenAllowsSite(token, getDeploymentSiteId(entry)));
  const site = siteSlug ? sites.find((entry) => entry.slug === siteSlug) : sites[0];
  if (siteSlug && !site) throw new McpAccessError(403, "Token does not grant access to this site.");
  if (!sites.length && !token.allSites)
    throw new McpAccessError(403, "Token does not grant access to an existing site.");
  return { token, site: site!, sites };
}
