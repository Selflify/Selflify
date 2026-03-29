import fs from "node:fs/promises";
import path from "node:path";

import type { SelflifyConfig, SiteConfig } from "@/lib/config/schema";
import { getEffectiveOrphanRoot, getEffectivePreviewRoot } from "@/lib/config/paths";
import { runCommand } from "@/lib/system/commands";
import { formatBytes } from "@/lib/utils/format";

type SizeCacheEntry = {
  bytes: number;
  expiresAt: number;
};

const sizeCache = new Map<string, SizeCacheEntry>();
const SIZE_CACHE_TTL_MS = 90_000;

export type DeploySummary = {
  name: string;
  dir: string;
  isMainBranch: boolean;
  sizeBytes: number;
  sizeLabel: string;
  modifiedAt: string;
  url: string;
};

type DeployRecord = Omit<DeploySummary, "sizeBytes" | "sizeLabel">;

export type DeployPage = {
  items: DeploySummary[];
  totalCount: number;
  nextOffset: number | null;
};

export const DEFAULT_DEPLOY_PAGE_SIZE = 20;
const MAX_DEPLOY_PAGE_SIZE = 100;

export type SiteSummary = {
  slug: string;
  name: string;
  mainBranch: string;
  dir: string;
  totalSizeBytes: number;
  totalSizeLabel: string;
  deployCount: number;
  stableUrl: string;
  previewAuthEnabled: boolean;
};

export type DiskUsageSummary = {
  totalBytes: number;
  usedBytes: number;
  availableBytes: number;
};

