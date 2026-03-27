import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runCleanupOnce } from "@/lib/cleanup/service";
import { createDefaultConfig } from "@/lib/config/service";

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "selflify-cleanup-test-"));
  tempDirs.push(dir);
  return dir;
}

async function makeDirWithAge(dir: string, ageDays: number): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  const timestamp = new Date(Date.now() - ageDays * 24 * 60 * 60 * 1000);
  await fs.utimes(dir, timestamp, timestamp);
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("runCleanupOnce", () => {
  it("removes stale preview and orphan directories while keeping the main branch", async () => {
    const previewRootDir = await makeTempDir();
    const orphanedRootDir = path.join(previewRootDir, ".orphaned-sites");
    const config = createDefaultConfig();
    config.server.previewRootDir = previewRootDir;
    config.server.orphanedRootDir = orphanedRootDir;
    config.sites = [
      {
        slug: "app",
        name: "App",
        mainBranch: "stable",
        previewAuth: {
          enabled: false,
          login: null,
          passwordHash: null,
        },
        createdAt: "2026-03-26T18:00:00.000Z",
        updatedAt: "2026-03-26T18:00:00.000Z",
      },
    ];

    const stableDir = path.join(previewRootDir, "app", "stable");
    const freshPreviewDir = path.join(previewRootDir, "app", "pr-fresh");
    const stalePreviewDir = path.join(previewRootDir, "app", "pr-stale");
    const staleOrphanDir = path.join(orphanedRootDir, "app-123");

    await makeDirWithAge(stableDir, 100);
    await makeDirWithAge(freshPreviewDir, 1);
    await makeDirWithAge(stalePreviewDir, 40);
    await makeDirWithAge(staleOrphanDir, 40);

    const report = await runCleanupOnce(config, {
      previewTtlDays: 30,
      orphanTtlDays: 30,
    });

    await expect(fs.stat(stableDir)).resolves.toBeDefined();
    await expect(fs.stat(freshPreviewDir)).resolves.toBeDefined();
    await expect(fs.stat(stalePreviewDir)).rejects.toThrow();
    await expect(fs.stat(staleOrphanDir)).rejects.toThrow();

    expect(report.removedPreviewDirs).toContain(stalePreviewDir);
    expect(report.removedOrphanDirs).toContain(staleOrphanDir);
  });
});
