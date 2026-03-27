import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { SelflifyConfig } from "@/lib/config/schema";
import { getEffectiveBackupRoot } from "@/lib/config/paths";

const DEFAULT_BACKUP_KEEP = 20;

function normalizeSegment(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "operation";
}

function getBackupKeepCount(): number {
  const raw = Number(process.env.SELFLIFY_BACKUP_KEEP ?? DEFAULT_BACKUP_KEEP);

  if (!Number.isFinite(raw) || raw < 1) {
    return DEFAULT_BACKUP_KEEP;
  }

  return Math.floor(raw);
}

async function writeProtectedFile(targetPath: string, contents: string): Promise<void> {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, contents, {
    encoding: "utf8",
    mode: 0o600,
  });
  await fs.chmod(targetPath, 0o600);
}

async function pruneBackupDir(dir: string): Promise<void> {
  const keep = getBackupKeepCount();
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .map(async (entry) => {
        const fullPath = path.join(dir, entry.name);
        const stats = await fs.stat(fullPath);

        return {
          path: fullPath,
          modifiedAt: stats.mtimeMs,
        };
      }),
  );

  const stale = files
    .sort((left, right) => right.modifiedAt - left.modifiedAt)
    .slice(keep);

  await Promise.all(stale.map((entry) => fs.rm(entry.path, { force: true })));
}

export async function writeOperationBackups(options: {
  label: string;
  previousConfig: SelflifyConfig;
  previousCaddyContents: string | null;
}): Promise<{
  backupRoot: string;
  configBackupPath: string;
  caddyBackupPath: string | null;
}> {
  const backupRoot = getEffectiveBackupRoot();
  const configDir = path.join(backupRoot, "config");
  const caddyDir = path.join(backupRoot, "caddy");
  const timestamp = new Date().toISOString().replaceAll(":", "-");
  const suffix = crypto.randomUUID().slice(0, 8);
  const filename = `${timestamp}-${normalizeSegment(options.label)}-${suffix}`;
  const configBackupPath = path.join(configDir, `${filename}.json`);
  const caddyBackupPath = options.previousCaddyContents
    ? path.join(caddyDir, `${filename}.caddy`)
    : null;

  await writeProtectedFile(
    configBackupPath,
    `${JSON.stringify(options.previousConfig, null, 2)}${os.EOL}`,
  );

  if (options.previousCaddyContents && caddyBackupPath) {
    await writeProtectedFile(caddyBackupPath, `${options.previousCaddyContents}${os.EOL}`);
  }

  await pruneBackupDir(configDir);

  if (caddyBackupPath) {
    await pruneBackupDir(caddyDir);
  }

  return {
    backupRoot,
    configBackupPath,
    caddyBackupPath,
  };
}