function now(): number {
  return Date.now();
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function cacheKey(dir: string): string {
  return path.resolve(dir);
}

function resolveSiteChildPath(siteDir: string, childName: string): string {
  const candidate = path.resolve(path.join(siteDir, childName));
  const allowedPrefix = `${path.resolve(siteDir)}${path.sep}`;

  if (!candidate.startsWith(allowedPrefix)) {
    throw new Error("Deploy path is outside the site root.");
  }

  return candidate;
}

export function getSiteDirectory(config: SelflifyConfig, site: SiteConfig): string {
  return path.join(getEffectivePreviewRoot(config), site.slug);
}

export function getStableUrl(config: SelflifyConfig, site: SiteConfig): string {
  return `https://${site.slug}.${config.server.domain}`;
}

export function getDeployUrl(config: SelflifyConfig, site: SiteConfig, deployName: string): string {
  if (deployName === site.mainBranch) {
    return getStableUrl(config, site);
  }

  return `https://${deployName}.${site.slug}.${config.server.domain}`;
}

function normalizeDeploySearchQuery(query: string): string {
  return query.trim().toLowerCase();
}

function formatDeployHost(url: string): string {
  return url.replace(/^https?:\/\//, "");
}

function matchesDeploySearch(deploy: DeployRecord, normalizedQuery: string): boolean {
  if (!normalizedQuery) {
    return true;
  }

  return [deploy.name, formatDeployHost(deploy.url), deploy.dir].some((value) =>
    value.toLowerCase().includes(normalizedQuery),
  );
}

function sanitizePageSize(limit: number | undefined): number {
  if (!Number.isFinite(limit)) {
    return DEFAULT_DEPLOY_PAGE_SIZE;
  }

  return Math.min(Math.max(Math.floor(limit ?? DEFAULT_DEPLOY_PAGE_SIZE), 1), MAX_DEPLOY_PAGE_SIZE);
}

function sanitizeOffset(offset: number | undefined): number {
  if (!Number.isFinite(offset)) {
    return 0;
  }

  return Math.max(Math.floor(offset ?? 0), 0);
}

export async function ensureSiteDirectories(
  config: SelflifyConfig,
  site: SiteConfig,
): Promise<void> {
  const siteDir = getSiteDirectory(config, site);
  const mainDir = path.join(siteDir, site.mainBranch);
  const placeholderPath = path.join(mainDir, "index.html");

  await fs.mkdir(mainDir, { recursive: true });

  try {
    await fs.access(placeholderPath);
  } catch {
    const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(site.name)} · Selflify Placeholder</title>
    <style>
      :root { color-scheme: dark; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        font-family: ui-sans-serif, system-ui, sans-serif;
        background:
          radial-gradient(circle at top left, rgba(161, 33, 65, 0.28), transparent 28%),
          linear-gradient(180deg, #140c10 0%, #070709 100%);
        color: #fff4f7;
      }
      .card {
        width: min(40rem, calc(100vw - 2rem));
        padding: 2rem;
        border-radius: 1.5rem;
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(17, 17, 22, 0.92);
        box-shadow: 0 24px 80px rgba(0, 0, 0, 0.4);
      }
      .eyebrow {
        text-transform: uppercase;
        letter-spacing: 0.18em;
        font-size: 0.7rem;
        color: #ffb2c5;
      }
      h1 {
        margin: 0.8rem 0 0.6rem;
        font-size: clamp(2rem, 5vw, 3rem);
      }
      p {
        margin: 0;
        color: rgba(255, 244, 247, 0.72);
        line-height: 1.7;
      }
      code {
        display: inline-block;
        margin-top: 1rem;
        padding: 0.4rem 0.7rem;
        border-radius: 999px;
        background: rgba(161, 33, 65, 0.16);
        color: #ffdbe5;
      }
    </style>
  </head>
  <body>
    <section class="card">
      <div class="eyebrow">Selflify Placeholder</div>
      <h1>${escapeHtml(site.name)}</h1>
      <p>This site has been created in Selflify. Replace the placeholder with your deployed static build to make the stable environment live.</p>
      <code>${escapeHtml(path.join(site.slug, site.mainBranch))}</code>
    </section>
  </body>
</html>
`;

    await fs.writeFile(placeholderPath, html, "utf8");
  }
}

export async function deployDirectoryExists(
  config: SelflifyConfig,
  site: SiteConfig,
  deployName: string,
): Promise<boolean> {
  const siteDir = getSiteDirectory(config, site);
  const candidate = resolveSiteChildPath(siteDir, deployName);

  try {
    const stats = await fs.stat(candidate);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

export async function removeSiteDirectory(config: SelflifyConfig, site: SiteConfig): Promise<void> {
  await fs.rm(getSiteDirectory(config, site), { recursive: true, force: true });
}

export async function moveSiteToOrphanStorage(
  config: SelflifyConfig,
  site: SiteConfig,
): Promise<string | null> {
  const siteDir = getSiteDirectory(config, site);
  const orphanRoot = getEffectiveOrphanRoot(config);
  const target = path.join(orphanRoot, `${site.slug}-${Date.now()}`);

  await fs.mkdir(orphanRoot, { recursive: true });

  try {
    await fs.access(siteDir);
  } catch {
    return null;
  }

  await fs.rename(siteDir, target);
  return target;
}

export async function restoreSiteFromOrphanStorage(
  config: SelflifyConfig,
  site: SiteConfig,
  orphanPath: string,
): Promise<void> {
  const siteDir = getSiteDirectory(config, site);

  try {
    await fs.access(orphanPath);
  } catch {
    return;
  }

  await fs.mkdir(path.dirname(siteDir), { recursive: true });
  await fs.rename(orphanPath, siteDir);
}

async function getDirectorySizeBytes(dir: string): Promise<number> {
  const key = cacheKey(dir);
  const cached = sizeCache.get(key);

  if (cached && cached.expiresAt > now()) {
    return cached.bytes;
  }

  try {
    const output = await runCommand("du", ["-sk", dir]);
    const bytes = Number(output.split(/\s+/)[0] ?? "0") * 1024;

    sizeCache.set(key, {
      bytes,
      expiresAt: now() + SIZE_CACHE_TTL_MS,
    });

    return bytes;
  } catch {
    return 0;
  }
}

export function invalidateSiteCache(config: SelflifyConfig, site: SiteConfig): void {
  const siteDir = getSiteDirectory(config, site);

  sizeCache.delete(cacheKey(siteDir));
}

async function readDeployRecords(config: SelflifyConfig, site: SiteConfig): Promise<DeployRecord[]> {
  const siteDir = getSiteDirectory(config, site);
  let entries: Array<{ name: string; isDirectory: boolean }> = [];

  try {
    const dirents = await fs.readdir(siteDir, { withFileTypes: true });
    entries = dirents.map((entry) => ({ name: entry.name, isDirectory: entry.isDirectory() }));
  } catch {
    entries = [];
  }

  const deploys = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory)
      .map(async (entry) => {
        const fullPath = path.join(siteDir, entry.name);
        const stats = await fs.stat(fullPath);

        return {
          name: entry.name,
          dir: fullPath,
          isMainBranch: entry.name === site.mainBranch,
          modifiedAt: stats.mtime.toISOString(),
          url: getDeployUrl(config, site, entry.name),
        } satisfies DeployRecord;
      }),
  );

  return deploys.sort((left, right) => {
    if (left.isMainBranch) return -1;
    if (right.isMainBranch) return 1;
    return right.modifiedAt.localeCompare(left.modifiedAt);
  });
}

async function toDeploySummary(deploy: DeployRecord): Promise<DeploySummary> {
  const sizeBytes = await getDirectorySizeBytes(deploy.dir);

  return {
    ...deploy,
    sizeBytes,
    sizeLabel: formatBytes(sizeBytes),
  };
}

export async function getDeploySummary(
  config: SelflifyConfig,
  site: SiteConfig,
  deployName: string,
): Promise<DeploySummary | null> {
  const siteDir = getSiteDirectory(config, site);
  const fullPath = resolveSiteChildPath(siteDir, deployName);

  try {
    const stats = await fs.stat(fullPath);

    if (!stats.isDirectory()) {
      return null;
    }

    return toDeploySummary({
      name: deployName,
      dir: fullPath,
      isMainBranch: deployName === site.mainBranch,
      modifiedAt: stats.mtime.toISOString(),
      url: getDeployUrl(config, site, deployName),
    });
  } catch {
    return null;
  }
}

export async function listPreviewDeployPage(
  config: SelflifyConfig,
  site: SiteConfig,
  options?: {
    query?: string;
    offset?: number;
    limit?: number;
  },
): Promise<DeployPage> {
  const normalizedQuery = normalizeDeploySearchQuery(options?.query ?? "");
  const offset = sanitizeOffset(options?.offset);
  const limit = sanitizePageSize(options?.limit);
  const deploys = (await readDeployRecords(config, site))
    .filter((deploy) => !deploy.isMainBranch)
    .filter((deploy) => matchesDeploySearch(deploy, normalizedQuery));
  const pageItems = deploys.slice(offset, offset + limit);

  return {
    items: await Promise.all(pageItems.map((deploy) => toDeploySummary(deploy))),
    totalCount: deploys.length,
    nextOffset: offset + pageItems.length < deploys.length ? offset + pageItems.length : null,
  };
}

export async function listDeploys(
  config: SelflifyConfig,
  site: SiteConfig,
): Promise<DeploySummary[]> {
  const deploys = await readDeployRecords(config, site);
  return Promise.all(deploys.map((deploy) => toDeploySummary(deploy)));
}

export async function getSiteSummary(
  config: SelflifyConfig,
  site: SiteConfig,
): Promise<SiteSummary> {
  const dir = getSiteDirectory(config, site);
  const deploys = await listDeploys(config, site);
  const totalSizeBytes = await getDirectorySizeBytes(dir);

  return {
    slug: site.slug,
    name: site.name,
    mainBranch: site.mainBranch,
    dir,
    totalSizeBytes,
    totalSizeLabel: formatBytes(totalSizeBytes),
    deployCount: deploys.length,
    stableUrl: getStableUrl(config, site),
    previewAuthEnabled: site.previewAuth.enabled,
  };
}

export async function getAllSiteSummaries(config: SelflifyConfig): Promise<SiteSummary[]> {
  const summaries = await Promise.all(config.sites.map((site) => getSiteSummary(config, site)));

  return summaries.sort((left, right) => right.totalSizeBytes - left.totalSizeBytes);
}

export async function getDiskUsage(config: SelflifyConfig): Promise<DiskUsageSummary> {
  try {
    const stats = await fs.statfs(getEffectivePreviewRoot(config));
    const totalBytes = stats.blocks * stats.bsize;
    const availableBytes = stats.bavail * stats.bsize;
    const usedBytes = totalBytes - stats.bfree * stats.bsize;

    return {
      totalBytes,
      usedBytes,
      availableBytes,
    };
  } catch {
    return {
      totalBytes: 0,
      usedBytes: 0,
      availableBytes: 0,
    };
  }
}

export async function deleteDeploy(
  config: SelflifyConfig,
  site: SiteConfig,
  deployName: string,
): Promise<void> {
  if (deployName === site.mainBranch) {
    throw new Error("The main branch deploy cannot be deleted.");
  }

  await removeDeployDirectory(config, site, deployName);
  invalidateSiteCache(config, site);
}

export async function removeDeployDirectory(
  config: SelflifyConfig,
  site: SiteConfig,
  deployName: string,
): Promise<void> {
  const siteDir = getSiteDirectory(config, site);
  const candidate = resolveSiteChildPath(siteDir, deployName);

  await fs.rm(candidate, { recursive: true, force: true });
}
