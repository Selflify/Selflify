import path from "node:path";

import type { SelflifyConfig } from "@/lib/config/schema";

const cwd = path.resolve(/* turbopackIgnore: true */ process.cwd());

function resolvePathValue(value: string): string {
  return path.isAbsolute(value) ? value : path.resolve(cwd, value);
}

function resolveOrDefault(value: string | undefined, fallback: string): string {
  return resolvePathValue(value ?? fallback);
}

export function getConfigPath(): string {
  return resolveOrDefault(process.env.SELFLIFY_CONFIG_PATH, "./selflify.config.json");
}

export function getDefaultPreviewRoot(): string {
  return resolveOrDefault(process.env.SELFLIFY_PREVIEW_ROOT, "/var/www");
}

export function getDefaultOrphanRoot(): string {
  return resolvePathValue(path.join(getDefaultPreviewRoot(), ".orphaned-sites"));
}

export function getDefaultBackupRoot(): string {
  return resolveOrDefault(process.env.SELFLIFY_BACKUP_ROOT, "./.selflify/backups");
}

export function getDefaultCaddyConfigPath(): string {
  const fallback = process.env.NODE_ENV === "development" ? "./.dev/Caddyfile" : "./Caddyfile";
  return resolveOrDefault(process.env.SELFLIFY_CADDY_CONFIG_PATH, fallback);
}

export function getDefaultCaddyBinaryPath(): string {
  return process.env.SELFLIFY_CADDY_BIN ?? "caddy";
}

export function getDefaultCaddyAdminAddress(): string {
  return process.env.SELFLIFY_CADDY_ADMIN_ADDRESS ?? "http://caddy:2019";
}

export function getEffectivePreviewRoot(config: SelflifyConfig): string {
  return resolveOrDefault(process.env.SELFLIFY_PREVIEW_ROOT, config.server.previewRootDir);
}

export function getEffectiveOrphanRoot(config: SelflifyConfig): string {
  return resolveOrDefault(process.env.SELFLIFY_ORPHAN_ROOT, config.server.orphanedRootDir);
}

export function getEffectiveBackupRoot(): string {
  return getDefaultBackupRoot();
}

export function getEffectiveCaddyConfigPath(config: SelflifyConfig): string {
  return resolveOrDefault(process.env.SELFLIFY_CADDY_CONFIG_PATH, config.server.caddyConfigPath);
}

export function getEffectiveCaddyBinaryPath(config: SelflifyConfig): string {
  return process.env.SELFLIFY_CADDY_BIN ?? config.server.caddyBinaryPath;
}

export function getEffectiveCaddyAdminAddress(config: SelflifyConfig): string {
  return process.env.SELFLIFY_CADDY_ADMIN_ADDRESS ?? config.server.caddyAdminAddress;
}

export function getEffectiveSelflifyUpstream(config: SelflifyConfig): string {
  if (process.env.SELFLIFY_UPSTREAM) {
    return process.env.SELFLIFY_UPSTREAM;
  }

  if (
    process.env.NODE_ENV === "development" &&
    config.server.selflifyUpstream === "selflify:3000"
  ) {
    return "host.docker.internal:3000";
  }

  return config.server.selflifyUpstream;
}

export function resolveConfiguredPath(value: string): string {
  return resolvePathValue(value);
}
