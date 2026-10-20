import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { gzipSync } from "node:zlib";
import tar from "tar-stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { auth, type OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformationMixed,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { createDefaultConfig, readSelflifyConfig, writeSelflifyConfig } from "@/lib/config/service";
import { getDeployPermissionsPath } from "@/lib/config/paths";
import { getDeploymentSiteId } from "@/lib/deploy/permissions";
import { createUploadServer } from "@/lib/deploy/server";
import { authorizeMcp } from "@/lib/mcp/auth";
import { createMcpHandler } from "@/lib/mcp/handler";
import { createOAuthHandler, oauthHeaders } from "@/lib/mcp/oauth-http";
import {
  approveMcpAccess,
  createManualMcpAccess,
  denyMcpAccess,
  exchangeMcpToken,
  readConsentRequest,
  registerMcpClient,
  revokeMcpAccess,
} from "@/lib/mcp/oauth";
import { mcpAuthorizationMetadata, mcpProtectedMetadata, mcpResource } from "@/lib/mcp/oauth-urls";

describe("MCP consent and OAuth", () => {
  let root: string;
  let clientId: string;
  let siteIds: string[];
  let server: http.Server | undefined;
  const verifier = "v".repeat(64);
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const redirectUri = "http://127.0.0.1:8123/callback";

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "selflify-oauth-"));
    vi.stubEnv("SELFLIFY_CONFIG_PATH", path.join(root, "config.json"));
    vi.stubEnv("SELFLIFY_DEPLOY_PERMISSIONS_PATH", path.join(root, "permissions.json"));
    vi.stubEnv("SELFLIFY_DEPLOY_LOCK_PATH", path.join(root, "lock", "operation"));
    vi.stubEnv("SELFLIFY_PREVIEW_ROOT", path.join(root, "sites"));
    vi.stubEnv("SELFLIFY_DEV_MODE", "0");
    vi.spyOn(console, "info").mockImplementation(() => {});
    const config = createDefaultConfig();
    config.server.domain = "example.test";
    config.admin = {
      login: "owner",
      passwordHash: "test-password-hash",
      configuredAt: new Date().toISOString(),
    };
    config.sites = ["app", "docs", "private"].map((slug) => ({
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
    siteIds = config.sites.map(getDeploymentSiteId);
    await writeSelflifyConfig(config);
    clientId = (
      await registerMcpClient({
        client_name: "Test coding agent",
        redirect_uris: [redirectUri],
        token_endpoint_auth_method: "none",
      })
    ).client_id;
  });
  afterEach(async () => {
    server?.closeAllConnections();
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
    await fs.rm(root, { recursive: true, force: true });
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  function consent() {
    return {
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code" as const,
      code_challenge: challenge,
      code_challenge_method: "S256" as const,
      resource: "https://example.test/mcp",
      state: "request-state",
    };
  }
  async function approved(
    selection = {
      allSites: false,
      siteIds: siteIds.slice(0, 2),
      scopes: ["mcp:read", "preview:write"],
    },
  ) {
    const target = new URL(await approveMcpAccess(consent(), selection));
    expect(target.searchParams.get("state")).toBe("request-state");
    return {
      grant_type: "authorization_code",
      client_id: clientId,
      redirect_uri: redirectUri,
      resource: "https://example.test/mcp",
      code: target.searchParams.get("code")!,
      code_verifier: verifier,
    };
  }
  async function tool(token: string, name: string, args = {}) {
    const response = await createMcpHandler()(
      new Request("https://example.test/mcp", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name, arguments: args },
        }),
      }),
    );
    return (await response.json()).result;
  }

  it("announces discovery and PKCE through metadata and a 401 challenge", async () => {
    const config = await readSelflifyConfig();
    const result = await createMcpHandler()(
      new Request("https://example.test/mcp", { method: "POST" }),
    );
    expect(result.status).toBe(401);
    expect(result.headers.get("www-authenticate")).toContain(
      'resource_metadata="https://example.test/.well-known/oauth-protected-resource/mcp"',
    );
    expect(mcpProtectedMetadata(config)).toMatchObject({
      resource: "https://example.test/mcp",
      authorization_servers: ["https://example.test"],
    });
    expect(mcpAuthorizationMetadata(config)).toMatchObject({
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
    });
  });

  it("supports public client registration with exact secure redirect addresses", async () => {
    for (const uri of [
      "http://evil.test/callback",
      "https://user:password@example.test/callback",
      "https://example.test/callback#fragment",
      "javascript:alert(1)",
    ]) {
      await expect(registerMcpClient({ redirect_uris: [uri] })).rejects.toMatchObject({
        code: "invalid_client_metadata",
      });
    }
    const config = await readSelflifyConfig();
    expect(() =>
      readConsentRequest(config, { ...consent(), redirect_uri: `${redirectUri}/other` }),
    ).toThrow("not registered");
    expect(() =>
      readConsentRequest(config, { ...consent(), code_challenge_method: "plain" }),
    ).toThrow("incomplete");
    expect(() =>
      readConsentRequest(config, { ...consent(), resource: "https://evil.test/mcp" }),
    ).toThrow("different MCP server");
    const denied = new URL(denyMcpAccess(config, consent()));
    expect(denied.searchParams.get("error")).toBe("access_denied");
    expect(denied.searchParams.get("state")).toBe("request-state");
    expect((await readSelflifyConfig()).deployTokens).toHaveLength(0);
  });

  it("enforces selected sites and requires an explicit site for multi-site tools", async () => {
    const tokens = await exchangeMcpToken(await approved());
    const listed = await tool(tokens.access_token, "list_sites");
    expect(listed.structuredContent.sites.map((site: { slug: string }) => site.slug)).toEqual([
      "app",
      "docs",
    ]);
    expect((await tool(tokens.access_token, "get_site")).isError).toBe(true);
    expect(
      (await tool(tokens.access_token, "get_site", { site: "docs" })).structuredContent.site.slug,
    ).toBe("docs");
    expect((await tool(tokens.access_token, "get_site", { site: "private" })).isError).toBe(true);
    const write = await tool(tokens.access_token, "update_site", {
      site: "app",
      name: "Renamed",
      mainBranch: "stable",
      expectedRevision: (await readSelflifyConfig()).configRevision,
    });
    expect(write.isError).toBe(true);
  });

  it("does not restore selected access when a deleted slug is recreated", async () => {
    const tokens = await exchangeMcpToken(
      await approved({ allSites: false, siteIds: [siteIds[0]], scopes: ["mcp:read"] }),
    );
    const config = await readSelflifyConfig();
    config.sites[0].deploymentId = crypto.randomUUID();
    await writeSelflifyConfig(config);
    expect(() => authorizeMcp(config, `Bearer ${tokens.access_token}`)).toThrow("existing site");
  });

  it("includes future sites only when all-sites access was approved", async () => {
    const tokens = await exchangeMcpToken(
      await approved({ allSites: true, siteIds: [], scopes: ["mcp:read"] }),
    );
    const config = await readSelflifyConfig();
    config.sites.push({ ...config.sites[0], slug: "future", deploymentId: crypto.randomUUID() });
    await writeSelflifyConfig(config);
    const listed = await tool(tokens.access_token, "list_sites");
    expect(listed.structuredContent.sites).toHaveLength(4);
    expect((await tool(tokens.access_token, "get_site", { site: "future" })).isError).not.toBe(
      true,
    );
    config.sites = [];
    await writeSelflifyConfig(config);
    expect((await tool(tokens.access_token, "list_sites")).structuredContent.sites).toEqual([]);
  });

  it("does not grant permissions that were not requested or nonexistent sites", async () => {
    await expect(
      approveMcpAccess(
        { ...consent(), scope: "mcp:read" },
        { allSites: false, siteIds: [siteIds[0]], scopes: ["mcp:read", "stable:write"] },
      ),
    ).rejects.toMatchObject({ code: "invalid_scope" });
    await expect(
      approveMcpAccess(consent(), { allSites: false, siteIds: ["missing"], scopes: ["mcp:read"] }),
    ).rejects.toMatchObject({ code: "invalid_request" });
    await expect(
      approveMcpAccess(consent(), { allSites: false, siteIds: [], scopes: ["mcp:read"] }),
    ).rejects.toMatchObject({ code: "invalid_request" });
  });

  it("binds one-time codes to PKCE, client, redirect and resource", async () => {
    const fields = await approved();
    for (const changed of [
      { code_verifier: "wrong".repeat(15) },
      { redirect_uri: "https://evil.test/callback" },
      { client_id: crypto.randomUUID() },
      { resource: "https://evil.test/mcp" },
    ]) {
      await expect(exchangeMcpToken({ ...fields, ...changed })).rejects.toBeInstanceOf(Error);
    }
    const concurrent = await Promise.allSettled([
      exchangeMcpToken(fields),
      exchangeMcpToken(fields),
    ]);
    expect(concurrent.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    await expect(exchangeMcpToken(fields)).rejects.toMatchObject({ code: "invalid_grant" });
  });

  it("rejects expired authorization codes", async () => {
    const fields = await approved();
    const config = await readSelflifyConfig();
    config.mcpOAuth.codes[0].expiresAt = new Date(Date.now() - 1000).toISOString();
    await writeSelflifyConfig(config);
    await expect(exchangeMcpToken(fields)).rejects.toMatchObject({ code: "invalid_grant" });
  });

  it("keeps approved client registrations valid after a connection is revoked", async () => {
    const tokens = await exchangeMcpToken(await approved());
    await revokeMcpAccess(tokens.access_token.slice(4, 40));
    const config = await readSelflifyConfig();
    config.mcpOAuth.clients[0].createdAt = new Date(Date.now() - 2 * 86400_000).toISOString();
    await writeSelflifyConfig(config);
    await registerMcpClient({ client_name: "Another agent", redirect_uris: [redirectUri] });
    expect(readConsentRequest(await readSelflifyConfig(), consent()).client.id).toBe(clientId);
  });

  it("rotates refresh credentials and revokes both access and refresh", async () => {
    const tokens = await exchangeMcpToken(await approved());
    const fields = {
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
      client_id: clientId,
      resource: "https://example.test/mcp",
    };
    await expect(
      exchangeMcpToken({ ...fields, scope: "mcp:read stable:write" }),
    ).rejects.toMatchObject({ code: "invalid_scope" });
    const refreshed = await exchangeMcpToken(fields);
    expect(refreshed.refresh_token).not.toBe(tokens.refresh_token);
    expect(refreshed.access_token.slice(0, 40)).toBe(tokens.access_token.slice(0, 40));
    const config = await readSelflifyConfig();
    expect(() => authorizeMcp(config, `Bearer ${tokens.access_token}`)).toThrow(
      "Invalid MCP token",
    );
    const { token } = authorizeMcp(config, `Bearer ${refreshed.access_token}`);
    await revokeMcpAccess(token.id);
    await expect(
      exchangeMcpToken({ ...fields, refresh_token: refreshed.refresh_token }),
    ).rejects.toMatchObject({ code: "invalid_grant" });
    expect(() => authorizeMcp(config, `Bearer ${refreshed.access_token}`)).not.toThrow();
    const revoked = await readSelflifyConfig();
    expect(() => authorizeMcp(revoked, `Bearer ${refreshed.access_token}`)).toThrow(
      "Invalid MCP token",
    );
  });

  it("revokes a connection when a used refresh credential is replayed", async () => {
    const tokens = await exchangeMcpToken(await approved());
    const fields = {
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
      client_id: clientId,
      resource: "https://example.test/mcp",
    };
    const rotated = await exchangeMcpToken(fields);
    await expect(exchangeMcpToken(fields)).rejects.toMatchObject({ code: "invalid_grant" });
    const config = await readSelflifyConfig();
    expect(() => authorizeMcp(config, `Bearer ${rotated.access_token}`)).toThrow(
      "Invalid MCP token",
    );
    await expect(
      exchangeMcpToken({ ...fields, refresh_token: rotated.refresh_token }),
    ).rejects.toMatchObject({ code: "invalid_grant" });
  });

  it("stores only credential hashes and omits refresh hashes from upload permissions", async () => {
    const tokens = await exchangeMcpToken(await approved());
    const raw = await fs.readFile(path.join(root, "config.json"), "utf8");
    for (const credential of [
      tokens.access_token.split(".")[1],
      tokens.refresh_token.split(".")[1],
    ])
      expect(raw).not.toContain(credential);
    const projection = await fs.readFile(getDeployPermissionsPath(), "utf8");
    expect(projection).not.toContain("refreshHash");
    expect(projection).not.toContain("refreshExpiresAt");
    expect(projection).not.toContain("mcpOAuth");
  });

  it("creates and revokes manual connections with multiple sites", async () => {
    const token = await createManualMcpAccess({
      name: "Local agent",
      allSites: false,
      siteIds: siteIds.slice(0, 2),
      scopes: ["mcp:read"],
      days: 30,
    });
    const listed = await tool(token, "list_sites");
    expect(listed.structuredContent.sites).toHaveLength(2);
    await revokeMcpAccess(token.slice(4, 40));
    const config = await readSelflifyConfig();
    expect(() => authorizeMcp(config, `Bearer ${token}`)).toThrow("Invalid MCP token");
  });

  it("applies the selected site and environment permissions in the upload service", async () => {
    const tokens = await exchangeMcpToken(await approved());
    server = await createUploadServer({
      root: path.join(root, "sites"),
      state: path.join(root, "uploads"),
      permissions: getDeployPermissionsPath(),
    });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    for (const [site, deploy, status] of [
      ["app", "feature", 201],
      ["docs", "feature", 201],
      ["private", "feature", 403],
      ["app", "stable", 403],
    ] as const) {
      const response = await fetch(`${origin}/api/deploy/v1/uploads`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({ site, deploy, size: 100, sha256: "a".repeat(64) }),
      });
      expect(response.status).toBe(status);
    }
  });

  it.each([false, true])(
    "deploys through OAuth without exposing credentials with allSites=%s",
    async (allSites) => {
      const tokens = await exchangeMcpToken(
        await approved({
          allSites,
          siteIds: allSites ? [] : siteIds.slice(0, 2),
          scopes: ["mcp:read", "preview:write", "stable:write"],
        }),
      );
      server = await createUploadServer({
        root: path.join(root, "sites"),
        state: path.join(root, "uploads"),
        permissions: getDeployPermissionsPath(),
      });
      await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
      const upstream = `127.0.0.1:${(server.address() as { port: number }).port}`;
      vi.stubEnv("SELFLIFY_UPLOAD_UPSTREAM", upstream);
      const config = await readSelflifyConfig();
      config.sites.push({ ...config.sites[0], slug: "future", deploymentId: crypto.randomUUID() });
      await writeSelflifyConfig(config);
      const pack = tar.pack();
      pack.entry({ name: "index.html" }, "OAuth build");
      pack.finalize();
      const chunks: Buffer[] = [];
      for await (const chunk of pack) chunks.push(Buffer.from(chunk as Uint8Array));
      const content = gzipSync(Buffer.concat(chunks));
      const args = {
        deploy: "feature",
        size: content.length,
        sha256: crypto.createHash("sha256").update(content).digest("hex"),
      };
      expect(
        (
          await tool(tokens.access_token, "prepare_deploy", {
            ...args,
            idempotencyKey: crypto.randomUUID(),
          })
        ).isError,
      ).toBe(true);
      for (const site of ["app", "docs", "private", "future"]) {
        const prepared = await tool(tokens.access_token, "prepare_deploy", {
          ...args,
          site,
          idempotencyKey: crypto.randomUUID(),
        });
        const denied = !allSites && ["private", "future"].includes(site);
        expect(prepared.isError === true).toBe(denied);
        if (denied) continue;
        expect(JSON.stringify(prepared)).not.toContain(tokens.access_token);
        expect(JSON.stringify(prepared)).not.toContain(tokens.refresh_token);
        const { id, uploadUrl } = prepared.structuredContent;
        const url = new URL(uploadUrl);
        expect(url.origin).toBe("https://example.test");
        expect(
          (
            await fetch(`http://${upstream}${url.pathname}${url.search}`, {
              method: "PUT",
              body: new Uint8Array(content),
            })
          ).status,
        ).toBe(200);
        expect(
          (await tool(tokens.access_token, "publish_deploy", { uploadId: id })).structuredContent,
        ).toMatchObject({
          state: "published",
          url: `https://feature.${site}.example.test`,
        });
        const stable = await tool(tokens.access_token, "prepare_deploy", {
          ...args,
          site,
          deploy: "stable",
          idempotencyKey: crypto.randomUUID(),
        });
        const stableUrl = new URL(stable.structuredContent.uploadUrl);
        expect(
          (
            await fetch(`http://${upstream}${stableUrl.pathname}${stableUrl.search}`, {
              method: "PUT",
              body: new Uint8Array(content),
            })
          ).status,
        ).toBe(200);
        expect(
          (
            await tool(tokens.access_token, "publish_deploy", {
              uploadId: stable.structuredContent.id,
            })
          ).structuredContent,
        ).toMatchObject({
          state: "published",
          url: `https://${site}.example.test`,
        });
      }
    },
  );

  it("supports discovery, registration and exchange with the official SDK OAuth client", async () => {
    let information: OAuthClientInformationMixed | undefined;
    let tokens: OAuthTokens | undefined;
    let codeVerifier = "";
    let target: URL | undefined;
    const provider: OAuthClientProvider = {
      redirectUrl: redirectUri,
      clientMetadata: {
        client_name: "SDK client",
        redirect_uris: [redirectUri],
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
      },
      clientInformation: () => information,
      saveClientInformation: (value) => {
        information = value;
      },
      tokens: () => tokens,
      saveTokens: (value) => {
        tokens = value;
      },
      saveCodeVerifier: (value) => {
        codeVerifier = value;
      },
      codeVerifier: () => codeVerifier,
      state: () => "sdk-state",
      redirectToAuthorization: (url) => {
        target = url;
      },
    };
    const handle = createOAuthHandler();
    const fetchFn: typeof fetch = async (input, init) => {
      const request = new Request(input, init);
      const pathname = new URL(request.url).pathname;
      const config = await readSelflifyConfig();
      if (pathname === "/.well-known/oauth-protected-resource/mcp")
        return Response.json(mcpProtectedMetadata(config), { headers: oauthHeaders });
      if (pathname === "/.well-known/oauth-authorization-server")
        return Response.json(mcpAuthorizationMetadata(config), { headers: oauthHeaders });
      return handle(request, pathname.split("/").pop()!);
    };
    expect(await auth(provider, { serverUrl: "https://example.test/mcp", fetchFn })).toBe(
      "REDIRECT",
    );
    const config = await readSelflifyConfig();
    const { request } = readConsentRequest(config, Object.fromEntries(target!.searchParams));
    const callback = new URL(
      await approveMcpAccess(request, {
        allSites: false,
        siteIds: [siteIds[0]],
        scopes: ["mcp:read"],
      }),
    );
    expect(
      await auth(provider, {
        serverUrl: mcpResource(config),
        authorizationCode: callback.searchParams.get("code")!,
        fetchFn,
      }),
    ).toBe("AUTHORIZED");
    expect(tokens!.access_token).toMatch(/^slf_/);
    expect((await tool(tokens!.access_token, "get_site")).structuredContent.site.slug).toBe("app");
  });
});
