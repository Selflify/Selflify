import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createDefaultConfig, readSelflifyConfig, writeSelflifyConfig } from "@/lib/config/service";
import { ConfigConflictError, runConfigOperation } from "@/lib/operations";
import { ensureSiteDirectories, removeSiteDirectory } from "@/lib/sites/service";

const tempDirs: string[] = [];
const originalEnv = { ...process.env };

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "selflify-operations-test-"));
  tempDirs.push(dir);
  return dir;
}

async function writeFakeCaddyBinary(dir: string): Promise<{
  binaryPath: string;
  logPath: string;
  failMarkerPath: string;
}> {
  const binaryPath = path.join(dir, "fake-caddy.sh");
  const logPath = path.join(dir, "caddy.log");
  const failMarkerPath = path.join(dir, "reload.failed");
  const script = `#!/bin/sh
cmd="$1"
shift

if [ -n "$SELFLIFY_TEST_CADDY_LOG" ]; then
  echo "$cmd $*" >> "$SELFLIFY_TEST_CADDY_LOG"
fi

if [ "$cmd" = "validate" ]; then
  exit 0
fi

if [ "$cmd" = "reload" ]; then
  if [ "$SELFLIFY_TEST_FAIL_RELOAD" = "1" ] && [ ! -f "$SELFLIFY_TEST_FAIL_MARKER" ]; then
    touch "$SELFLIFY_TEST_FAIL_MARKER"
    exit 1
  fi

  exit 0
fi

if [ "$cmd" = "hash-password" ]; then
  printf '%s\\n' "hashed-password"
  exit 0
fi

exit 0
`;

  await fs.writeFile(binaryPath, script, { encoding: "utf8", mode: 0o755 });
  await fs.chmod(binaryPath, 0o755);

  return {
    binaryPath,
    logPath,
    failMarkerPath,
  };
}

function applyTestEnv(options: {
  configPath: string;
  caddyConfigPath: string;
  caddyBinaryPath: string;
  backupRoot: string;
  logPath: string;
  failMarkerPath: string;
  failReload?: boolean;
}) {
  process.env = {
    ...originalEnv,
    NODE_ENV: "production",
    SELFLIFY_DEV_MODE: "0",
    SELFLIFY_CONFIG_PATH: options.configPath,
    SELFLIFY_CADDY_CONFIG_PATH: options.caddyConfigPath,
    SELFLIFY_CADDY_BIN: options.caddyBinaryPath,
    SELFLIFY_CADDY_ADMIN_ADDRESS: "http://caddy-test:2019",
    SELFLIFY_BACKUP_ROOT: options.backupRoot,
    SELFLIFY_SKIP_CADDY_RELOAD: "0",
    SELFLIFY_TEST_CADDY_LOG: options.logPath,
    SELFLIFY_TEST_FAIL_MARKER: options.failMarkerPath,
    SELFLIFY_TEST_FAIL_RELOAD: options.failReload ? "1" : "0",
  };
}

function createSiteConfigPaths(root: string) {
  return {
    configPath: path.join(root, "selflify.config.json"),
    caddyConfigPath: path.join(root, "Caddyfile"),
    previewRoot: path.join(root, "var-www"),
    backupRoot: path.join(root, "backups"),
  };
}

