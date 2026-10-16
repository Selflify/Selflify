import crypto from "node:crypto";
import { z } from "zod";

import type { SelflifyConfig, DeployToken } from "@/lib/config/schema";
import { readSelflifyConfig, writeSelflifyConfig, isAdminConfigured } from "@/lib/config/service";
import { getDeploymentSiteId, hashDeploySecret } from "@/lib/deploy/permissions";
import { runSerializedTask } from "@/lib/operations";
import { MCP_SCOPES, mcpResource, type McpScope } from "@/lib/mcp/oauth-urls";

const ACCESS_SECONDS = 3600;
const GRANT_MS = 30 * 86400_000;

export class OAuthError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

function fail(code: string, message: string): never {
  throw new OAuthError(code, message);
}
function sameHash(secret: string, hash: string) {
  return crypto.timingSafeEqual(
    Buffer.from(hashDeploySecret(secret), "hex"),
    Buffer.from(hash, "hex"),
  );
}
function parseScopes(value: string | undefined): McpScope[] {
  const scopes =
    value === undefined ? [...MCP_SCOPES] : [...new Set(value.split(" ").filter(Boolean))];
  if (
    !scopes.length ||
    scopes.some((scope) => !(MCP_SCOPES as readonly string[]).includes(scope)) ||
    !scopes.includes("mcp:read")
  ) {
    fail("invalid_scope", "MCP read access is required. Request only supported permissions.");
  }
  return scopes as McpScope[];
}

function isRedirectUri(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      !url.username &&
      !url.password &&
      !url.hash &&
      (url.protocol === "https:" ||
        (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
    );
  } catch {
    return false;
  }
}

const registrationSchema = z.object({
  client_name: z.string().trim().min(1).max(80).default("MCP client"),
  redirect_uris: z.array(z.string().max(2048).refine(isRedirectUri)).min(1).max(10),
  token_endpoint_auth_method: z.literal("none").default("none"),
  grant_types: z.array(z.enum(["authorization_code", "refresh_token"])).optional(),
  response_types: z.array(z.literal("code")).optional(),
});

export async function registerMcpClient(input: unknown) {
  const parsed = registrationSchema.safeParse(input);
  if (!parsed.success)
    fail(
      "invalid_client_metadata",
      "Provide HTTPS or loopback redirect URIs and public client authentication.",
    );
  return runSerializedTask(async () => {
    const config = await readSelflifyConfig();
    if (!isAdminConfigured(config))
      fail("temporarily_unavailable", "Complete Selflify setup first.");
    const now = Date.now();
    config.mcpOAuth.clients = config.mcpOAuth.clients.filter(
      (client) =>
        Date.parse(client.createdAt) > now - 86400_000 ||
        config.deployTokens.some((token) => token.oauth?.clientId === client.id),
    );
    if (config.mcpOAuth.clients.length >= 200)
      throw new OAuthError(
        "temporarily_unavailable",
        "Client registration capacity reached. Try again later.",
        429,
      );
    const client = {
      id: crypto.randomUUID(),
      name: parsed.data.client_name,
      redirectUris: [...new Set(parsed.data.redirect_uris)],
      createdAt: new Date().toISOString(),
    };
    config.mcpOAuth.clients.push(client);
    config.configRevision += 1;
    await writeSelflifyConfig(config);
    return {
      client_id: client.id,
      client_name: client.name,
      redirect_uris: client.redirectUris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    };
  });
}

const requestSchema = z.object({
  client_id: z.string().uuid(),
  redirect_uri: z.string().max(2048),
  response_type: z.literal("code"),
  code_challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  code_challenge_method: z.literal("S256"),
  resource: z.string().max(2048),
  scope: z.string().max(200).optional(),
  state: z.string().max(1024).optional(),
});
export type ConsentRequest = z.infer<typeof requestSchema>;

