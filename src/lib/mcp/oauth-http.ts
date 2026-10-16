import {
  OAuthError,
  exchangeMcpToken,
  registerMcpClient,
  revokeMcpCredential,
} from "@/lib/mcp/oauth";

export const oauthHeaders = {
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version",
};

export function createOAuthHandler() {
  let start = 0;
  const counts = new Map<string, number>();
  let active = 0;
  return async function handle(request: Request, endpoint: string) {
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers: oauthHeaders });
    try {
      if (!["register", "token", "revoke"].includes(endpoint))
        throw new OAuthError("invalid_request", "Endpoint not found.", 404);
      if (Date.now() - start > 60_000) {
        start = Date.now();
        counts.clear();
      }
      const count = (counts.get(endpoint) ?? 0) + 1;
      counts.set(endpoint, count);
      if (count > (endpoint === "register" ? 20 : 120) || active >= 8)
        throw new OAuthError(
          "temporarily_unavailable",
          "Too many requests. Retry in one minute.",
          429,
        );
      active += 1;
      try {
        const reader = request.body?.getReader();
        if (!reader) throw new OAuthError("invalid_request", "Request body is required.");
        let bytes = 0;
        let timeout = false;
        const chunks: Uint8Array[] = [];
        const timer = setTimeout(() => {
          timeout = true;
          void reader.cancel().catch(() => {});
        }, 10_000);
        try {
          while (true) {
            const part = await reader.read();
            if (timeout) throw new OAuthError("invalid_request", "Request timed out.", 408);
            if (part.done) break;
            bytes += part.value.byteLength;
            if (bytes > 16 * 1024)
              throw new OAuthError("invalid_request", "Request is too large.", 413);
            chunks.push(part.value);
          }
        } finally {
          clearTimeout(timer);
          void reader.cancel().catch(() => {});
          reader.releaseLock();
        }
        const raw = Buffer.concat(chunks).toString("utf8");
        const contentType = (request.headers.get("content-type") ?? "").split(";")[0].trim();
        let result: unknown;
        if (endpoint === "register") {
          if (contentType !== "application/json")
            throw new OAuthError("invalid_request", "Use application/json.", 415);
          let input: unknown;
          try {
            input = JSON.parse(raw);
          } catch {
            throw new OAuthError("invalid_request", "Invalid JSON.");
          }
          result = await registerMcpClient(input);
        } else {
          if (contentType !== "application/x-www-form-urlencoded")
            throw new OAuthError("invalid_request", "Use application/x-www-form-urlencoded.", 415);
          const params = new URLSearchParams(raw);
          for (const key of params.keys())
            if (params.getAll(key).length !== 1)
              throw new OAuthError("invalid_request", "Duplicate request fields are not allowed.");
          const fields = Object.fromEntries(params);
          if (endpoint === "token") result = await exchangeMcpToken(fields);
          else {
            await revokeMcpCredential(fields);
            result = {};
          }
        }
        return Response.json(result, {
          status: endpoint === "register" ? 201 : 200,
          headers: oauthHeaders,
        });
      } finally {
        active -= 1;
      }
    } catch (error) {
      const known = error instanceof OAuthError;
      return Response.json(
        {
          error: known ? error.code : "server_error",
          error_description: known
            ? error.message
            : "Authorization could not be completed. Try again.",
        },
        {
          status: known ? error.status : 500,
          headers: {
            ...oauthHeaders,
            ...(known && error.status === 429 ? { "Retry-After": "60" } : {}),
          },
        },
      );
    }
  };
}
