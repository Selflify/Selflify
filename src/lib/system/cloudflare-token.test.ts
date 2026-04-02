import { describe, expect, it } from "vitest";

import {
  CLOUDFLARE_API_TOKEN_MESSAGE,
  looksLikeCloudflareApiToken,
  normalizeCloudflareTokenErrorMessage,
} from "@/lib/system/cloudflare-token";

describe("looksLikeCloudflareApiToken", () => {
  it("accepts raw tokens in the expected format", () => {
    expect(looksLikeCloudflareApiToken("cfut_12345678901234567890123456789012")).toBe(true);
    expect(looksLikeCloudflareApiToken("cfat_abcdefghijklmnopqrstuvwxyzABCDEF1234567890")).toBe(
      true,
    );
  });

  it("rejects short values and wrapped tokens", () => {
    expect(looksLikeCloudflareApiToken("123123")).toBe(false);
    expect(looksLikeCloudflareApiToken('"cfut_12345678901234567890123456789012"')).toBe(false);
    expect(looksLikeCloudflareApiToken("{cfut_12345678901234567890123456789012}")).toBe(false);
  });
});

describe("normalizeCloudflareTokenErrorMessage", () => {
  it("converts raw caddy token validation output into a friendly message", () => {
    const rawMessage =
      "Command failed: /usr/bin/caddy validate --config /workspace/runtime/Caddyfile --adapter caddyfile. Error: loading DNS provider module: loading module 'cloudflare': provision dns.providers.cloudflare: API token '123123' appears invalid; ensure it's correctly entered and not wrapped in braces nor quotes";

    expect(normalizeCloudflareTokenErrorMessage(rawMessage)).toBe(CLOUDFLARE_API_TOKEN_MESSAGE);
  });

  it("preserves unrelated messages", () => {
    expect(normalizeCloudflareTokenErrorMessage("Setup failed.")).toBe("Setup failed.");
  });
});