export function readConsentRequest(config: SelflifyConfig, input: unknown) {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success)
    fail(
      "invalid_request",
      "The authorization request is incomplete or expired. Reconnect from your MCP client.",
    );
  const request = parsed.data;
  const client = config.mcpOAuth.clients.find((entry) => entry.id === request.client_id);
  if (!client || !client.redirectUris.includes(request.redirect_uri))
    fail(
      "invalid_request",
      "The client or return address is not registered. Reconnect from your MCP client.",
    );
  if (request.resource !== mcpResource(config))
    fail("invalid_target", "The request targets a different MCP server.");
  return { request, client, scopes: parseScopes(request.scope) };
}

export async function approveMcpAccess(
  request: ConsentRequest,
  selection: { allSites: boolean; siteIds: string[]; scopes: string[] },
) {
  return runSerializedTask(async () => {
    const config = await readSelflifyConfig();
    const validated = readConsentRequest(config, request);
    const scopes = [...new Set(selection.scopes)];
    if (
      !scopes.includes("mcp:read") ||
      scopes.some((scope) => !validated.scopes.includes(scope as McpScope))
    )
      fail("invalid_scope", "Select read access and only permissions requested by this client.");
    const siteIds = selection.allSites ? [] : [...new Set(selection.siteIds)];
    if (
      !selection.allSites &&
      (!siteIds.length ||
        siteIds.some((id) => !config.sites.some((site) => getDeploymentSiteId(site) === id)))
    )
      fail("invalid_request", "Select at least one existing site.");
    const now = Date.now();
    config.mcpOAuth.codes = config.mcpOAuth.codes.filter(
      (code) => Date.parse(code.expiresAt) > now,
    );
    if (config.mcpOAuth.codes.length >= 200)
      fail("temporarily_unavailable", "Too many pending connections. Try again later.");
    const code = crypto.randomBytes(32).toString("base64url");
    config.mcpOAuth.codes.push({
      hash: hashDeploySecret(code),
      clientId: request.client_id,
      redirectUri: request.redirect_uri,
      challenge: request.code_challenge,
      resource: request.resource,
      scopes: scopes as McpScope[],
      siteIds,
      allSites: selection.allSites,
      expiresAt: new Date(now + 5 * 60_000).toISOString(),
    });
    config.configRevision += 1;
    await writeSelflifyConfig(config);
    const target = new URL(request.redirect_uri);
    target.searchParams.set("code", code);
    if (request.state !== undefined) target.searchParams.set("state", request.state);
    return target.href;
  });
}

export function denyMcpAccess(config: SelflifyConfig, request: ConsentRequest) {
  readConsentRequest(config, request);
  const target = new URL(request.redirect_uri);
  target.searchParams.set("error", "access_denied");
  if (request.state !== undefined) target.searchParams.set("state", request.state);
  return target.href;
}

function issueCredentials(token: DeployToken) {
  const access = crypto.randomBytes(32).toString("base64url");
  const refresh = crypto.randomBytes(32).toString("base64url");
  token.secretHash = hashDeploySecret(access);
  token.expiresAt = new Date(Date.now() + ACCESS_SECONDS * 1000).toISOString();
  token.oauth!.refreshHash = hashDeploySecret(refresh);
  return {
    access_token: `slf_${token.id}.${access}`,
    refresh_token: `slr_${token.id}.${refresh}`,
    token_type: "Bearer",
    expires_in: ACCESS_SECONDS,
    scope: token.scopes.join(" "),
  };
}

