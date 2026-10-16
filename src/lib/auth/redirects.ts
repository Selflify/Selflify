const INTERNAL_HOSTNAMES = new Set(["0.0.0.0", "127.0.0.1", "localhost", "selflify"]);

export function safeLoginReturnTo(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/mcp/authorize") || value.length > 8192)
    return "/sites";
  try {
    const url = new URL(value, "https://selflify.invalid");
    return url.origin === "https://selflify.invalid" && url.pathname === "/mcp/authorize"
      ? `${url.pathname}${url.search}`
      : "/sites";
  } catch {
    return "/sites";
  }
}

function toRelativeUrl(url: URL): string {
  return `${url.pathname}${url.search}${url.hash}`;
}

export function resolveAuthClientRedirect(
  resultUrl: string | null | undefined,
  fallbackPath: string,
  currentOrigin: string,
): string {
  if (!resultUrl) {
    return fallbackPath;
  }

  try {
    const resolved = new URL(resultUrl, currentOrigin);

    if (resultUrl.startsWith("/")) {
      return toRelativeUrl(resolved);
    }

    if (resolved.origin === currentOrigin || INTERNAL_HOSTNAMES.has(resolved.hostname)) {
      return toRelativeUrl(resolved);
    }
  } catch {
    return fallbackPath;
  }

  return fallbackPath;
}
