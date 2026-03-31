import fs from "node:fs/promises";
import path from "node:path";

import type { SelflifyConfig, SiteConfig } from "@/lib/config/schema";
import {
  getEffectiveCaddyAdminAddress,
  getEffectiveCaddyBinaryPath,
  getEffectiveCaddyContainerName,
  getEffectiveCaddyConfigPath,
  getEffectivePreviewRoot,
  getEffectiveSelflifyUpstream,
} from "@/lib/config/paths";
import { runCommand } from "@/lib/system/commands";
import type { CaddyGateway, CommandRunner } from "@/lib/system/ports";
import {
  isDevelopmentRuntime,
  shouldMockCloudflare,
  shouldSkipCaddyReload,
} from "@/lib/system/runtime";

function renderTlsBlock(token: string): string {
  if (!token) {
    return "";
  }

  return `
(tls_cf) {
    tls {
        dns cloudflare ${token}
    }
}
`;
}

function renderCommonSiteImports(hasToken: boolean): string {
  return hasToken
    ? "    import tls_cf\n    import common_headers\n    import static_cache"
    : "    import common_headers\n    import static_cache";
}

type CaddyCommandSpec = {
  command: string;
  args: string[];
  containerized: boolean;
};

const DEV_CONTAINER_CADDY_CONFIG_PATH = "/etc/caddy/Caddyfile";
const DEV_CONTAINER_CADDY_ADMIN_ADDRESS = "0.0.0.0:2019";
const CADDY_ADMIN_BIND_ADDRESS = "0.0.0.0:2019";
const DEFAULT_CADDY_ADMIN_ORIGINS = [
  "http://0.0.0.0:2019",
  "http://127.0.0.1:2019",
  "http://localhost:2019",
];
const DEFAULT_CADDY_ADMIN_FETCH_ORIGIN = `http://${CADDY_ADMIN_BIND_ADDRESS}`;

function isSpawnNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

function getCommandFailureDetails(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const stderr = (error as { stderr?: unknown }).stderr;

    if (typeof stderr === "string" && stderr.trim()) {
      return stderr.trim();
    }
  }

  return error instanceof Error ? error.message : "Unknown command failure.";
}

function shouldUseContainerizedCaddy(config: SelflifyConfig): boolean {
  return isDevelopmentRuntime() && getEffectiveCaddyBinaryPath(config) === "caddy";
}

function normalizeAdminAddressForCli(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);

    return parsed.host || trimmed;
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}

function normalizeAdminOrigin(value: string): string | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);

    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return `http://${normalizeAdminAddressForCli(trimmed)}`;
  }
}

function normalizeAdminApiBaseUrl(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    return "http://127.0.0.1:2019";
  }

  try {
    const parsed = new URL(trimmed);

    parsed.pathname = "";
    parsed.search = "";
    parsed.hash = "";

    return parsed.toString().replace(/\/$/, "");
  } catch {
    return `http://${normalizeAdminAddressForCli(trimmed)}`;
  }
}

function renderAdminBlock(config: SelflifyConfig): string {
  const origins = new Set(DEFAULT_CADDY_ADMIN_ORIGINS);
  const configuredOrigin = normalizeAdminOrigin(getEffectiveCaddyAdminAddress(config));

  if (configuredOrigin) {
    origins.add(configuredOrigin);
  }

  return `    admin ${CADDY_ADMIN_BIND_ADDRESS} {
        origins ${Array.from(origins).join(" ")}
    }`;
}

export function resolveCaddyCommand(config: SelflifyConfig, args: string[]): CaddyCommandSpec {
  if (shouldUseContainerizedCaddy(config)) {
    return {
      command: "docker",
      args: ["exec", getEffectiveCaddyContainerName(), "caddy", ...args],
      containerized: true,
    };
  }

  return {
    command: getEffectiveCaddyBinaryPath(config),
    args,
    containerized: false,
  };
}

export function resolveCaddyCommandConfigPath(config: SelflifyConfig): string {
  return shouldUseContainerizedCaddy(config)
    ? DEV_CONTAINER_CADDY_CONFIG_PATH
    : getEffectiveCaddyConfigPath(config);
}

export function resolveCaddyCommandAdminAddress(config: SelflifyConfig): string {
  const rawAddress = shouldUseContainerizedCaddy(config)
    ? DEV_CONTAINER_CADDY_ADMIN_ADDRESS
    : getEffectiveCaddyAdminAddress(config);

  return normalizeAdminAddressForCli(rawAddress);
}

async function runCaddyCommand(
  config: SelflifyConfig,
  args: string[],
  commandRunner: CommandRunner,
): Promise<string> {
  const spec = resolveCaddyCommand(config, args);

  try {
    return await commandRunner(spec.command, spec.args);
  } catch (error) {
    if (spec.containerized) {
      throw new Error(
        `Caddy is not available in local development. Start it with \`docker compose -f docker-compose.dev.yml up -d caddy cleanup\`, or set \`SELFLIFY_CADDY_BIN\` to a local caddy binary. Details: ${getCommandFailureDetails(error)}`,
      );
    }

    if (isSpawnNotFound(error)) {
      throw new Error(
        `Caddy binary not found: ${spec.command}. Install Caddy or set \`SELFLIFY_CADDY_BIN\` to a valid binary path.`,
      );
    }

    throw error;
  }
}

