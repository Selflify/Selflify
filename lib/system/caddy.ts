import fs from "node:fs/promises";
import path from "node:path";

import type { SelflifyConfig, SiteConfig } from "@/lib/config/schema";
import {
  getEffectiveCaddyAdminAddress,
  getEffectiveCaddyBinaryPath,
  getEffectiveCaddyConfigPath,
  getEffectivePreviewRoot,
} from "@/lib/config/paths";
import { runCommand } from "@/lib/system/commands";
import { shouldSkipCaddyReload } from "@/lib/system/runtime";

function escapeCaddyLiteral(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function renderTlsBlock(token: string): string {
  if (!token) {
    return "";
  }

  return `
(tls_cf) {
    tls {
        dns cloudflare "${escapeCaddyLiteral(token)}"
    }
}
`;
}

function renderCommonSiteImports(hasToken: boolean): string {
  return hasToken
    ? "    import tls_cf\n    import common_headers\n    import static_cache"
    : "    import common_headers\n    import static_cache";
}

function renderPreviewBlock(config: SelflifyConfig, site: SiteConfig): string {
  const previewRoot = path.join(getEffectivePreviewRoot(config), site.slug).replace(/\\/g, "/");
  const authBlock =
    site.previewAuth.enabled && site.previewAuth.login && site.previewAuth.passwordHash
      ? `
        basicauth {
            ${site.previewAuth.login} ${site.previewAuth.passwordHash}
        }
`
      : "";

  return `${site.slug}.${config.server.domain}, *.${site.slug}.${config.server.domain} {
    import common_site

    @preview expression \`{host} != "${site.slug}.${config.server.domain}"\`

    handle @preview {${authBlock}
        root * ${previewRoot}/{labels.3}
        try_files {path} {path}/ /index.html
        file_server
    }

    handle {
        root * ${previewRoot}/${site.mainBranch}
        try_files {path} {path}/ /index.html
        file_server
    }
}
`;
}

export function generateCaddyfile(config: SelflifyConfig): string {
  const hasToken = Boolean(config.server.cloudflareApiToken);
  const siteBlocks = config.sites
    .slice()
    .sort((left, right) => left.slug.localeCompare(right.slug))
    .map((site) => renderPreviewBlock(config, site))
    .join("\n");

  return `{
    admin 0.0.0.0:2019
    email ${config.server.caddyContactEmail}
}
${renderTlsBlock(config.server.cloudflareApiToken)}
(common_headers) {
    header {
        X-Robots-Tag "noindex, nofollow, noarchive, nosnippet, noimageindex"
        Referrer-Policy "strict-origin-when-cross-origin"
        X-Content-Type-Options "nosniff"
    }
}

(static_cache) {
    @static {
        path *.js *.mjs *.css *.map *.png *.jpg *.jpeg *.gif *.svg *.webp *.ico *.woff *.woff2 *.ttf *.eot
    }
    header @static Cache-Control "public, max-age=31536000, immutable"

    @html {
        path *.html /
    }
    header @html Cache-Control "no-store, no-cache, must-revalidate"
}

(common_site) {
${renderCommonSiteImports(hasToken)}

    encode gzip zstd
}

${config.server.domain} {
    import common_site

    reverse_proxy ${config.server.selflifyUpstream}
}

${siteBlocks}`.trim();
}

export async function writeGeneratedCaddyfile(config: SelflifyConfig): Promise<string> {
  const target = getEffectiveCaddyConfigPath(config);
  const rendered = generateCaddyfile(config);

  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${rendered}\n`, "utf8");

  return target;
}

export async function validateCaddyfile(config: SelflifyConfig): Promise<void> {
  const caddyBin = getEffectiveCaddyBinaryPath(config);
  const configPath = getEffectiveCaddyConfigPath(config);

  await runCommand(caddyBin, ["validate", "--config", configPath, "--adapter", "caddyfile"]);
}

export async function reloadCaddy(config: SelflifyConfig): Promise<void> {
  if (shouldSkipCaddyReload()) {
    return;
  }

  const caddyBin = getEffectiveCaddyBinaryPath(config);
  const configPath = getEffectiveCaddyConfigPath(config);
  const adminAddress = getEffectiveCaddyAdminAddress(config);

  await runCommand(caddyBin, [
    "reload",
    "--address",
    adminAddress,
    "--config",
    configPath,
    "--adapter",
    "caddyfile",
  ]);
}

export async function hashPasswordWithCaddy(
  config: SelflifyConfig,
  password: string,
): Promise<string> {
  const caddyBin = getEffectiveCaddyBinaryPath(config);

  return runCommand(caddyBin, ["hash-password", "--plaintext", password]);
}
