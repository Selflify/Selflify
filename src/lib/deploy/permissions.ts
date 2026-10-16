import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type { SelflifyConfig, SiteConfig, DeployToken } from "@/lib/config/schema";
import { getDeployPermissionsPath, getEffectivePreviewRoot } from "@/lib/config/paths";

export function getDeploymentSiteId(site: SiteConfig): string {
  return (
    site.deploymentId ??
    crypto.createHash("sha256").update(`${site.slug}:${site.createdAt}`).digest("hex")
  );
}

export function tokenAllowsSite(token: DeployToken, siteId: string): boolean {
  return token.allSites === true || (token.siteIds ?? [token.siteId]).includes(siteId);
}

export type DeployPermissions = {
  version: 1;
  domain: string;
  previewRoot: string;
  sites: Array<{ id: string; slug: string; mainBranch: string }>;
  tokens: DeployToken[];
};

export async function atomicJson(target: string, value: unknown, mode = 0o600): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.writeFile(temp, `${JSON.stringify(value)}\n`, { mode });
    await fs.rename(temp, target);
  } finally {
    await fs.rm(temp, { force: true });
  }
}

export async function writeDeployPermissions(config: SelflifyConfig | null): Promise<void> {
  const permissions: DeployPermissions = {
    version: 1,
    domain: config?.server.domain ?? "",
    previewRoot: config ? getEffectivePreviewRoot(config) : "",
    sites:
      config?.sites.map((site) => ({
        id: getDeploymentSiteId(site),
        slug: site.slug,
        mainBranch: site.mainBranch,
      })) ?? [],
    // OAuth refresh credentials are panel-only and never enter the upload container.
    tokens:
      config?.deployTokens.map((token) => {
        const projected = { ...token };
        delete projected.oauth;
        return projected;
      }) ?? [],
  };
  // Root-owned, group-readable by the unprivileged upload process.
  await atomicJson(getDeployPermissionsPath(), permissions, 0o640);
}

export function hashDeploySecret(secret: string): string {
  return crypto.createHash("sha256").update(secret).digest("hex");
}
