import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/deploy/v1/images/route";
import { createDefaultConfig, readSelflifyConfig, writeSelflifyConfig } from "@/lib/config/service";
import { createDeployToken } from "@/lib/deploy/tokens";
import { caddyGateway, generateCaddyfile } from "@/lib/system/caddy";

import { containerRunner } from "./client";
import {
  hasPendingContainerPublication,
  markContainerPublication,
  recoverContainerPublication,
} from "./recovery";
import { ContainerError } from "./runner-contract";
import { containerHostname } from "./schema";
import { configureContainer, publishContainer } from "./service";

vi.mock("./client", () => ({
  containerRunnerEnabled: () => true,
  containerRunner: { prepare: vi.fn(), check: vi.fn() },
}));

const settings = {
  repository: "registry.example.test/account/storybook",
  port: 3000,
  healthPath: "/healthz",
};
const credentials = {
  registryUsername: "pull-user",
  registryPassword: "private-registry-token",
  clearRegistry: false,
  env: '{"MCP_ACCESS_TOKEN":"private-mcp-token"}',
  clearEnv: false,
};
const imageA = `${settings.repository}@sha256:${"a".repeat(64)}`;
const imageB = `${settings.repository}@sha256:${"b".repeat(64)}`;

describe("stable container releases", () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "selflify-container-test-"));
    vi.stubEnv("SELFLIFY_CONFIG_PATH", path.join(root, "config.json"));
    vi.stubEnv("SELFLIFY_CADDY_CONFIG_PATH", path.join(root, "Caddyfile"));
    vi.stubEnv("SELFLIFY_BACKUP_ROOT", path.join(root, "backups"));
    vi.stubEnv("SELFLIFY_DEV_MODE", "1");
    vi.spyOn(caddyGateway, "validateConfig").mockResolvedValue();
    vi.spyOn(caddyGateway, "reload").mockResolvedValue();
    const config = createDefaultConfig();
    config.server.domain = "example.test";
    config.admin.login = "owner";
    config.admin.passwordHash = "test-hash";
    const date = new Date().toISOString();
    config.sites = ["storybook", "other"].map((slug) => ({
      slug,
      name: slug,
      mainBranch: "stable",
      stableAlias: slug === "storybook" ? "storybook.example.org" : null,
      stableAliasAutoTls: true,
      stableAliasUseCloudflare: false,
      previewAuth: { enabled: false, login: null, passwordHash: null },
      createdAt: date,
      updatedAt: date,
    }));
    await writeSelflifyConfig(config);
    await configureContainer("storybook", settings, credentials, 0);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.resetAllMocks();
    vi.unstubAllEnvs();
    await fs.rm(root, { recursive: true, force: true });
  });

  it("keeps preview routing and separates secrets from config, backups and upload permissions", async () => {
    expect(generateCaddyfile(await readSelflifyConfig())).toContain(
      "root * /var/www/storybook/stable",
    );
    const release = await publishContainer("storybook", { image: imageA });
    expect(containerRunner.prepare).toHaveBeenCalledWith(release, {
      registry: {
        host: "registry.example.test",
        username: credentials.registryUsername,
        password: credentials.registryPassword,
      },
      env: { MCP_ACCESS_TOKEN: "private-mcp-token" },
    });
    const rendered = await fs.readFile(path.join(root, "Caddyfile"), "utf8");
    expect(rendered.split(`reverse_proxy ${containerHostname(release.id)}:3000`)).toHaveLength(3);
    expect(rendered).toContain("http://*.storybook.example.test");
    expect(rendered).toContain("root * /var/www/storybook/{labels.3}");
    expect(rendered).not.toContain("root * /var/www/storybook/stable");
    const files = await fs.readdir(path.join(root, "backups", "config"));
    for (const file of [
      "config.json",
      "Caddyfile",
      "deploy-permissions/permissions.json",
      ...files.map((name) => `backups/config/${name}`),
    ]) {
      expect(await fs.readFile(path.join(root, file), "utf8")).not.toMatch(
        /private-(registry|mcp)-token/,
      );
    }
  });

  it("preserves the active release on failed health and reload, then supports rollback", async () => {
    const first = await publishContainer("storybook", { image: imageA });
    const previousRoute = await fs.readFile(path.join(root, "Caddyfile"), "utf8");
    vi.mocked(containerRunner.prepare).mockRejectedValueOnce(
      new ContainerError(422, "Health check failed."),
    );
    await expect(publishContainer("storybook", { image: imageB })).rejects.toThrow(
      "Health check failed",
    );
    vi.mocked(caddyGateway.reload).mockRejectedValueOnce(new Error("Reload failed."));
    await expect(publishContainer("storybook", { image: imageB })).rejects.toThrow("Reload failed");
    expect(await fs.readFile(path.join(root, "Caddyfile"), "utf8")).toBe(previousRoute);
    expect((await readSelflifyConfig()).sites[0].container?.active).toEqual(first);

    const second = await publishContainer("storybook", { image: imageB });
    await expect(publishContainer("storybook", { rollback: true })).resolves.toEqual(first);
    expect(containerRunner.check).toHaveBeenCalledWith(first);
    expect((await readSelflifyConfig()).sites[0].container?.previous).toEqual(second);
  });

  it("reconciles the route from durable config after interruption", async () => {
    const release = await publishContainer("storybook", { image: imageA });
    await markContainerPublication();
    await fs.writeFile(path.join(root, "Caddyfile"), "interrupted");
    await recoverContainerPublication();
    expect(await fs.readFile(path.join(root, "Caddyfile"), "utf8")).toContain(
      `reverse_proxy ${containerHostname(release.id)}:3000`,
    );
    await expect(hasPendingContainerPublication()).resolves.toBe(false);
  });

  it("requires a site-scoped container token and an exact repository digest", async () => {
    const expiresAt = new Date(Date.now() + 3600_000).toISOString();
    const token = await createDeployToken("storybook", {
      name: "CI",
      expiresAt,
      revision: 1,
      preview: false,
      stable: false,
      container: true,
    });
    const staticToken = await createDeployToken("storybook", {
      name: "Static CI",
      expiresAt,
      revision: 2,
      stable: true,
    });
    const request = (credential: string, image: string, site = "storybook") =>
      POST(
        new Request("https://example.test/api/deploy/v1/images", {
          method: "POST",
          headers: { Authorization: `Bearer ${credential}` },
          body: JSON.stringify({ site, image }),
        }),
      );
    expect((await request(staticToken, imageA)).status).toBe(403);
    expect((await request(token, imageA, "other")).status).toBe(403);
    expect((await request(token, `${settings.repository}:latest`)).status).toBe(400);
    expect((await request(token, imageA.replace("/storybook", "/other"))).status).toBe(400);
    const first = await request(token, imageA);
    expect(first.status).toBe(200);
    const result = await first.json();
    expect(result.url).toBe("https://storybook.example.test");
    const retry = await request(token, imageA);
    expect((await retry.json()).release).toEqual(result.release);
    expect(containerRunner.prepare).toHaveBeenCalledTimes(1);
  });
});
