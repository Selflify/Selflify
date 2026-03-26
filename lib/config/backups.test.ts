import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { writeOperationBackups } from "@/lib/config/backups";
import { createDefaultConfig } from "@/lib/config/service";

const tempDirs: string[] = [];
const originalEnv = { ...process.env };

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "selflify-backups-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  process.env = { ...originalEnv };
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("writeOperationBackups", () => {
  it("writes protected config and caddy snapshots", async () => {
    const backupRoot = await makeTempDir();
    process.env = {
      ...process.env,
      SELFLIFY_BACKUP_ROOT: backupRoot,
      SELFLIFY_BACKUP_KEEP: "5",
    };

    const result = await writeOperationBackups({
      label: "save-settings",
      previousConfig: createDefaultConfig(),
      previousCaddyContents: "example.com {\n    respond \"ok\"\n}",
    });

    expect(result.backupRoot).toBe(backupRoot);

    const savedConfig = await fs.readFile(result.configBackupPath, "utf8");
    const savedCaddy = await fs.readFile(result.caddyBackupPath!, "utf8");

    expect(savedConfig).toContain('"version": 1');
    expect(savedCaddy).toContain('respond "ok"');
  });

  it("prunes old backups beyond retention", async () => {
    const backupRoot = await makeTempDir();
    process.env = {
      ...process.env,
      SELFLIFY_BACKUP_ROOT: backupRoot,
      SELFLIFY_BACKUP_KEEP: "1",
    };

    await writeOperationBackups({
      label: "first-operation",
      previousConfig: createDefaultConfig(),
      previousCaddyContents: "first.test {\n    respond \"first\"\n}",
    });

    await writeOperationBackups({
      label: "second-operation",
      previousConfig: createDefaultConfig(),
      previousCaddyContents: "second.test {\n    respond \"second\"\n}",
    });

    const configBackups = await fs.readdir(path.join(backupRoot, "config"));
    const caddyBackups = await fs.readdir(path.join(backupRoot, "caddy"));

    expect(configBackups).toHaveLength(1);
    expect(caddyBackups).toHaveLength(1);
  });
});
