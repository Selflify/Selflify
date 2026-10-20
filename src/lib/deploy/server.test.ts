import { execFile } from "node:child_process";
import { promisify } from "node:util";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import tar from "tar-stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDefaultConfig, readSelflifyConfig, writeSelflifyConfig } from "@/lib/config/service";
import { extractBuild } from "@/lib/deploy/archive";
import { getDeploymentSiteId, writeDeployPermissions } from "@/lib/deploy/permissions";
import { withDeployLock } from "@/lib/deploy/lock";
import { currentRelease } from "@/lib/deploy/publication";
import { createUploadServer } from "@/lib/deploy/server";
import { createDeployToken, revokeDeployToken } from "@/lib/deploy/tokens";
import { runCleanupOnce } from "@/lib/cleanup/service";

async function archive(
  entries: Array<{
    name: string;
    type?: "file" | "directory" | "symlink" | "link";
    contents?: string;
    linkname?: string;
  }>,
) {
  const pack = tar.pack();
  for (const entry of entries) {
    const contents = entry.contents ?? "";
    pack.entry(
      {
        name: entry.name,
        type: entry.type ?? "file",
        size: Buffer.byteLength(contents),
        linkname: entry.linkname,
      },
      contents,
    );
  }
  pack.finalize();
  const chunks: Buffer[] = [];
  for await (const chunk of pack) chunks.push(Buffer.from(chunk as Uint8Array));
  return gzipSync(Buffer.concat(chunks));
}