export async function exchangeMcpToken(fields: Record<string, string>) {
  return runSerializedTask(async () => {
    const config = await readSelflifyConfig();
    if (!isAdminConfigured(config)) fail("invalid_grant", "Selflify is not initialized.");
    const resource = mcpResource(config);
    if (fields.resource !== resource)
      fail("invalid_target", "Supply this MCP server as the resource.");
    if (!config.mcpOAuth.clients.some((client) => client.id === fields.client_id))
      fail("invalid_client", "Unknown MCP client.");
    let token: DeployToken;
    if (fields.grant_type === "authorization_code") {
      const code = config.mcpOAuth.codes.find(
        (entry) => entry.hash === hashDeploySecret(fields.code ?? ""),
      );
      if (
        !code ||
        Date.parse(code.expiresAt) <= Date.now() ||
        code.clientId !== fields.client_id ||
        code.redirectUri !== fields.redirect_uri ||
        code.resource !== resource
      )
        fail("invalid_grant", "Authorization code is invalid or expired.");
      if (
        !/^[A-Za-z0-9._~-]{43,128}$/.test(fields.code_verifier ?? "") ||
        crypto.createHash("sha256").update(fields.code_verifier).digest("base64url") !==
          code.challenge
      )
        fail("invalid_grant", "PKCE verification failed.");
      if (
        !code.allSites &&
        !code.siteIds.some((id) => config.sites.some((site) => getDeploymentSiteId(site) === id))
      )
        fail("invalid_grant", "The selected sites no longer exist.");
      if (
        config.deployTokens.length >= 1000 ||
        config.deployTokens.filter(
          (entry) =>
            !entry.revokedAt &&
            Date.parse(entry.oauth?.refreshExpiresAt ?? entry.expiresAt) > Date.now(),
        ).length >= 200
      )
        fail(
          "temporarily_unavailable",
          "Revoke unused connections before connecting another client.",
        );
      const client = config.mcpOAuth.clients.find((entry) => entry.id === code.clientId)!;
      token = {
        id: crypto.randomUUID(),
        siteId: code.siteIds[0] ?? "*",
        siteIds: code.siteIds.length ? code.siteIds : undefined,
        allSites: code.allSites,
        name: client.name,
        secretHash: "0".repeat(64),
        scopes: code.scopes,
        createdAt: new Date().toISOString(),
        expiresAt: new Date().toISOString(),
        revokedAt: null,
        oauth: {
          clientId: code.clientId,
          resource,
          refreshHash: "0".repeat(64),
          refreshExpiresAt: new Date(Date.now() + GRANT_MS).toISOString(),
        },
      };
      config.deployTokens.push(token);
      config.mcpOAuth.codes = config.mcpOAuth.codes.filter(
        (entry) => entry !== code && Date.parse(entry.expiresAt) > Date.now(),
      );
    } else if (fields.grant_type === "refresh_token") {
      const match = /^slr_([a-f0-9-]{36})\.([A-Za-z0-9_-]{43})$/.exec(fields.refresh_token ?? "");
      const existing = config.deployTokens.find((entry) => entry.id === match?.[1]);
      if (
        match &&
        existing?.oauth &&
        existing.oauth.clientId === fields.client_id &&
        existing.oauth.usedRefreshHashes?.some((hash) => sameHash(match[2], hash))
      ) {
        existing.revokedAt = new Date().toISOString();
        config.configRevision += 1;
        await writeSelflifyConfig(config);
        fail("invalid_grant", "A refresh token was reused. Reconnect your client.");
      }
      if (
        !match ||
        !existing?.oauth ||
        existing.revokedAt ||
        existing.oauth.clientId !== fields.client_id ||
        existing.oauth.resource !== resource ||
        Date.parse(existing.oauth.refreshExpiresAt) <= Date.now() ||
        !sameHash(match[2], existing.oauth.refreshHash)
      )
        fail("invalid_grant", "Refresh token is invalid, expired or revoked.");
      if (fields.scope && fields.scope !== existing.scopes.join(" "))
        fail("invalid_scope", "Reconnect to change permissions.");
      token = existing;
      const used = token.oauth!.usedRefreshHashes ?? [];
      if (used.length >= 1024)
        fail("invalid_grant", "Refresh limit reached. Reconnect your client.");
      token.oauth!.usedRefreshHashes = [...used, token.oauth!.refreshHash];
    } else {
      fail("unsupported_grant_type", "Use authorization_code or refresh_token.");
    }
    const result = issueCredentials(token);
    config.configRevision += 1;
    await writeSelflifyConfig(config);
    return result;
  });
}

