import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { type SelflifyConfig, type SiteConfig } from "@/lib/config/schema";
import { createDefaultConfig } from "@/lib/config/service";
import {
  deleteDeploy,
  ensureSiteDirectories,
  getSiteDirectory,
  listRecentDeploys,
  listPreviewDeployPage,
  listDeploys,
} from "@/lib/sites/service";

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

  it("includes the absolute deploy directory in deploy summaries", async () => {
    const previewRootDir = await makeTempDir();
    const config = createConfig(previewRootDir);
    const site = createSite();

    await ensureSiteDirectories(config, site);

    const deploys = await listDeploys(config, site);

    expect(deploys[0]?.dir).toBe(path.join(getSiteDirectory(config, site), site.mainBranch));
  });

  it("paginates and filters preview deploys without returning the main branch", async () => {
    const previewRootDir = await makeTempDir();
    const config = createConfig(previewRootDir);
    const site = createSite();

    await ensureSiteDirectories(config, site);
    await fs.mkdir(path.join(getSiteDirectory(config, site), "pr-100"));
    await fs.mkdir(path.join(getSiteDirectory(config, site), "pr-200"));

    const page = await listPreviewDeployPage(config, site, {
      query: "200",
      offset: 0,
      limit: 10,
    });

    expect(page.totalCount).toBe(1);
    expect(page.nextOffset).toBeNull();
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.name).toBe("pr-200");
    expect(page.items[0]?.isMainBranch).toBe(false);
  });

  it("lists the most recently modified deploys across all sites", async () => {
    const previewRootDir = await makeTempDir();
    const config = createConfig(previewRootDir);
    const appSite = createSite();
    const transportSite: SiteConfig = {
      ...createSite(),
      slug: "transport",
      name: "Transport",
    };

    config.sites = [appSite, transportSite];

    await ensureSiteDirectories(config, appSite);
    await ensureSiteDirectories(config, transportSite);

    const appStableDir = path.join(getSiteDirectory(config, appSite), appSite.mainBranch);
    const transportStableDir = path.join(getSiteDirectory(config, transportSite), transportSite.mainBranch);
    const appPreviewDir = path.join(getSiteDirectory(config, appSite), "pr-200");
    const transportPreviewDir = path.join(getSiteDirectory(config, transportSite), "release-9");

    await fs.mkdir(appPreviewDir);
    await fs.mkdir(transportPreviewDir);

    await fs.utimes(appStableDir, new Date("2026-03-27T09:00:00.000Z"), new Date("2026-03-27T09:00:00.000Z"));
    await fs.utimes(appPreviewDir, new Date("2026-03-27T09:30:00.000Z"), new Date("2026-03-27T09:30:00.000Z"));
    await fs.utimes(transportStableDir, new Date("2026-03-27T09:10:00.000Z"), new Date("2026-03-27T09:10:00.000Z"));
    await fs.utimes(transportPreviewDir, new Date("2026-03-27T09:40:00.000Z"), new Date("2026-03-27T09:40:00.000Z"));

    const recentDeploys = await listRecentDeploys(config, 3);

    expect(recentDeploys).toHaveLength(3);
    expect(
      recentDeploys.map((entry) => [entry.siteSlug, entry.deploy.name]),
    ).toEqual([
      ["transport", "release-9"],
      ["app", "pr-200"],
      ["transport", "stable"],
    ]);
  });
});