afterEach(async () => {
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe.sequential("runConfigOperation", () => {
  it("applies a successful config mutation and increments revision", async () => {
    const root = await makeTempDir();
    const fakeCaddy = await writeFakeCaddyBinary(root);
    const paths = createSiteConfigPaths(root);

    applyTestEnv({
      ...paths,
      caddyBinaryPath: fakeCaddy.binaryPath,
      logPath: fakeCaddy.logPath,
      failMarkerPath: fakeCaddy.failMarkerPath,
    });

    const config = createDefaultConfig();
    config.server.previewRootDir = paths.previewRoot;
    config.server.orphanedRootDir = path.join(paths.previewRoot, ".orphaned-sites");
    config.server.caddyConfigPath = paths.caddyConfigPath;
    config.server.caddyBinaryPath = fakeCaddy.binaryPath;
    config.server.caddyAdminAddress = "http://caddy-test:2019";
    await writeSelflifyConfig(config);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("", {
          status: 200,
        }),
      ),
    );

    await runConfigOperation({
      label: "save-settings",
      expectedRevision: 0,
      mutate: async (draft) => {
        draft.server.domain = "preview.example.dev";
        return { config: draft, result: null };
      },
    });

    const persisted = await readSelflifyConfig();
    const caddyLog = await fs.readFile(fakeCaddy.logPath, "utf8");

    expect(persisted.configRevision).toBe(1);
    expect(persisted.server.domain).toBe("preview.example.dev");
    expect(persisted.operations.lastStatus).toBe("success");
    expect(caddyLog).toContain("validate");
    expect(caddyLog).not.toContain("reload");
  });

  it("rejects stale revisions with a conflict error", async () => {
    const root = await makeTempDir();
    const fakeCaddy = await writeFakeCaddyBinary(root);
    const paths = createSiteConfigPaths(root);

    applyTestEnv({
      ...paths,
      caddyBinaryPath: fakeCaddy.binaryPath,
      logPath: fakeCaddy.logPath,
      failMarkerPath: fakeCaddy.failMarkerPath,
    });

    const config = createDefaultConfig();
    config.configRevision = 2;
    config.server.caddyConfigPath = paths.caddyConfigPath;
    config.server.caddyBinaryPath = fakeCaddy.binaryPath;
    await writeSelflifyConfig(config);

    await expect(
      runConfigOperation({
        label: "save-settings",
        expectedRevision: 1,
        mutate: async (draft) => ({ config: draft, result: null }),
      }),
    ).rejects.toBeInstanceOf(ConfigConflictError);
  });

  it("rolls back config, caddyfile and filesystem changes when reload fails", async () => {
    const root = await makeTempDir();
    const fakeCaddy = await writeFakeCaddyBinary(root);
    const paths = createSiteConfigPaths(root);

    applyTestEnv({
      ...paths,
      caddyBinaryPath: fakeCaddy.binaryPath,
      logPath: fakeCaddy.logPath,
      failMarkerPath: fakeCaddy.failMarkerPath,
      failReload: true,
    });

    const config = createDefaultConfig();
    config.server.previewRootDir = paths.previewRoot;
    config.server.orphanedRootDir = path.join(paths.previewRoot, ".orphaned-sites");
    config.server.caddyConfigPath = paths.caddyConfigPath;
    config.server.caddyBinaryPath = fakeCaddy.binaryPath;
    config.server.caddyAdminAddress = "http://caddy-test:2019";

    await writeSelflifyConfig(config);
    await fs.writeFile(paths.caddyConfigPath, "original caddyfile\n", "utf8");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("reload failed", {
          status: 500,
          statusText: "Internal Server Error",
        }),
      ),
    );

    const site = {
      slug: "app",
      name: "App",
      mainBranch: "stable",
      stableAlias: null,
      previewAuth: {
        enabled: false,
        login: null,
        passwordHash: null,
      },
      createdAt: "2026-03-26T18:00:00.000Z",
      updatedAt: "2026-03-26T18:00:00.000Z",
    };

    await expect(
      runConfigOperation({
        label: "create-site:app",
        expectedRevision: 0,
        mutate: async (draft) => {
          draft.sites.push(site);
          return { config: draft, result: null };
        },
        beforePersist: async (draft) => {
          await ensureSiteDirectories(draft, site);
        },
        rollbackBeforePersist: async (draft) => {
          await removeSiteDirectory(draft, site);
        },
      }),
    ).rejects.toThrow();

    const persisted = await readSelflifyConfig();
    const restoredCaddy = await fs.readFile(paths.caddyConfigPath, "utf8");
    const siteDir = path.join(paths.previewRoot, site.slug);
    const backupDirs = await Promise.all([
      fs.readdir(path.join(paths.backupRoot, "config")),
      fs.readdir(path.join(paths.backupRoot, "caddy")),
    ]);

    await expect(fs.access(siteDir)).rejects.toThrow();
    expect(persisted.configRevision).toBe(0);
    expect(persisted.sites).toHaveLength(0);
    expect(persisted.operations.lastStatus).toBe("failed");
    expect(persisted.operations.lastOperationLabel).toBe("create-site:app");
    expect(restoredCaddy).toBe("original caddyfile\n");
    expect(backupDirs[0].length).toBeGreaterThan(0);
    expect(backupDirs[1].length).toBeGreaterThan(0);
  });
});