export async function createManualMcpAccess(input: {
  name: string;
  allSites: boolean;
  siteIds: string[];
  scopes: string[];
  days: number;
}) {
  return runSerializedTask(async () => {
    const config = await readSelflifyConfig();
    const name = input.name.trim();
    if (!name || name.length > 80) fail("invalid_request", "Enter a connection name.");
    const scopes = [...new Set(input.scopes)];
    if (
      !scopes.includes("mcp:read") ||
      scopes.some((scope) => !(MCP_SCOPES as readonly string[]).includes(scope))
    )
      fail("invalid_scope", "Select supported MCP permissions.");
    const siteIds = [...new Set(input.siteIds)];
    if (
      !input.allSites &&
      (!siteIds.length ||
        siteIds.some((id) => !config.sites.some((site) => getDeploymentSiteId(site) === id)))
    )
      fail("invalid_request", "Select at least one existing site.");
    if (![7, 30, 90].includes(input.days)) fail("invalid_request", "Choose a valid expiry period.");
    if (
      config.deployTokens.length >= 1000 ||
      config.deployTokens.filter(
        (entry) =>
          !entry.revokedAt &&
          Date.parse(entry.oauth?.refreshExpiresAt ?? entry.expiresAt) > Date.now(),
      ).length >= 200
    )
      fail("temporarily_unavailable", "Revoke unused connections before creating another.");
    const id = crypto.randomUUID();
    const secret = crypto.randomBytes(32).toString("base64url");
    config.deployTokens.push({
      id,
      name,
      siteId: input.allSites ? "*" : siteIds[0],
      siteIds: input.allSites ? undefined : siteIds,
      allSites: input.allSites,
      scopes: scopes as McpScope[],
      secretHash: hashDeploySecret(secret),
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + input.days * 86400_000).toISOString(),
      revokedAt: null,
    });
    config.configRevision += 1;
    await writeSelflifyConfig(config);
    return `slf_${id}.${secret}`;
  });
}

export function listMcpConnections(config: SelflifyConfig) {
  return config.deployTokens
    .filter(
      (token) =>
        token.scopes.includes("mcp:read") &&
        !token.revokedAt &&
        Date.parse(token.oauth?.refreshExpiresAt ?? token.expiresAt) > Date.now(),
    )
    .map((token) => ({
      id: token.id,
      name: token.name,
      allSites: token.allSites === true,
      sites: config.sites
        .filter((site) => (token.siteIds ?? [token.siteId]).includes(getDeploymentSiteId(site)))
        .map((site) => site.name),
      scopes: token.scopes,
      expiresAt: token.oauth?.refreshExpiresAt ?? token.expiresAt,
    }));
}

export async function revokeMcpAccess(tokenId: string) {
  await runSerializedTask(async () => {
    const config = await readSelflifyConfig();
    const token = config.deployTokens.find(
      (entry) => entry.id === tokenId && entry.scopes.includes("mcp:read"),
    );
    if (!token) fail("invalid_request", "Connection not found.");
    token.revokedAt = new Date().toISOString();
    config.configRevision += 1;
    await writeSelflifyConfig(config);
  });
}

export async function revokeMcpCredential(fields: Record<string, string>) {
  await runSerializedTask(async () => {
    const match = /^(slf|slr)_([a-f0-9-]{36})\.([A-Za-z0-9_-]{43})$/.exec(fields.token ?? "");
    if (!match) return;
    const config = await readSelflifyConfig();
    const token = config.deployTokens.find((entry) => entry.id === match[2]);
    if (
      !token?.oauth ||
      token.oauth.clientId !== fields.client_id ||
      !sameHash(match[3], match[1] === "slr" ? token.oauth.refreshHash : token.secretHash)
    )
      return;
    token.revokedAt = new Date().toISOString();
    config.configRevision += 1;
    await writeSelflifyConfig(config);
  });
}
