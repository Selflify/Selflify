import { describe, expect, it } from "vitest";

import {
  buildRuntimeSeedConfig,
  DEFAULT_RUNTIME_CADDY_EMAIL,
  DEFAULT_RUNTIME_DOMAIN,
  renderRuntimeSeedConfig,
} from "@/lib/bootstrap/runtime-seed";

describe("runtime seed config", () => {
  it("renders a concrete config from the bootstrap template", () => {
    const config = buildRuntimeSeedConfig({
      domain: "preview.example.com",
      serverIp: "203.0.113.10",
      caddyContactEmail: "ops@example.com",
      sessionSecret: "test-secret-1234567890",
      caddyConfigPath: "./runtime/Caddyfile",
    });

    expect(config.server.domain).toBe("preview.example.com");
    expect(config.server.serverIp).toBe("203.0.113.10");
    expect(config.server.caddyContactEmail).toBe("ops@example.com");
    expect(config.sessionSecret).toBe("test-secret-1234567890");
    expect(config.server.caddyConfigPath).toBe("./runtime/Caddyfile");
  });

  it("fills stable defaults when overrides are omitted", () => {
    const config = buildRuntimeSeedConfig();

    expect(config.server.domain).toBe(DEFAULT_RUNTIME_DOMAIN);
    expect(config.server.caddyContactEmail).toBe(DEFAULT_RUNTIME_CADDY_EMAIL);
    expect(config.sites).toEqual([]);
  });

  it("renders valid json output", () => {
    const output = renderRuntimeSeedConfig({
      sessionSecret: "test-secret-1234567890",
    });

    expect(() => JSON.parse(output)).not.toThrow();
  });
});
