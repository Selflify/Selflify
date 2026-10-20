import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import tar from "tar-stream";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDefaultConfig, readSelflifyConfig, writeSelflifyConfig } from "@/lib/config/service";
import * as configService from "@/lib/config/service";
import { getDeployPermissionsPath } from "@/lib/config/paths";
import { createDeployToken, revokeDeployToken } from "@/lib/deploy/tokens";
import { createUploadServer } from "@/lib/deploy/server";
import { currentRelease } from "@/lib/deploy/publication";
import { withDeployLock } from "@/lib/deploy/lock";
import { createMcpHandler } from "@/lib/mcp/handler";
import { checkDeploy } from "@/lib/mcp/deploy-check";
import { caddyGateway } from "@/lib/system/caddy";
import { dnsGateway } from "@/lib/system/cloudflare";

describe("Selflify MCP", () => {
  let root: string;
  let token: string;
  let handle: ReturnType<typeof createMcpHandler>;
  let uploadServer: http.Server | undefined;

  async function mint(options: Partial<Parameters<typeof createDeployToken>[1]> = {}) {
    const config = await readSelflifyConfig();
    return createDeployToken("app", {
      name: "Developer",
      expiresAt: new Date(Date.now() + 86400_000).toISOString(),
      stable: false,
      preview: false,
      mcpRead: true,
      revision: config.configRevision,
      ...options,
    });
  }

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "selflify-mcp-"));
    vi.stubEnv("SELFLIFY_CONFIG_PATH", path.join(root, "config.json"));
    vi.stubEnv("SELFLIFY_DEPLOY_PERMISSIONS_PATH", path.join(root, "permissions.json"));
    vi.stubEnv("SELFLIFY_PREVIEW_ROOT", path.join(root, "sites"));
    vi.stubEnv("SELFLIFY_DEPLOY_LOCK_PATH", path.join(root, "lock", "operation"));
    vi.stubEnv("SELFLIFY_BACKUP_ROOT", path.join(root, "backups"));
    vi.stubEnv("SELFLIFY_CADDY_CONFIG_PATH", path.join(root, "Caddyfile"));
    vi.stubEnv("SELFLIFY_DEV_MODE", "0");
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(caddyGateway, "validateConfig").mockResolvedValue();
    vi.spyOn(caddyGateway, "reload").mockResolvedValue();
    vi.spyOn(dnsGateway, "syncSiteRecords").mockResolvedValue();
    const config = createDefaultConfig();
    config.admin = {
      login: "owner",
      passwordHash: "private-admin-hash",
      configuredAt: new Date().toISOString(),
    };
    config.sessionSecret = "private-session-secret";
    config.server.domain = "example.test";
    config.server.cloudflareApiToken = "private-cloudflare-token";
    config.sites = ["app", "other"].map((slug) => ({
      slug,
      name: slug,
      deploymentId: crypto.randomUUID(),
      mainBranch: "stable",
      stableAlias: null,
      stableAliasAutoTls: false,
      stableAliasUseCloudflare: false,
      previewAuth: { enabled: false, login: null, passwordHash: null },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    await writeSelflifyConfig(config);
    await fs.mkdir(path.join(root, "sites/app/stable"), { recursive: true });
    await fs.writeFile(path.join(root, "sites/app/stable/index.html"), "old build");
    token = await mint();
    handle = createMcpHandler();
  });

  afterEach(async () => {
    uploadServer?.closeAllConnections();
    if (uploadServer) await new Promise<void>((resolve) => uploadServer!.close(() => resolve()));
    uploadServer = undefined;
    await fs.rm(root, { recursive: true, force: true });
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function request(body: unknown, headers: Record<string, string> = {}, method = "POST") {
    return handle(
      new Request("https://example.test/mcp", {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          ...headers,
        },
        body: method === "POST" ? JSON.stringify(body) : undefined,
      }),
    );
  }

  async function call(name: string, args: Record<string, unknown> = {}) {
    const response = await request({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args },
    });
    expect(response.status).toBe(200);
    const envelope = await response.json();
    expect(envelope.error).toBeUndefined();
    return envelope.result as {
      isError?: boolean;
      structuredContent: Record<string, unknown>;
      content: Array<{ text: string }>;
    };
  }

  async function revision() {
    return (await readSelflifyConfig()).configRevision;
  }

  it("supports initialization and discovery with the official HTTP client", async () => {
    const client = new Client({ name: "integration-test", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL("https://example.test/mcp"), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
      fetch: async (input, init) => handle(new Request(input, init)),
    });
    try {
      await client.connect(transport);
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name)).toEqual(
        expect.arrayContaining([
          "list_sites",
          "check_deploy",
          "update_site",
          "prepare_deploy",
          "publish_deploy",
        ]),
      );
      const result = await client.callTool({ name: "get_site" });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({ site: { slug: "app" } });
    } finally {
      await client.close();
    }
  });

  it("exposes only the granted site and omits secrets and filesystem paths", async () => {
    for (const name of ["list_sites", "get_site", "get_site_stats", "list_deploys"]) {
      const result = await call(name);
      expect(result.isError).not.toBe(true);
      const json = JSON.stringify(result);
      for (const secret of [
        "private-admin-hash",
        "private-session-secret",
        "private-cloudflare-token",
        token,
        "secretHash",
        "other",
        root,
      ]) {
        expect(json).not.toContain(secret);
      }
    }
  });

  it("denies unauthenticated, tampered and legacy deploy-only tokens", async () => {
    expect((await request({}, { Authorization: "" })).status).toBe(401);
    const tail = token.endsWith("A") ? "B" : "A";
    expect(
      (await request({}, { Authorization: `Bearer ${token.slice(0, -1)}${tail}` })).status,
    ).toBe(401);
    const legacy = await mint({ mcpRead: false, preview: true });
    expect((await request({}, { Authorization: `Bearer ${legacy}` })).status).toBe(403);
  });

  it("honors revocation, expiry and site identity", async () => {
    const config = await readSelflifyConfig();
    config.deployTokens[0].expiresAt = new Date(Date.now() - 1000).toISOString();
    await writeSelflifyConfig(config);
    expect((await request({})).status).toBe(401);
    token = await mint();
    await revokeDeployToken("app", token.slice(4, 40), await revision());
    expect((await request({})).status).toBe(401);
    token = await mint();
    const recreated = await readSelflifyConfig();
    recreated.sites[0].deploymentId = crypto.randomUUID();
    await writeSelflifyConfig(recreated);
    expect((await request({})).status).toBe(403);
  });

  it("rejects foreign origins and hosts, unsupported methods, invalid or oversized bodies", async () => {
    expect((await request({}, { Origin: "https://evil.test" })).status).toBe(403);
    expect((await request({}, { Host: "evil.test" })).status).toBe(403);
    const get = await request(undefined, {}, "GET");
    expect(get.status).toBe(405);
    expect(get.headers.get("allow")).toBe("POST");
    expect((await request({}, { "Content-Type": "text/plain" })).status).toBe(415);
    expect((await request({ data: "x".repeat(70_000) })).status).toBe(413);
    expect(
      (
        await handle(
          new Request("https://example.test/mcp", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: "{bad",
          }),
        )
      ).status,
    ).toBe(400);
  });

  it("rate limits authenticated callers", async () => {
    for (let index = 0; index < 60; index++) {
      expect((await request(undefined, {}, "GET")).status).toBe(405);
    }
    const response = await request(undefined, {}, "GET");
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
  });

  it("denies writes with a read token and requires an exact config revision", async () => {
    const args = { name: "Renamed", mainBranch: "stable", expectedRevision: await revision() };
    expect((await call("update_site", args)).isError).toBe(true);
    token = await mint({ mcpWrite: true });
    const conflict = await call("update_site", args);
    expect(conflict.isError).toBe(true);
    expect(conflict.content[0].text).toContain("config_conflict");
    expect((await call("update_site", { name: "Renamed", mainBranch: "stable" })).isError).toBe(
      true,
    );
    expect((await readSelflifyConfig()).sites[0].name).toBe("app");
  });

  it("uses the config operation pipeline and returns the committed revision", async () => {
    token = await mint({ mcpWrite: true });
    const before = await revision();
    const result = await call("update_site", {
      name: "Renamed",
      mainBranch: "stable",
      expectedRevision: before,
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      status: "success",
      site: { name: "Renamed", configRevision: before + 1 },
    });
    expect(caddyGateway.validateConfig).toHaveBeenCalledOnce();
    expect(caddyGateway.reload).toHaveBeenCalledOnce();
    expect((await readSelflifyConfig()).sites[0].name).toBe("Renamed");
  });

  it("reports post-apply failure without leaking gateway errors", async () => {
    token = await mint({ mcpWrite: true });
    vi.mocked(dnsGateway.syncSiteRecords).mockRejectedValue(new Error("private-cloudflare-token"));
    const result = await call("update_site", {
      name: "Renamed",
      mainBranch: "stable",
      expectedRevision: await revision(),
    });
    expect(result.structuredContent).toMatchObject({
      status: "partial",
      site: { name: "Renamed" },
    });
    expect(JSON.stringify(result)).not.toContain("private-cloudflare-token");
  });

  it("rolls config back when Caddy rejects a change", async () => {
    token = await mint({ mcpWrite: true });
    const before = await revision();
    vi.mocked(caddyGateway.validateConfig).mockRejectedValue(
      new Error("private validation command"),
    );
    const result = await call("update_site", {
      name: "Renamed",
      mainBranch: "stable",
      expectedRevision: before,
    });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).not.toContain("private validation command");
    expect((await readSelflifyConfig()).sites[0].name).toBe("app");
    expect(await revision()).toBe(before);
  });

  it("checks revocation again after waiting for the mutation lock", async () => {
    token = await mint({ mcpWrite: true });
    const before = await revision();
    let pending!: Promise<Awaited<ReturnType<typeof call>>>;
    const originalRead = configService.readSelflifyConfig;
    let readsCompleted = 0;
    vi.spyOn(configService, "readSelflifyConfig").mockImplementation(async () => {
      const config = await originalRead();
      readsCompleted += 1;
      return config;
    });
    await withDeployLock(async () => {
      pending = call("update_site", {
        name: "Renamed",
        mainBranch: "stable",
        expectedRevision: before,
      });
      // Both HTTP and tool authorization must finish before revocation.
      await vi.waitFor(() => expect(readsCompleted).toBeGreaterThanOrEqual(2));
      const config = await readSelflifyConfig();
      config.deployTokens.find((entry) => entry.id === token.slice(4, 40))!.revokedAt =
        new Date().toISOString();
      await writeSelflifyConfig(config);
    });
    const result = await pending;
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Invalid MCP token");
    expect((await readSelflifyConfig()).sites[0].name).toBe("app");
  });

  it("requires stable permission and an existing build when changing the main branch", async () => {
    token = await mint({ mcpWrite: true });
    const args = { name: "app", mainBranch: "candidate", expectedRevision: await revision() };
    expect((await call("update_site", args)).isError).toBe(true);
    token = await mint({ mcpWrite: true, stable: true });
    expect(
      (await call("update_site", { ...args, expectedRevision: await revision() })).isError,
    ).toBe(true);
    await fs.mkdir(path.join(root, "sites/app/candidate"));
    await fs.writeFile(path.join(root, "sites/app/candidate/index.html"), "ready");
    expect(
      (await call("update_site", { ...args, expectedRevision: await revision() })).isError,
    ).not.toBe(true);
    expect((await readSelflifyConfig()).sites[0].mainBranch).toBe("candidate");
  });

  it("updates aliases and preview auth through site use cases", async () => {
    token = await mint({ mcpWrite: true, stable: true });
    expect(
      (
        await call("update_site_alias", {
          alias: "www.example.test",
          autoTls: true,
          useCloudflare: false,
          expectedRevision: await revision(),
        })
      ).isError,
    ).not.toBe(true);
    vi.spyOn(caddyGateway, "hashPassword").mockResolvedValue("private-preview-hash");
    const auth = await call("set_preview_auth", {
      login: "reviewer",
      password: "private-preview-password",
      expectedRevision: await revision(),
    });
    expect(auth.structuredContent).toMatchObject({ site: { previewAuthEnabled: true } });
    expect(JSON.stringify(auth)).not.toContain("private-preview");
    expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain("private-preview");
    const reset = await call("reset_preview_auth", { expectedRevision: await revision() });
    expect(reset.structuredContent).toMatchObject({ site: { previewAuthEnabled: false } });
  });

  it("rejects deploy path traversal before accessing files or making HTTP requests", async () => {
    for (const deploy of ["../other", "/tmp", "a/b", ".selflify"]) {
      expect((await call("check_deploy", { deploy })).isError).toBe(true);
    }
  });

  it("does not follow legacy storage links into another site", async () => {
    await fs.mkdir(path.join(root, "sites/other/stable"), { recursive: true });
    await fs.writeFile(path.join(root, "sites/other/stable/index.html"), "other site");
    await fs.symlink(path.join(root, "sites/other/stable"), path.join(root, "sites/app/linked"));
    expect((await call("check_deploy", { deploy: "linked" })).isError).toBe(true);
    await fs.rm(path.join(root, "sites/app"), { recursive: true });
    await fs.symlink(path.join(root, "sites/other"), path.join(root, "sites/app"));
    for (const name of ["get_site_stats", "list_deploys"]) {
      const result = await call(name);
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result)).not.toContain(root);
    }
  });

  it("distinguishes HTTP protection, redirects, missing files and commit readiness", async () => {
    const config = await readSelflifyConfig();
    const site = config.sites[0];
    const commit = "a".repeat(40);
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("protected", { status: 401 }));
    expect(await checkDeploy(config, site, "stable", undefined, fetchMock)).toMatchObject({
      exists: true,
      hasIndex: true,
      status: "auth_required",
      ready: false,
    });
    fetchMock.mockResolvedValue(
      new Response(null, { status: 302, headers: { Location: "https://evil.test" } }),
    );
    expect(await checkDeploy(config, site, "stable", undefined, fetchMock)).toMatchObject({
      status: "redirect",
      ready: false,
    });
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: "manual" });
    fetchMock.mockResolvedValue(new Response("ok"));
    expect(await checkDeploy(config, site, "missing", undefined, fetchMock)).toMatchObject({
      exists: false,
      hasIndex: false,
      ready: false,
    });
    fetchMock.mockResolvedValue(new Response("ok"));
    expect(await checkDeploy(config, site, "stable", commit, fetchMock)).toMatchObject({
      markerExists: false,
      ready: false,
    });
    await fs.mkdir(path.join(root, "sites/app/stable/__preview_commit__"));
    await fs.writeFile(path.join(root, "sites/app/stable/__preview_commit__", commit), "ready");
    fetchMock.mockResolvedValue(new Response("ready"));
    expect(await checkDeploy(config, site, "stable", commit, fetchMock)).toMatchObject({
      markerExists: true,
      ready: true,
    });
    fetchMock.mockRejectedValue(new DOMException("timed out", "TimeoutError"));
    expect(await checkDeploy(config, site, "stable", undefined, fetchMock)).toMatchObject({
      status: "timeout",
      ready: false,
    });
  });

  it("prepares, uploads and publishes a local build without Git or CI", async () => {
    token = await mint({ preview: true });
    uploadServer = await createUploadServer({
      root: path.join(root, "sites"),
      state: path.join(root, "upload-state"),
      permissions: getDeployPermissionsPath(),
    });
    await new Promise<void>((resolve) => uploadServer!.listen(0, "127.0.0.1", resolve));
    const upstream = `127.0.0.1:${(uploadServer.address() as { port: number }).port}`;
    vi.stubEnv("SELFLIFY_UPLOAD_UPSTREAM", upstream);
    const pack = tar.pack();
    pack.entry({ name: "index.html" }, "local uncommitted build");
    pack.finalize();
    const chunks: Buffer[] = [];
    for await (const chunk of pack) chunks.push(Buffer.from(chunk as Uint8Array));
    const content = gzipSync(Buffer.concat(chunks));
    const args = {
      deploy: "dev-feature",
      size: content.length,
      sha256: crypto.createHash("sha256").update(content).digest("hex"),
      idempotencyKey: crypto.randomUUID(),
    };
    const prepared = await call("prepare_deploy", args);
    expect(prepared.isError).not.toBe(true);
    const uploadId = prepared.structuredContent.id;
    expect((await call("prepare_deploy", args)).structuredContent.id).toBe(uploadId);
    expect(prepared.structuredContent.uploadUrl).toEqual(
      expect.stringContaining("https://example.test/api/deploy/v1/uploads/"),
    );
    const uploadUrl = new URL(String(prepared.structuredContent.uploadUrl));
    const response = await fetch(`http://${upstream}${uploadUrl.pathname}${uploadUrl.search}`, {
      method: "PUT",
      headers: { "Content-Length": String(content.length) },
      body: new Uint8Array(content),
    });
    expect(response.status).toBe(200);
    expect((await call("get_deploy_status", { uploadId })).structuredContent.state).toBe(
      "validated",
    );
    expect((await call("publish_deploy", { uploadId })).structuredContent).toMatchObject({
      state: "published",
      url: "https://dev-feature.app.example.test",
    });
    expect((await call("publish_deploy", { uploadId })).structuredContent.state).toBe("published");
    const release = await currentRelease(path.join(root, "sites/app/dev-feature"));
    expect(await fs.readFile(path.join(release!, "index.html"), "utf8")).toBe(
      "local uncommitted build",
    );
    const rejected = await call("prepare_deploy", {
      ...args,
      deploy: "stable",
      idempotencyKey: crypto.randomUUID(),
    });
    expect(rejected.isError).toBe(true);
    token = await mint();
    expect((await call("get_deploy_status", { uploadId })).isError).toBe(true);
    expect(
      (await call("prepare_deploy", { ...args, idempotencyKey: crypto.randomUUID() })).isError,
    ).toBe(true);
  });
});
