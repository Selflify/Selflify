import fs from "node:fs/promises";
import path from "node:path";

import type { SelflifyConfig } from "@/lib/config/schema";
import { getSiteDirectory } from "@/lib/sites/service";

export type CleanupReport = {
  removedPreviewDirs: string[];
  removedOrphanDirs: string[];
};

type CleanupOptions = {
  previewTtlDays: number;
  orphanTtlDays: number;
  logger?: (message: string) => void;
};

function cutoffFromDays(days: number): number {
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

async function listChildDirectories(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(dir, entry.name));
  } catch {
    return [];
  }
}

async function removeDirectoryIfStale(
  dir: string,
  cutoff: number,
  logger?: (message: string) => void,
): Promise<boolean> {
  let stats: Awaited<ReturnType<typeof fs.stat>>;

  try {
    stats = await fs.stat(dir);
  } catch {
    return false;
  }

  if (stats.mtimeMs > cutoff) {
    return false;
  }

  await fs.rm(dir, { recursive: true, force: true });
  logger?.(dir);
  return true;
}

export async function runCleanupOnce(
  config: SelflifyConfig,
  options: CleanupOptions,
): Promise<CleanupReport> {
  const removedPreviewDirs: string[] = [];
  const removedOrphanDirs: string[] = [];
  const previewCutoff = cutoffFromDays(options.previewTtlDays);
  const orphanCutoff = cutoffFromDays(options.orphanTtlDays);

  for (const site of config.sites) {
    const siteDir = getSiteDirectory(config, site);
    const childDirs = await listChildDirectories(siteDir);

    for (const childDir of childDirs) {
      if (path.basename(childDir) === site.mainBranch) {
        continue;
      }

      if (await removeDirectoryIfStale(childDir, previewCutoff, options.logger)) {
        removedPreviewDirs.push(childDir);
      }
    }
  }

  const orphanDirs = await listChildDirectories(config.server.orphanedRootDir);

  for (const orphanDir of orphanDirs) {
    if (await removeDirectoryIfStale(orphanDir, orphanCutoff, options.logger)) {
      removedOrphanDirs.push(orphanDir);
    }
  }

  return {
    removedPreviewDirs,
    removedOrphanDirs,
  };
}
