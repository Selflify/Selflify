import type { SelflifyConfig } from "@/lib/config/schema";
import { isDevelopmentRuntime } from "@/lib/system/runtime";

export const MCP_SCOPES = ["mcp:read", "mcp:write", "preview:write", "stable:write"] as const;
export type McpScope = (typeof MCP_SCOPES)[number];

export function mcpOrigin(config: SelflifyConfig): string {
  const value = process.env.SELFLIFY_MCP_PUBLIC_ORIGIN ?? `https://${config.server.domain}`;
  const url = new URL(value);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    url.origin !== value ||
    url.username ||
    url.password ||
    (url.protocol !== "https:" && !(isDevelopmentRuntime() && local && url.protocol === "http:"))
  ) {
    throw new Error("Invalid MCP public origin.");
  }
  return url.origin;
}

export function mcpResource(config: SelflifyConfig) {
  return `${mcpOrigin(config)}/mcp`;
}

export function mcpProtectedMetadata(config: SelflifyConfig) {
  return {
    resource: mcpResource(config),
    authorization_servers: [mcpOrigin(config)],
    scopes_supported: [...MCP_SCOPES],
    bearer_methods_supported: ["header"],
    resource_name: "Selflify",
  };
}

export function mcpAuthorizationMetadata(config: SelflifyConfig) {
  const origin = mcpOrigin(config);
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/mcp/authorize`,
    token_endpoint: `${origin}/mcp/oauth/token`,
    registration_endpoint: `${origin}/mcp/oauth/register`,
    revocation_endpoint: `${origin}/mcp/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: [...MCP_SCOPES],
  };
}
