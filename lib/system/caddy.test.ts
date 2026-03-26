import { describe, expect, it } from "vitest";

import { type SelflifyConfig, type SiteConfig } from "@/lib/config/schema";
import { createDefaultConfig } from "@/lib/config/service";
import { generateCaddyfile } from "@/lib/system/caddy";

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
      domain: "sendsay.dev",
      previewRootDir: "/var/www",
      selflifyUpstream: "selflify:3000",
      caddyContactEmail: "dev@sendsay.dev",
      cloudflareApiToken: "cf-token",
      ...(partial?.server ?? {}),
    },
    sites: [site],
  };
}

describe("generateCaddyfile", () => {
  it("renders apex proxy, preview auth and stable root mapping", () => {
    const config = createConfig(createSite());
    const rendered = generateCaddyfile(config);

    expect(rendered).toContain("reverse_proxy selflify:3000");
    expect(rendered).toContain('dns cloudflare "cf-token"');
    expect(rendered).toContain("root * /var/www/app/{labels.3}");
    expect(rendered).toContain("root * /var/www/app/stable");
    expect(rendered).toContain("preview-user hashed-secret");
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
          domain: "sendsay.dev",
          previewRootDir: "/var/www",
          selflifyUpstream: "selflify:3000",
          caddyContactEmail: "dev@sendsay.dev",
          cloudflareApiToken: "",
        },
      },
    );
    const rendered = generateCaddyfile(config);

    expect(rendered).not.toContain("dns cloudflare");
    expect(rendered).not.toContain("basicauth {");
    expect(rendered).toContain("import common_headers");
    expect(rendered).toContain("import static_cache");
  });
});
