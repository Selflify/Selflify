import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { readSelflifyConfig } from "@/lib/config/service";
import { authorizeMcp, McpAccessError } from "@/lib/mcp/auth";
import { createSelflifyMcpServer } from "@/lib/mcp/server";
import { isDevelopmentRuntime } from "@/lib/system/runtime";
import { mcpOrigin } from "@/lib/mcp/oauth-urls";

const MAX_BODY_BYTES = 64 * 1024;

async function readJson(request: Request): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) {
    throw new McpAccessError(413, "MCP request is too large.");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new McpAccessError(400, "Missing MCP request body.");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    void reader.cancel().catch(() => {});
  }, 10_000);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (timedOut) throw new McpAccessError(408, "MCP request timed out.");
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) throw new McpAccessError(413, "MCP request is too large.");
      chunks.push(value);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
    } catch {
      throw new McpAccessError(400, "Invalid JSON.");
    }
  } finally {
    clearTimeout(timer);
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function validateOrigin(request: Request, domain: string) {
  const development = isDevelopmentRuntime();
  const allowedHost = (hostname: string) =>
    hostname === domain || (development && ["127.0.0.1", "localhost", "[::1]"].includes(hostname));
  try {
    const host = new URL(`http://${request.headers.get("host") ?? new URL(request.url).host}`);
    if (!allowedHost(host.hostname)) throw new Error("Host");
    const origin = request.headers.get("origin");
    if (origin) {
      const parsed = new URL(origin);
      const valid = development
        ? allowedHost(parsed.hostname) &&
          ["http:", "https:"].includes(parsed.protocol) &&
          parsed.origin === origin
        : origin === `https://${domain}`;
      if (!valid) throw new Error("Origin");
    }
  } catch {
    throw new McpAccessError(403, "MCP host or origin is not allowed.");
  }
}

export function createMcpHandler() {
  const budgets = new Map<string, { until: number; count: number }>();
  let active = 0;
  function limit(key: string, maximum: number) {
    const now = Date.now();
    for (const [id, value] of budgets) if (value.until <= now) budgets.delete(id);
    const budget = budgets.get(key) ?? { until: now + 60_000, count: 0 };
    budgets.set(key, budget);
    if (++budget.count > maximum)
      throw new McpAccessError(429, "MCP rate limit exceeded. Retry in one minute.");
  }

  return async function handleMcpRequest(request: Request): Promise<Response> {
    const headers = new Headers({ "Cache-Control": "no-store", Vary: "Authorization" });
    try {
      limit("all", 600);
      const config = await readSelflifyConfig();
      validateOrigin(request, config.server.domain);
      const authorization = request.headers.get("authorization");
      headers.set(
        "WWW-Authenticate",
        `Bearer realm="selflify-mcp", resource_metadata="${mcpOrigin(config)}/.well-known/oauth-protected-resource/mcp"`,
      );
      const { token } = authorizeMcp(config, authorization);
      headers.delete("WWW-Authenticate");
      limit(token.id, 60);
      if (request.method !== "POST") {
        headers.set("Allow", "POST");
        throw new McpAccessError(405, "This stateless MCP endpoint supports POST only.");
      }
      if (
        !(request.headers.get("content-type") ?? "")
          .split(";")[0]
          .trim()
          .match(/^application\/json$/i)
      ) {
        throw new McpAccessError(415, "Use application/json.");
      }
      if (active >= 8) throw new McpAccessError(429, "Too many active MCP requests.");
      active += 1;
      try {
        const parsedBody = await readJson(request);
        // Every request owns a server and transport; no session credentials are retained.
        const server = createSelflifyMcpServer(authorization!);
        const transport = new WebStandardStreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: true,
        });
        try {
          await server.connect(transport);
          const response = await transport.handleRequest(request, { parsedBody });
          for (const [key, value] of headers) response.headers.set(key, value);
          return response;
        } finally {
          await server.close();
        }
      } finally {
        active -= 1;
      }
    } catch (error) {
      const known = error instanceof McpAccessError;
      const status = known ? error.status : 500;
      if (status !== 401) headers.delete("WWW-Authenticate");
      if (status === 429) headers.set("Retry-After", "60");
      return Response.json(
        { error: known ? error.message : "MCP request failed." },
        { status, headers },
      );
    }
  };
}
