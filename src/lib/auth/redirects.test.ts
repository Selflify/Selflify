import { describe, expect, it } from "vitest";

import { resolveAuthClientRedirect } from "@/lib/auth/redirects";

describe("resolveAuthClientRedirect", () => {
  const origin = "https://example.dev";

  it("returns the fallback when auth.js does not return a url", () => {
    expect(resolveAuthClientRedirect(undefined, "/sites", origin)).toBe("/sites");
  });

  it("keeps relative redirects relative", () => {
    expect(resolveAuthClientRedirect("/sites?view=deploys", "/sites", origin)).toBe("/sites?view=deploys");
  });

  it("normalizes same-origin absolute redirects to relative paths", () => {
    expect(resolveAuthClientRedirect("https://example.dev/sites", "/sites", origin)).toBe("/sites");
  });

  it("normalizes internal runtime hosts to relative paths", () => {
    expect(resolveAuthClientRedirect("https://0.0.0.0:3000/sites", "/sites", origin)).toBe("/sites");
  });

  it("rejects unexpected external redirects", () => {
    expect(resolveAuthClientRedirect("https://evil.example/login", "/login", origin)).toBe("/login");
  });
});