describe("HTTPS deployment protocol", () => {
  let root: string;
  let origin: string;
  let server: http.Server;
  let token: string;
  let content: Buffer;
  let events: Record<string, unknown>[];
  let permissionsPath: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "selflify-upload-test-"));
    permissionsPath = path.join(root, "permissions", "permissions.json");
    vi.stubEnv("SELFLIFY_CONFIG_PATH", path.join(root, "config.json"));
    vi.stubEnv("SELFLIFY_DEPLOY_PERMISSIONS_PATH", permissionsPath);
    vi.stubEnv("SELFLIFY_PREVIEW_ROOT", path.join(root, "sites"));
    vi.stubEnv("SELFLIFY_DEPLOY_LOCK_PATH", path.join(root, "locks", "operation"));
    const config = createDefaultConfig();
    config.server.domain = "example.test";
    config.server.cloudflareApiToken = "private-cloudflare-token";
    config.sessionSecret = "private-admin-session-secret";
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
    token = await createDeployToken("app", {
      name: "CI",
      expiresAt: new Date(Date.now() + 86400_000).toISOString(),
      stable: false,
      revision: 0,
    });
    events = [];
    server = await createUploadServer({
      root: path.join(root, "sites"),
      state: path.join(root, "state"),
      permissions: permissionsPath,
      logger: (event) => events.push(event),
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    content = await archive([
      { name: "index.html", contents: "new build" },
      { name: "assets/main.js", contents: "console.log('build')" },
    ]);
  });
  afterEach(async () => {
    server?.closeAllConnections();
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    await fs.rm(root, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });
  async function request(
    endpoint: string,
    method = "GET",
    body?: Buffer | string,
    headers: Record<string, string> = {},
  ) {
    return fetch(`${origin}/api/deploy/v1${endpoint}`, {
      method,
      body: Buffer.isBuffer(body) ? new Uint8Array(body) : body,
      headers: { Authorization: `Bearer ${token}`, ...headers },
    });
  }
  async function create(
    deploy = "pr-123",
    key = crypto.randomUUID(),
    site = "app",
    build = content,
  ) {
    return request(
      "/uploads",
      "POST",
      JSON.stringify({
        site,
        deploy,
        size: build.length,
        sha256: crypto.createHash("sha256").update(build).digest("hex"),
      }),
      { "Idempotency-Key": key },
    );
  }
  async function validated(build = content) {
    const created = await create("pr-123", crypto.randomUUID(), "app", build);
    expect(created.status).toBe(201);
    const { id } = await created.json();
    const uploaded = await request(`/uploads/${id}/content`, "PUT", build);
    return { id: id as string, uploaded };
  }

  it("limits a content ticket to its upload and rejects other operations and tampering", async () => {
    const created = await (await create()).json();
    const another = await (await create("another")).json();
    const ticket = created.contentTicket;
    const put = (id: string, value: string) =>
      request(`/uploads/${id}/content?ticket=${value}`, "PUT", content, { Authorization: "" });
    expect((await put(another.id, ticket)).status).toBe(401);
    expect((await put(created.id, "0".repeat(64))).status).toBe(401);
    expect(
      (
        await request(`/uploads/${created.id}?ticket=${ticket}`, "GET", undefined, {
          Authorization: "",
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await request(`/uploads/${created.id}/publish?ticket=${ticket}`, "POST", undefined, {
          Authorization: "",
        })
      ).status,
    ).toBe(401);
    expect((await put(created.id, ticket)).status).toBe(200);
    expect((await request(`/uploads/${created.id}`)).status).toBe(200);
    expect(JSON.stringify(await (await request(`/uploads/${created.id}`)).json())).not.toContain(
      ticket,
    );
    expect(JSON.stringify(events)).not.toContain(ticket);
  });

  it.each(["revoked", "expired", "permission", "site", "timeout"])(
    "rejects content tickets after %s changes",
    async (change) => {
      const created = await (await create()).json();
      const config = await readSelflifyConfig();
      if (change === "revoked") config.deployTokens[0].revokedAt = new Date().toISOString();
      if (change === "expired")
        config.deployTokens[0].expiresAt = new Date(Date.now() - 1000).toISOString();
      if (change === "permission") config.deployTokens[0].scopes = ["mcp:read"];
      if (change === "site") config.sites[0].deploymentId = crypto.randomUUID();
      await writeSelflifyConfig(config);
      if (change === "timeout") {
        const file = path.join(root, "state", `${created.id}.json`);
        const record = JSON.parse(await fs.readFile(file, "utf8"));
        record.createdAt = new Date(Date.now() - 31 * 60_000).toISOString();
        await fs.writeFile(file, JSON.stringify(record));
      }
      const response = await request(
        `/uploads/${created.id}/content?ticket=${created.contentTicket}`,
        "PUT",
        content,
        { Authorization: "" },
      );
      expect(response.status).toBe(["permission", "site"].includes(change) ? 403 : 401);
    },
  );

  it("publishes complete builds atomically, preserves legacy files and supports retries", async () => {
    const legacy = path.join(root, "sites/app/pr-123");
    await fs.mkdir(legacy, { recursive: true });
    await fs.writeFile(path.join(legacy, "index.html"), "legacy");
    const { id, uploaded } = await validated();
    expect(uploaded.status).toBe(200);
    expect(await fs.readFile(path.join(legacy, "index.html"), "utf8")).toBe("legacy");
    const publish = await request(`/uploads/${id}/publish`, "POST");
    expect(publish.status).toBe(200);
    expect(await publish.json()).toMatchObject({
      state: "published",
      url: "https://pr-123.app.example.test",
    });
    const release = await currentRelease(legacy);
    expect(await fs.readFile(path.join(release!, "index.html"), "utf8")).toBe("new build");
    expect((await (await request(`/uploads/${id}/publish`, "POST")).json()).state).toBe(
      "published",
    );
    expect(events.filter((event) => event.event === "deploy-published")).toHaveLength(1);
    expect(JSON.stringify(events)).not.toContain(token);
    expect(await fs.readFile(permissionsPath, "utf8")).not.toContain("private-");
    expect(await fs.readFile(path.join(root, "config.json"), "utf8")).not.toContain(
      token.split(".")[1],
    );
  });
  it("deploys through the actual CLI package and retries a completed CI job", async () => {
    const build = path.join(root, "build");
    await fs.mkdir(build);
    await fs.writeFile(path.join(build, "index.html"), "cli build");
    const key = crypto.randomUUID();
    const args = [
      "packages/selflify-cli/bin/selflify.mjs",
      "deploy",
      build,
      "--server",
      origin,
      "--site",
      "app",
      "--deploy",
      "cli-preview",
      "--allow-local-http",
      "--idempotency-key",
      key,
    ];
    const exec = promisify(execFile);
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await exec(process.execPath, args, {
        env: { ...process.env, SELFLIFY_DEPLOY_TOKEN: token },
      });
      expect(result.stdout.trim()).toBe("https://cli-preview.app.example.test");
      expect(result.stderr).toBe("");
    }
    expect(events.filter((event) => event.event === "deploy-published")).toHaveLength(1);
  });
  it("rejects stable, other sites, missing auth and metadata paths", async () => {
    expect((await create("stable")).status).toBe(403);
    expect((await create("preview", crypto.randomUUID(), "other")).status).toBe(403);
    expect((await create("../stable")).status).toBe(400);
    expect((await fetch(`${origin}/api/deploy/v1/uploads`, { method: "POST" })).status).toBe(401);
  });
  it("allows stable only with a separately granted scope", async () => {
    token = await createDeployToken("app", {
      name: "release",
      expiresAt: new Date(Date.now() + 86400_000).toISOString(),
      stable: true,
      revision: 1,
    });
    const created = await create("stable");
    expect(created.status).toBe(201);
    const { id } = await created.json();
    expect((await request(`/uploads/${id}/content`, "PUT", content)).status).toBe(200);
    expect(await (await request(`/uploads/${id}/publish`, "POST")).json()).toMatchObject({
      url: "https://app.example.test",
    });
  });
  it("checks revocation and changes to the stable branch again at publication", async () => {
    const { id } = await validated();
    const config = await readSelflifyConfig();
    config.sites[0].mainBranch = "pr-123";
    await writeSelflifyConfig(config);
    expect((await request(`/uploads/${id}/publish`, "POST")).status).toBe(403);
    config.sites[0].mainBranch = "stable";
    await writeSelflifyConfig(config);
    await revokeDeployToken("app", config.deployTokens[0].id, config.configRevision);
    expect((await request(`/uploads/${id}/publish`, "POST")).status).toBe(401);
    expect(await currentRelease(path.join(root, "sites/app/pr-123"))).toBeNull();
  });
  it("waits for a config write instead of failing a valid in-flight upload", async () => {
    const { id } = await (await create()).json();
    const config = await readSelflifyConfig();
    let send: http.ClientRequest;
    const completed = new Promise<number>((resolve, reject) => {
      send = http.request(
        `${origin}/api/deploy/v1/uploads/${id}/content`,
        {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}`, "Content-Length": content.length },
        },
        (response) => {
          response.resume();
          response.on("end", () => resolve(response.statusCode!));
        },
      );
      send.on("error", reject);
    });
    const split = Math.floor(content.length / 2);
    send!.write(content.subarray(0, split));
    await vi.waitFor(async () => {
      expect(
        JSON.parse(await fs.readFile(path.join(root, "state", `${id}.json`), "utf8")).state,
      ).toBe("receiving");
    });
    let unlock: () => void;
    let ready: () => void;
    const release = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    const locked = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const writer = withDeployLock(async () => {
      await writeDeployPermissions(null);
      ready!();
      await release;
      await writeDeployPermissions(config);
    });
    await locked;
    try {
      send!.end(content.subarray(split));
      await vi.waitFor(async () => {
        const stage = path.join(root, "sites/.selflify-uploads", id);
        expect((await fs.stat(path.join(stage, "build/assets/main.js"))).isFile()).toBe(true);
        expect(await fs.stat(path.join(stage, "archive.tar.gz")).catch(() => null)).toBeNull();
      });
    } finally {
      unlock!();
      await writer;
    }
    expect(await completed).toBe(200);
  });
  it("does not resurrect permissions when a slug is recreated", async () => {
    const config = await readSelflifyConfig();
    config.sites[0].deploymentId = crypto.randomUUID();
    await writeSelflifyConfig(config);
    expect((await create()).status).toBe(403);
  });
  it("isolates upload IDs between tokens and enforces idempotency", async () => {
    const key = crypto.randomUUID();
    const first = await (await create("pr-123", key)).json();
    expect(await (await create("pr-123", key)).json()).toMatchObject({ id: first.id });
    expect((await create("other", key)).status).toBe(409);
    token = await createDeployToken("app", {
      name: "second",
      expiresAt: new Date(Date.now() + 86400_000).toISOString(),
      stable: false,
      revision: 1,
    });
    expect((await request(`/uploads/${first.id}`)).status).toBe(404);
  });
  it("does not roll back a newer release when an older publication is retried", async () => {
    const first = await validated();
    await request(`/uploads/${first.id}/publish`, "POST");
    const next = await archive([{ name: "index.html", contents: "next build" }]);
    const second = await validated(next);
    await request(`/uploads/${second.id}/publish`, "POST");
    expect((await request(`/uploads/${first.id}/publish`, "POST")).status).toBe(200);
    const current = await currentRelease(path.join(root, "sites/app/pr-123"));
    expect(await fs.readFile(path.join(current!, "index.html"), "utf8")).toBe("next build");
  });
  it("limits pending uploads and rejects incorrect checksums", async () => {
    const created = await (await create()).json();
    const wrong = Buffer.from(content);
    wrong[0] ^= 1;
    expect((await request(`/uploads/${created.id}/content`, "PUT", wrong)).status).toBe(422);
    for (let index = 0; index < 4; index++)
      expect((await create(`pending-${index}`)).status).toBe(201);
    expect((await create("one-too-many")).status).toBe(429);
  });
  it("rejects expired tokens and recovers an interrupted transfer after restart", async () => {
    const { id } = await (await create()).json();
    const statePath = path.join(root, "state", `${id}.json`);
    const record = JSON.parse(await fs.readFile(statePath, "utf8"));
    record.state = "receiving";
    await fs.writeFile(statePath, JSON.stringify(record));
    await fs.mkdir(path.join(root, "sites/.selflify-uploads", id));
    await fs.writeFile(
      path.join(root, "sites/.selflify-uploads", id, "partial"),
      "partial archive",
    );
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    server = await createUploadServer({
      root: path.join(root, "sites"),
      state: path.join(root, "state"),
      permissions: permissionsPath,
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    expect(await (await request(`/uploads/${id}`)).json()).toMatchObject({ state: "failed" });
    expect(await fs.readdir(path.join(root, "sites/.selflify-uploads"))).toEqual([]);
    const config = await readSelflifyConfig();
    config.deployTokens[0].expiresAt = new Date(0).toISOString();
    await writeSelflifyConfig(config);
    expect((await create()).status).toBe(401);
  });
  it("rejects a corrupted archive without changing the live build", async () => {
    const corrupted = Buffer.from("not gzip");
    const { id, uploaded } = await validated(corrupted);
    expect(uploaded.status).toBe(422);
    expect((await request(`/uploads/${id}/publish`, "POST")).status).toBe(409);
    expect(await fs.readdir(path.join(root, "sites/.selflify-uploads"))).toEqual([]);
  });
  it("refuses legacy symlink roots instead of writing outside the site", async () => {
    const { id } = await validated();
    await fs.mkdir(path.join(root, "outside"));
    await fs.mkdir(path.join(root, "sites/app"));
    await fs.symlink(path.join(root, "outside"), path.join(root, "sites/app/pr-123"));
    expect((await request(`/uploads/${id}/publish`, "POST")).status).toBe(409);
    expect(await fs.readdir(path.join(root, "outside"))).toEqual([]);
  });
  it("keeps managed stable releases and cleans stale preview directories", async () => {
    const { id } = await validated();
    await request(`/uploads/${id}/publish`, "POST");
    const config = await readSelflifyConfig();
    config.sites[0].mainBranch = "pr-123";
    await fs.utimes(path.join(root, "sites/app/pr-123"), new Date(0), new Date(0));
    const report = await runCleanupOnce(config, { previewTtlDays: 1, orphanTtlDays: 1 });
    expect(report.removedPreviewDirs).toEqual([]);
    config.sites[0].mainBranch = "stable";
    expect(
      (await runCleanupOnce(config, { previewTtlDays: 1, orphanTtlDays: 1 })).removedPreviewDirs,
    ).toHaveLength(1);
  });
  it("reconciles a crash after switching the release pointer", async () => {
    const { id } = await validated();
    await request(`/uploads/${id}/publish`, "POST");
    const statePath = path.join(root, "state", `${id}.json`);
    const state = JSON.parse(await fs.readFile(statePath, "utf8"));
    state.state = "publishing";
    await fs.writeFile(statePath, JSON.stringify(state));
    expect(await (await request(`/uploads/${id}`)).json()).toMatchObject({ state: "published" });
    expect((await request(`/uploads/${id}/publish`, "POST")).status).toBe(200);
  });
  it("binds legacy site IDs to their original creation time", () => {
    const config = createDefaultConfig();
    const site = { ...config.sites[0], slug: "legacy", createdAt: "2026-01-01T00:00:00.000Z" };
    expect(getDeploymentSiteId(site)).not.toBe(
      getDeploymentSiteId({ ...site, createdAt: "2026-02-01T00:00:00.000Z" }),
    );
  });
  it.each([
    { name: "../escape", contents: "bad" },
    { name: "/absolute", contents: "bad" },
    { name: "nested/../../escape", contents: "bad" },
    { name: ".selflify/current/index.html", contents: "bad" },
    { name: "link", type: "symlink" as const, linkname: "../escape" },
    { name: "link", type: "link" as const, linkname: "index.html" },
  ])("rejects unsafe archive entry $name ($type)", async (entry) => {
    const file = path.join(root, "unsafe.tar.gz");
    await fs.writeFile(file, await archive([{ name: "index.html", contents: "safe" }, entry]));
    await expect(extractBuild(file, path.join(root, "unpack"))).rejects.toThrow();
  });
  it("rejects duplicate files and missing index.html", async () => {
    const file = path.join(root, "unsafe.tar.gz");
    await fs.writeFile(
      file,
      await archive([
        { name: "index.html", contents: "one" },
        { name: "index.html", contents: "two" },
      ]),
    );
    await expect(extractBuild(file, path.join(root, "unpack"))).rejects.toThrow("duplicate");
    await fs.writeFile(file, await archive([{ name: "main.js", contents: "one" }]));
    await expect(extractBuild(file, path.join(root, "unpack2"))).rejects.toThrow("index.html");
  });
});
