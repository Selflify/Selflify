import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { type SelflifyConfig, type SiteConfig } from "@/lib/config/schema";
import { createDefaultConfig } from "@/lib/config/service";
import {
  createCaddyGateway,
  generateCaddyfile,
  resolveCaddyCommand,
  resolveCaddyCommandAdminAddress,
  resolveCaddyCommandConfigPath,
} from "@/lib/system/caddy";

function createSite(partial?: Partial<SiteConfig>): SiteConfig {
  return {
    slug: "app",
    name: "App",
    mainBranch: "stable",
    previewAuth: {
      enabled: true,
      login: "preview-user",
      passwordHash: "hashed-secret",
    },
    createdAt: "2026-03-26T18:00:00.000Z",
    updatedAt: "2026-03-26T18:00:00.000Z",
    ...partial,
  };
}

function createConfig(site: SiteConfig, partial?: Partial<SelflifyConfig>): SelflifyConfig {
  const base = createDefaultConfig();

  return {
    ...base,
    ...partial,
    server: {
      ...base.server,
      domain: "example.dev",
      previewRootDir: "/var/www",
      selflifyUpstream: "selflify:3000",
      caddyContactEmail: "dev@example.dev",
      cloudflareApiToken: "cf-token",
      ...(partial?.server ?? {}),
    },
    sites: [site],
  };
}

describe("generateCaddyfile", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("renders apex proxy, preview auth and stable root mapping", () => {
    const config = createConfig(createSite());
    const rendered = generateCaddyfile(config);

    expect(rendered).toContain("reverse_proxy selflify:3000");
    expect(rendered).toContain("dns cloudflare cf-token");
    expect(rendered).toContain("root * /var/www/app/{labels.3}");
    expect(rendered).toContain("root * /var/www/app/stable");
    expect(rendered).toContain("preview-user hashed-secret");
    expect(rendered).toContain("output file /var/log/caddy/access.log");
    expect(rendered).toContain("roll_keep 10");
    expect(rendered).toContain("origins http://0.0.0.0:2019 http://127.0.0.1:2019 http://localhost:2019 http://caddy:2019");
  });

  it("keeps the panel reachable over the configured server ip", () => {
    const config = createConfig(createSite(), {
      server: {
        ...createDefaultConfig().server,
        domain: "example.dev",
        serverIp: "203.0.113.10",
        previewRootDir: "/var/www",
        selflifyUpstream: "selflify:3000",
        caddyContactEmail: "dev@example.dev",
        cloudflareApiToken: "cf-token",
      },
    });
    const rendered = generateCaddyfile(config);

    expect(rendered).toContain("http://203.0.113.10");
    expect(rendered).toContain("reverse_proxy selflify:3000");
  });

  it("omits preview basic auth and tls_cf import when no token or auth is configured", () => {
    const config = createConfig(
      createSite({
        previewAuth: {
          enabled: false,
          login: null,
          passwordHash: null,
        },
      }),
      {
        server: {
          ...createDefaultConfig().server,
          domain: "example.dev",
          previewRootDir: "/var/www",
          selflifyUpstream: "selflify:3000",
          caddyContactEmail: "dev@example.dev",
          cloudflareApiToken: "",
        },
      },
    );
    const rendered = generateCaddyfile(config);

    expect(rendered).not.toContain("dns cloudflare");
    expect(rendered).not.toContain("basic_auth {");
    expect(rendered).toContain("import common_headers");
    expect(rendered).toContain("import static_cache");
  });

  it("omits managed tls imports when cloudflare is mocked even if a token is present", () => {
    vi.stubEnv("SELFLIFY_MOCK_CLOUDFLARE", "1");

    const config = createConfig(createSite());
    const rendered = generateCaddyfile(config);

    expect(rendered).not.toContain("dns cloudflare");
    expect(rendered).not.toContain("import tls_cf");
    expect(rendered).toContain("import common_headers");
    expect(rendered).toContain("import static_cache");
  });

  it("uses host.docker.internal for the default dev upstream when Next.js runs on the host", () => {
    vi.stubEnv("NODE_ENV", "development");

    const config = createConfig(createSite());
    const rendered = generateCaddyfile(config);

    expect(rendered).toContain("auto_https off");
    expect(rendered).toContain("http://example.dev");
    expect(rendered).toContain("http://app.example.dev, http://*.app.example.dev");
    expect(rendered).toContain("reverse_proxy host.docker.internal:3000");
  });

  it("uses docker exec for caddy commands in development when no explicit local binary is configured", () => {
    vi.stubEnv("NODE_ENV", "development");

    const config = createConfig(createSite());
    const command = resolveCaddyCommand(config, ["hash-password", "--plaintext", "secret"]);

    expect(command.command).toBe("docker");
    expect(command.args).toEqual([
      "exec",
      "selflify-dev-caddy",
      "caddy",
      "hash-password",
      "--plaintext",
      "secret",
    ]);
    expect(resolveCaddyCommandConfigPath(config)).toBe("/etc/caddy/Caddyfile");
    expect(resolveCaddyCommandAdminAddress(config)).toBe("0.0.0.0:2019");
  });

  it("uses the configured local caddy binary when it is explicitly overridden", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("SELFLIFY_CADDY_BIN", "/usr/local/bin/caddy");

    const config = createConfig(createSite());
    const command = resolveCaddyCommand(config, ["validate"]);

    expect(command.command).toBe("/usr/local/bin/caddy");
    expect(command.args).toEqual(["validate"]);
    expect(resolveCaddyCommandConfigPath(config)).toBe(config.server.caddyConfigPath);
    expect(resolveCaddyCommandAdminAddress(config)).toBe("caddy:2019");
  });

  it("uses the modern basic_auth directive for preview protection", () => {
    const config = createConfig(createSite());
    const rendered = generateCaddyfile(config);

    expect(rendered).toContain("basic_auth {");
    expect(rendered).not.toContain("basicauth {");
  });

  it("reloads through the admin API when running with a local caddy binary", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "selflify-caddy-test-"));
    const config = createConfig(createSite(), {
      server: {
        ...createDefaultConfig().server,
        domain: "example.dev",
        previewRootDir: "/var/www",
        selflifyUpstream: "selflify:3000",
        caddyContactEmail: "dev@example.dev",
        cloudflareApiToken: "cf-token",
        caddyConfigPath: path.join(tempDir, "Caddyfile"),
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("", {
        status: 200,
      }),
    );
    const commandRunner = vi.fn();
    const gateway = createCaddyGateway(commandRunner, fetchMock as typeof fetch);

    await gateway.writeGeneratedConfig(config);
    await gateway.reload(config);

    expect(commandRunner).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith("http://caddy:2019/load", {
      method: "POST",
      headers: {
        "Content-Type": "text/caddyfile",
        Origin: "http://0.0.0.0:2019",
      },
      body: expect.stringContaining("reverse_proxy selflify:3000"),
    });

    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("writes the generated Caddyfile with 0600 permissions", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "selflify-caddy-perms-"));
    const target = path.join(tempDir, "Caddyfile");
    const gateway = createCaddyGateway();
    const config = createConfig(createSite(), {
      server: {
        ...createDefaultConfig().server,
        domain: "example.dev",
        previewRootDir: "/var/www",
        selflifyUpstream: "selflify:3000",
        caddyContactEmail: "dev@example.dev",
        cloudflareApiToken: "cf-token",
        caddyConfigPath: target,
      },
    });

    await gateway.writeGeneratedConfig(config);

    const stats = await fs.stat(target);
    expect(stats.mode & 0o777).toBe(0o600);

    await fs.rm(tempDir, { recursive: true, force: true });
  });
});
