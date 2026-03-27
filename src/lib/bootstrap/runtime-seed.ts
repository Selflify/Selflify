import configTemplate from "../../../bootstrap/selflify.config.template.json";

import { selflifyConfigSchema, type SelflifyConfig } from "@/lib/config/schema";

export const DEFAULT_RUNTIME_DOMAIN = "preview.example.com";
const DEFAULT_SESSION_SECRET = "change-me-before-production-selflify-session-secret";

type RuntimeSeedOverrides = {
  updatedAt?: string;
  sessionSecret?: string;
  domain?: string;
  serverIp?: string;
  caddyContactEmail?: string;
  previewRootDir?: string;
  orphanedRootDir?: string;
  caddyConfigPath?: string;
  caddyBinaryPath?: string;
  caddyAdminAddress?: string;
  selflifyUpstream?: string;
};

function replaceTemplateStrings(value: unknown, replacements: Record<string, string>): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => replaceTemplateStrings(entry, replacements));
  }

  if (typeof value === "string") {
    return replacements[value] ?? value;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, replaceTemplateStrings(entry, replacements)]),
    );
  }

  return value;
}

export function buildRuntimeSeedConfig(overrides: RuntimeSeedOverrides = {}): SelflifyConfig {
  const domain = overrides.domain?.trim() || DEFAULT_RUNTIME_DOMAIN;
  const serverIp = overrides.serverIp?.trim() || "";
  const caddyContactEmail = overrides.caddyContactEmail?.trim() || `admin@${domain}`;
  const sessionSecret = overrides.sessionSecret?.trim() || DEFAULT_SESSION_SECRET;
  const rendered = replaceTemplateStrings(structuredClone(configTemplate), {
    __SELFLIFY_DOMAIN__: domain,
    __SELFLIFY_SERVER_IP__: serverIp,
    __SELFLIFY_CADDY_EMAIL__: caddyContactEmail,
    __SELFLIFY_SESSION_SECRET__: sessionSecret,
  });
  const parsed = selflifyConfigSchema.parse(rendered);

  return selflifyConfigSchema.parse({
    ...parsed,
    updatedAt: overrides.updatedAt ?? parsed.updatedAt,
    sessionSecret,
    server: {
      ...parsed.server,
      previewRootDir: overrides.previewRootDir ?? parsed.server.previewRootDir,
      orphanedRootDir: overrides.orphanedRootDir ?? parsed.server.orphanedRootDir,
      caddyConfigPath: overrides.caddyConfigPath ?? parsed.server.caddyConfigPath,
      caddyBinaryPath: overrides.caddyBinaryPath ?? parsed.server.caddyBinaryPath,
      caddyAdminAddress: overrides.caddyAdminAddress ?? parsed.server.caddyAdminAddress,
      selflifyUpstream: overrides.selflifyUpstream ?? parsed.server.selflifyUpstream,
    },
  });
}

export function renderRuntimeSeedConfig(overrides: RuntimeSeedOverrides = {}): string {
  return `${JSON.stringify(buildRuntimeSeedConfig(overrides), null, 2)}\n`;
}
