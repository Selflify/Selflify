import { afterEach, describe, expect, it } from "vitest";

import {
  getRuntimeModeLabel,
  isDevelopmentRuntime,
  shouldMockCloudflare,
  shouldSkipCaddyReload,
} from "@/lib/system/runtime";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

function setEnv(nextEnv: Record<string, string | undefined>) {
  process.env = {
    ...process.env,
    ...nextEnv,
  };
}

describe("runtime flags", () => {
  it("treats development node env as development runtime by default", () => {
    setEnv({
      NODE_ENV: "development",
      SELFLIFY_DEV_MODE: undefined,
    });

    expect(isDevelopmentRuntime()).toBe(true);
    expect(getRuntimeModeLabel()).toBe("development");
  });

  it("allows explicit override for production runtime", () => {
    setEnv({
      NODE_ENV: "development",
      SELFLIFY_DEV_MODE: "0",
    });

    expect(isDevelopmentRuntime()).toBe(false);
    expect(getRuntimeModeLabel()).toBe("production");
  });

  it("mocks cloudflare and skips caddy reload in development by default", () => {
    setEnv({
      NODE_ENV: "development",
      SELFLIFY_MOCK_CLOUDFLARE: undefined,
      SELFLIFY_SKIP_CADDY_RELOAD: undefined,
    });

    expect(shouldMockCloudflare()).toBe(true);
    expect(shouldSkipCaddyReload()).toBe(true);
  });

  it("honors explicit runtime toggles", () => {
    setEnv({
      NODE_ENV: "production",
      SELFLIFY_MOCK_CLOUDFLARE: "0",
      SELFLIFY_SKIP_CADDY_RELOAD: "1",
    });

    expect(shouldMockCloudflare()).toBe(false);
    expect(shouldSkipCaddyReload()).toBe(true);
  });
});
