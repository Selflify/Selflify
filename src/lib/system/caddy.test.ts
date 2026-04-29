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
    stableAlias: null,
    stableAliasAutoTls: false,
    stableAliasUseCloudflare: true,
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
    const commonHeadersBlock = rendered.match(/\(common_headers\) \{[\s\S]*?\n\}/)?.[0] ?? "";

    expect(rendered).toContain("reverse_proxy selflify:3000");
    expect(rendered).toContain("dns cloudflare cf-token");
    expect(rendered).toContain("root * /var/www/app/{labels.3}");
    expect(rendered).toContain("root * /var/www/app/stable");
    expect(rendered).toContain("preview-user hashed-secret");
    expect(rendered).toContain("output file /var/log/caddy/access.log");
    expect(rendered).toContain("roll_keep 10");
    expect(rendered).toContain("origins http://0.0.0.0:2019 http://127.0.0.1:2019 http://localhost:2019 http://caddy:2019");
    expect(rendered).toContain("(panel_security_headers) {");
    expect(rendered).toContain('X-Frame-Options "DENY"');
    expect(rendered).toContain('Content-Security-Policy "frame-ancestors \'none\'"');
    expect(commonHeadersBlock).not.toContain('X-Frame-Options "DENY"');
    expect(commonHeadersBlock).not.toContain('Content-Security-Policy "frame-ancestors \'none\'"');
    expect(rendered).toContain(`example.dev {
    import common_site
    import panel_security_headers`);
    expect(rendered).toContain("app.example.dev {");
    expect(rendered).toContain("*.app.example.dev {");
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

  it("redirects plain-http server ip traffic to the primary domain after setup in production", () => {
    const configured = createConfig(createSite(), {
      admin: {
        login: "owner",
        passwordHash: "hash",
        configuredAt: "2026-04-07T12:00:00.000Z",
      },
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
    const rendered = generateCaddyfile(configured);

    expect(rendered).toContain("http://203.0.113.10");
    expect(rendered).toContain("redir https://example.dev{uri} 308");
    expect(rendered).not.toContain(`http://203.0.113.10 {
    import common_site

    reverse_proxy selflify:3000
}`);
  });

  it("keeps the server ip route available in mocked runtimes even after setup", () => {
    vi.stubEnv("SELFLIFY_MOCK_CLOUDFLARE", "1");

    const configured = createConfig(createSite(), {
      admin: {
        login: "owner",
        passwordHash: "hash",
        configuredAt: "2026-04-07T12:00:00.000Z",
      },
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
    const rendered = generateCaddyfile(configured);

    expect(rendered).toContain(`http://203.0.113.10 {
    import common_site
    import panel_security_headers

    reverse_proxy selflify:3000
}`);
    expect(rendered).not.toContain("redir https://example.dev{uri} 308");
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
    expect(rendered).toContain("http://app.example.dev {");
    expect(rendered).toContain("http://*.app.example.dev {");
    expect(rendered).toContain("reverse_proxy host.docker.internal:3000");
  });

  it("serves the stable branch from an optional alias without exposing preview hosts there", () => {
    const config = createConfig(
      createSite({
        stableAlias: "www.example.com",
        stableAliasAutoTls: true,
        stableAliasUseCloudflare: true,
      }),
    );
    const rendered = generateCaddyfile(config);

    expect(rendered).toContain("app.example.dev {");
    expect(rendered).toContain("www.example.com {");
    expect(rendered).toContain("*.app.example.dev {");
    expect(rendered).toContain("root * /var/www/app/stable");
    expect(rendered).not.toContain("www.example.com, *.app.example.dev");
    expect(rendered).toContain("dns cloudflare cf-token");
  });

  it("keeps the stable alias on plain http when alias tls is disabled", () => {
    const config = createConfig(
      createSite({
        stableAlias: "www.example.com",
        stableAliasAutoTls: false,
        stableAliasUseCloudflare: true,
      }),
    );
    const rendered = generateCaddyfile(config);

    expect(rendered).toContain("http://www.example.com {");
    expect(rendered).not.toContain("\nwww.example.com {\n");
  });

  it("lets the alias use direct tls even when the canonical site still uses cloudflare dns", () => {
    const config = createConfig(
      createSite({
        stableAlias: "www.example.com",
        stableAliasAutoTls: true,
        stableAliasUseCloudflare: false,
      }),
    );
    const rendered = generateCaddyfile(config);

    expect(rendered).toContain("app.example.dev {");
    expect(rendered).toContain("www.example.com {");
    expect(rendered).toContain("    import tls_cf");
    expect(rendered).toContain("www.example.com {\n    import common_headers\n    import static_cache");
    expect(rendered).not.toContain("www.example.com {\n    import tls_cf");
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
