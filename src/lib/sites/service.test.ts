import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { type SelflifyConfig, type SiteConfig } from "@/lib/config/schema";
import { createDefaultConfig } from "@/lib/config/service";
import { deleteDeploy, ensureSiteDirectories, getSiteDirectory } from "@/lib/sites/service";

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "selflify-sites-test-"));
  tempDirs.push(dir);
  return dir;
}

function createConfig(previewRootDir: string): SelflifyConfig {
  const base = createDefaultConfig();

  return {
    ...base,
    server: {
      ...base.server,
      previewRootDir,
      orphanedRootDir: path.join(previewRootDir, ".orphaned-sites"),
    },
  };
}

function createSite(): SiteConfig {
  return {
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
  };
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("site service", () => {
  it("creates the main branch directory with a placeholder file", async () => {
    const previewRootDir = await makeTempDir();
    const config = createConfig(previewRootDir);
    const site = createSite();

    await ensureSiteDirectories(config, site);

    const placeholderPath = path.join(
      getSiteDirectory(config, site),
      site.mainBranch,
      "index.html",
    );
    const placeholder = await fs.readFile(placeholderPath, "utf8");

    expect(placeholder).toContain("Selflify Placeholder");
    expect(placeholder).toContain(site.name);
  });

  it("rejects deploy deletion outside the site root", async () => {
    const previewRootDir = await makeTempDir();
    const config = createConfig(previewRootDir);
    const site = createSite();

    await ensureSiteDirectories(config, site);

    await expect(deleteDeploy(config, site, "../escape")).rejects.toThrow(
      "Deploy path is outside the site root.",
    );
  });
});
