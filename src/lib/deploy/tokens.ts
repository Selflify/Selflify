import crypto from "node:crypto";

import type { DeployToken } from "@/lib/config/schema";
import { readSelflifyConfig, writeSelflifyConfig } from "@/lib/config/service";
import { ConfigConflictError, runSerializedTask } from "@/lib/operations";
import { getDeploymentSiteId, hashDeploySecret } from "@/lib/deploy/permissions";

export async function createDeployToken(
  siteSlug: string,
  input: {
    name: string;
    expiresAt: string;
    stable: boolean;
    preview?: boolean;
    mcpRead?: boolean;
    mcpWrite?: boolean;
    revision: number;
  },
): Promise<string> {
  return runSerializedTask(async () => {
    const config = await readSelflifyConfig();
    if (input.revision !== config.configRevision) throw new ConfigConflictError();
    const site = config.sites.find((entry) => entry.slug === siteSlug);
    if (!site) throw new Error("Site not found.");
    if (!input.name.trim() || input.name.length > 80) throw new Error("Enter a token name.");
    const expiry = Date.parse(input.expiresAt);
    if (!Number.isFinite(expiry) || expiry <= Date.now() || expiry > Date.now() + 366 * 86400_000) {
      throw new Error("Token expiry must be within the next year.");
    }
    if (
      config.deployTokens.filter(
        (token) =>
          !token.revokedAt &&
          Date.parse(token.oauth?.refreshExpiresAt ?? token.expiresAt) > Date.now(),
      ).length >= 200 ||
      config.deployTokens.length >= 1000
    ) {
      throw new Error("Revoke unused tokens before creating another token.");
    }
    const scopes: DeployToken["scopes"] = [];
    if (input.preview !== false) scopes.push("preview:write");
    if (input.stable) scopes.push("stable:write");
    if (input.mcpRead || input.mcpWrite) scopes.push("mcp:read");
    if (input.mcpWrite) scopes.push("mcp:write");
    if (!scopes.length) throw new Error("Select at least one token permission.");
    const id = crypto.randomUUID();
    const secret = crypto.randomBytes(32).toString("base64url");
    const token: DeployToken = {
      id,
      siteId: getDeploymentSiteId(site),
      name: input.name.trim(),
      secretHash: hashDeploySecret(secret),
      scopes,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(expiry).toISOString(),
      revokedAt: null,
    };
    config.deployTokens.push(token);
    config.configRevision += 1;
    await writeSelflifyConfig(config);
    return `slf_${id}.${secret}`;
  });
}

export async function revokeDeployToken(
  siteSlug: string,
  id: string,
  revision: number,
): Promise<void> {
  await runSerializedTask(async () => {
    const config = await readSelflifyConfig();
    if (revision !== config.configRevision) throw new ConfigConflictError();
    const site = config.sites.find((entry) => entry.slug === siteSlug);
    const token = config.deployTokens.find(
      (entry) => entry.id === id && site && entry.siteId === getDeploymentSiteId(site),
    );
    if (!token) throw new Error("Token not found.");
    token.revokedAt = new Date().toISOString();
    config.configRevision += 1;
    await writeSelflifyConfig(config);
  });
}