function withDevScheme(host: string): string {
  return isDevelopmentRuntime() ? `http://${host}` : host;
}

function renderPreviewBlock(config: SelflifyConfig, site: SiteConfig): string {
  const previewRoot = path.join(getEffectivePreviewRoot(config), site.slug).replace(/\\/g, "/");
  const authBlock =
    site.previewAuth.enabled && site.previewAuth.login && site.previewAuth.passwordHash
      ? `
        basic_auth {
            ${site.previewAuth.login} ${site.previewAuth.passwordHash}
        }
`
      : "";
  const stableHost = `${site.slug}.${config.server.domain}`;
  const previewHost = `*.${site.slug}.${config.server.domain}`;

  return `${withDevScheme(stableHost)}, ${withDevScheme(previewHost)} {
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

function renderSelflifyPanelBlocks(config: SelflifyConfig): string {
  const blocks = [
    `${withDevScheme(config.server.domain)} {
    import common_site

    reverse_proxy ${getEffectiveSelflifyUpstream(config)}
}`,
  ];

  if (config.server.serverIp.trim()) {
    blocks.push(`http://${config.server.serverIp.trim()} {
    import common_site

    reverse_proxy ${getEffectiveSelflifyUpstream(config)}
}`);
  }

  return blocks.join("\n\n");
}

export function generateCaddyfile(config: SelflifyConfig): string {
  const usesManagedTls = Boolean(config.server.cloudflareApiToken) && !shouldMockCloudflare();
  const autoHttps = isDevelopmentRuntime() ? "    auto_https off\n" : "";
  const siteBlocks = config.sites
    .slice()
    .sort((left, right) => left.slug.localeCompare(right.slug))
    .map((site) => renderPreviewBlock(config, site))
    .join("\n");

  return `{
${renderAdminBlock(config)}
    email ${config.server.caddyContactEmail}
${autoHttps}}
${renderTlsBlock(usesManagedTls ? config.server.cloudflareApiToken : "")}
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
${renderCommonSiteImports(usesManagedTls)}

    encode gzip zstd

    log {
        output file /var/log/caddy/access.log {
            roll_size 20MiB
            roll_keep 10
            roll_keep_for 720h
        }
        format json
        level INFO
    }
}

${renderSelflifyPanelBlocks(config)}
${siteBlocks}`.trim();
}

export function createCaddyGateway(
  commandRunner: CommandRunner = runCommand,
  fetchImpl: typeof fetch = (...args) => globalThis.fetch(...args),
): CaddyGateway {
  return {
    async writeGeneratedConfig(config) {
      const target = getEffectiveCaddyConfigPath(config);
      const rendered = generateCaddyfile(config);

      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, `${rendered}\n`, {
        encoding: "utf8",
        mode: 0o600,
      });
      await fs.chmod(target, 0o600);

      return target;
    },
    async validateConfig(config) {
      const configPath = resolveCaddyCommandConfigPath(config);

      await runCaddyCommand(config, ["validate", "--config", configPath, "--adapter", "caddyfile"], commandRunner);
    },
    async reload(config) {
      if (shouldSkipCaddyReload()) {
        return;
      }

      if (shouldUseContainerizedCaddy(config)) {
        const configPath = resolveCaddyCommandConfigPath(config);
        const adminAddress = resolveCaddyCommandAdminAddress(config);

        await runCaddyCommand(
          config,
          ["reload", "--address", adminAddress, "--config", configPath, "--adapter", "caddyfile"],
          commandRunner,
        );

        return;
      }

      const configPath = getEffectiveCaddyConfigPath(config);
      const rawAdminAddress = getEffectiveCaddyAdminAddress(config);
      const adminBaseUrl = normalizeAdminApiBaseUrl(rawAdminAddress);
      const payload = await fs.readFile(configPath, "utf8");
      const response = await fetchImpl(`${adminBaseUrl}/load`, {
        method: "POST",
        headers: {
          "Content-Type": "text/caddyfile",
          Origin: DEFAULT_CADDY_ADMIN_FETCH_ORIGIN,
        },
        body: payload,
      });

      if (!response.ok) {
        const details = (await response.text()).trim();
        const suffix = details ? ` ${details}` : "";

        throw new Error(
          `Caddy admin API reload failed (${response.status} ${response.statusText}).${suffix}`,
        );
      }
    },
    async hashPassword(config, password) {
      return runCaddyCommand(config, ["hash-password", "--plaintext", password], commandRunner);
    },
  };
}

export const caddyGateway = createCaddyGateway();

export async function writeGeneratedCaddyfile(config: SelflifyConfig): Promise<string> {
  return caddyGateway.writeGeneratedConfig(config);
}

export async function validateCaddyfile(config: SelflifyConfig): Promise<void> {
  await caddyGateway.validateConfig(config);
}

export async function reloadCaddy(config: SelflifyConfig): Promise<void> {
  await caddyGateway.reload(config);
}

export async function hashPasswordWithCaddy(config: SelflifyConfig, password: string): Promise<string> {
  return caddyGateway.hashPassword(config, password);
}
