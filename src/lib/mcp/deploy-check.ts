import fs from "node:fs/promises";
import path from "node:path";

import type { SelflifyConfig, SiteConfig } from "@/lib/config/schema";
import { deployNamePattern } from "@/lib/config/schema";
import { getEffectivePreviewRoot } from "@/lib/config/paths";
import { currentRelease } from "@/lib/deploy/publication";
import { getDeployUrl } from "@/lib/sites/service";
import { isValidHostname } from "@/lib/utils/hostname";
import { McpAccessError } from "@/lib/mcp/auth";

async function isRegularFile(file: string) {
  const stat = await fs.lstat(file).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  return stat?.isFile() === true && (await fs.realpath(file)) === file;
}

export async function assertSiteStorage(config: SelflifyConfig, site: SiteConfig) {
  try {
    const root = await fs.realpath(getEffectivePreviewRoot(config));
    const siteDir = path.join(root, site.slug);
    if ((await fs.realpath(siteDir)) !== siteDir) {
      throw new McpAccessError(409, "Site storage contains a symbolic link.");
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export async function readDeployFiles(config: SelflifyConfig, site: SiteConfig, deploy: string) {
  if (!deployNamePattern.test(deploy)) throw new McpAccessError(400, "Invalid deploy name.");
  try {
    const root = await fs.realpath(getEffectivePreviewRoot(config));
    const deployDir = path.join(root, site.slug, deploy);
    // Legacy symlinks must not let a site-scoped reader inspect other sites.
    if (
      (await fs.realpath(path.dirname(deployDir))) !== path.dirname(deployDir) ||
      (await fs.realpath(deployDir)) !== deployDir
    ) {
      throw new McpAccessError(409, "Deployment storage contains a symbolic link.");
    }
    const release = await currentRelease(deployDir);
    const contentRoot = release ?? deployDir;
    if (release && (await fs.realpath(release)) !== release) {
      throw new McpAccessError(409, "Deployment storage contains a symbolic link.");
    }
    return {
      exists: (await fs.stat(deployDir)).isDirectory(),
      hasIndex: await isRegularFile(path.join(contentRoot, "index.html")),
      releaseId: release ? path.basename(release) : null,
      contentRoot,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { exists: false, hasIndex: false, releaseId: null, contentRoot: null };
    }
    throw error;
  }
}

export async function checkDeploy(
  config: SelflifyConfig,
  site: SiteConfig,
  deploy: string,
  expectedCommit?: string,
  fetchImpl: typeof fetch = fetch,
) {
  if (expectedCommit && !/^[a-f0-9]{40,64}$/.test(expectedCommit)) {
    throw new McpAccessError(400, "Invalid commit marker.");
  }
  if (!isValidHostname(config.server.domain)) {
    throw new McpAccessError(400, "Configure a valid server domain before checking HTTPS.");
  }
  const files = await readDeployFiles(config, site, deploy);
  const url = getDeployUrl(config, site, deploy);
  const marker = expectedCommit ? `/__preview_commit__/${expectedCommit}` : null;
  const markerExists = marker
    ? files.contentRoot
      ? await isRegularFile(path.join(files.contentRoot, marker))
      : false
    : null;
  const started = Date.now();
  let httpStatus: number | null = null;
  let status: string;
  try {
    const response = await fetchImpl(`${url}${marker ?? "/"}`, {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" },
      signal: AbortSignal.timeout(5000),
    });
    httpStatus = response.status;
    await response.body?.cancel();
    status =
      response.status === 401
        ? "auth_required"
        : response.status === 403
          ? "forbidden"
          : response.status === 404
            ? "not_found"
            : response.status >= 300 && response.status < 400
              ? "redirect"
              : response.ok
                ? "reachable"
                : "http_error";
  } catch (error) {
    status =
      error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)
        ? "timeout"
        : "network_error";
  }
  return {
    url,
    checkedUrl: `${url}${marker ?? "/"}`,
    checkedAt: new Date().toISOString(),
    perspective: "selflify_server",
    exists: files.exists,
    hasIndex: files.hasIndex,
    releaseId: files.releaseId,
    httpStatus,
    status,
    responseTimeMs: Date.now() - started,
    expectedCommit: expectedCommit ?? null,
    markerExists,
    ready: files.hasIndex && status === "reachable" && (!expectedCommit || markerExists === true),
  };
}
