import { describe, expect, it } from "vitest";

import { resolveAuthClientRedirect, safeLoginReturnTo } from "@/lib/auth/redirects";

describe("resolveAuthClientRedirect", () => {
  const origin = "https://example.dev";

  it("returns the fallback when auth.js does not return a url", () => {
    expect(resolveAuthClientRedirect(undefined, "/sites", origin)).toBe("/sites");
  });

  it("keeps relative redirects relative", () => {
    expect(resolveAuthClientRedirect("/sites?view=deploys", "/sites", origin)).toBe(
      "/sites?view=deploys",
    );
  });

  it("normalizes same-origin absolute redirects to relative paths", () => {
    expect(resolveAuthClientRedirect("https://example.dev/sites", "/sites", origin)).toBe("/sites");
  });

  it("normalizes internal runtime hosts to relative paths", () => {
    expect(resolveAuthClientRedirect("https://0.0.0.0:3000/sites", "/sites", origin)).toBe(
      "/sites",
    );
  });

  it("rejects unexpected external redirects", () => {
    expect(resolveAuthClientRedirect("https://evil.example/login", "/login", origin)).toBe(
      "/login",
    );
  });

  it("preserves only internal MCP consent return paths", () => {
    const target = "/mcp/authorize?client_id=test&state=original";
    expect(safeLoginReturnTo(target)).toBe(target);
    for (const value of [
      "https://evil.test/mcp/authorize",
      "//evil.test/mcp/authorize",
      "/mcp/authorize/../../evil",
      "/mcp/authorize-other",
      "/sites",
      undefined,
    ]) {
      expect(safeLoginReturnTo(value)).toBe("/sites");
    }
  });
});
