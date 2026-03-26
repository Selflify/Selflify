import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { selflifyConfigSchema, type SelflifyConfig } from "@/lib/config/schema";
import {
  getConfigPath,
  getDefaultCaddyAdminAddress,
  getDefaultCaddyBinaryPath,
  getDefaultCaddyConfigPath,
  getDefaultOrphanRoot,
  getDefaultPreviewRoot,
} from "@/lib/config/paths";

function isoNow(): string {
  return new Date().toISOString();
}

function randomSecret(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function createDefaultConfig(): SelflifyConfig {
  const now = isoNow();

  return selflifyConfigSchema.parse({
    version: 1,
    configRevision: 0,
    updatedAt: now,
    sessionSecret: process.env.AUTH_SECRET ?? randomSecret(),
    admin: {
      login: "",
      passwordHash: "",
      configuredAt: null,
    },
    server: {
      domain: "sendsay.dev",
      serverIp: "",
      cloudflareApiToken: "",
      previewRootDir: getDefaultPreviewRoot(),
      orphanedRootDir: getDefaultOrphanRoot(),
      caddyConfigPath: getDefaultCaddyConfigPath(),
      caddyBinaryPath: getDefaultCaddyBinaryPath(),
      caddyAdminAddress: getDefaultCaddyAdminAddress(),
      selflifyUpstream: "selflify:3000",
      caddyContactEmail: "dev@sendsay.dev",
    },
    operations: {
      lastOperationId: null,
      lastOperationLabel: null,
      lastStatus: "idle",
      lastMessage: null,
      lastAppliedAt: null,
    },
    sites: [],
  });
}

export function parseConfig(input: unknown): SelflifyConfig {
  return selflifyConfigSchema.parse(input);
}

export async function readSelflifyConfig(): Promise<SelflifyConfig> {
  const configPath = getConfigPath();

  try {
    const raw = await fsp.readFile(configPath, "utf8");
    return parseConfig(JSON.parse(raw));
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;

    if (nodeError.code === "ENOENT") {
      return createDefaultConfig();
    }

    throw error;
  }
}

export function readSelflifyConfigSync(): SelflifyConfig {
  const configPath = getConfigPath();

  try {
    const raw = fs.readFileSync(configPath, "utf8");
    return parseConfig(JSON.parse(raw));
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;

    if (nodeError.code === "ENOENT") {
      return createDefaultConfig();
    }

    throw error;
  }
}

export async function writeSelflifyConfig(config: SelflifyConfig): Promise<void> {
  const configPath = getConfigPath();
  const resolvedPath = path.resolve(configPath);
  const dir = path.dirname(resolvedPath);

  await fsp.mkdir(dir, { recursive: true });

  const tempPath = path.join(
    dir,
    `.selflify-${process.pid}-${Date.now()}-${crypto.randomUUID()}.tmp`,
  );
  const normalized = parseConfig({
    ...config,
    updatedAt: isoNow(),
  });

  await fsp.writeFile(tempPath, `${JSON.stringify(normalized, null, 2)}${os.EOL}`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await fsp.rename(tempPath, resolvedPath);
  await fsp.chmod(resolvedPath, 0o600);
}

export async function ensureConfigOnDisk(): Promise<SelflifyConfig> {
  const configPath = getConfigPath();

  try {
    await fsp.access(configPath, fs.constants.F_OK);
    return readSelflifyConfig();
  } catch {
    const config = createDefaultConfig();
    await writeSelflifyConfig(config);
    return config;
  }
}

export function isAdminConfigured(config: SelflifyConfig): boolean {
  return Boolean(config.admin.login && config.admin.passwordHash);
}
