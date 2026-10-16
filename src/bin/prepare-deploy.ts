import fs from "node:fs/promises";
import path from "node:path";
import { getDeployLockPath, getEffectivePreviewRoot } from "@/lib/config/paths";
import { caddyGateway } from "@/lib/system/caddy";
import { ensureConfigOnDisk } from "@/lib/config/service";
import { writeDeployPermissions } from "@/lib/deploy/permissions";
import { withDeployLock } from "@/lib/deploy/lock";

withDeployLock(async () => {
  const config = await ensureConfigOnDisk();
  const root = getEffectivePreviewRoot(config);
  await fs.mkdir(root, { recursive: true });
  await fs.chmod(root, 0o775);
  const coordination = path.dirname(getDeployLockPath());
  await fs.chmod(coordination, 0o770);
  if (process.getuid?.() === 0) {
    await fs.chown(root, -1, 0);
    await fs.chown(coordination, -1, 0);
  }
  for (const site of config.sites) {
    const siteDir = path.join(root, site.slug);
    await fs.mkdir(siteDir, { recursive: true });
    if (!(await fs.lstat(siteDir)).isDirectory()) throw new Error("Invalid site directory.");
    await fs.chmod(siteDir, 0o775);
    if (process.getuid?.() === 0) await fs.chown(siteDir, -1, 0);
    for (const entry of await fs.readdir(siteDir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        await fs.chmod(path.join(siteDir, entry.name), 0o775);
        if (process.getuid?.() === 0) await fs.chown(path.join(siteDir, entry.name), -1, 0);
      }
    }
  }
  if (process.env.SELFLIFY_UPLOAD_STATE) {
    await fs.mkdir(process.env.SELFLIFY_UPLOAD_STATE, { recursive: true });
    if (process.getuid?.() === 0) await fs.chown(process.env.SELFLIFY_UPLOAD_STATE, 10001, 0);
    await fs.chmod(process.env.SELFLIFY_UPLOAD_STATE, 0o700);
  }
  await writeDeployPermissions(config);
  if (process.env.SELFLIFY_PREPARE_CADDY === "1") {
    await caddyGateway.writeGeneratedConfig(config);
    await caddyGateway.validateConfig(config);
  }
}).catch(() => {
  console.error("Could not prepare deploy permissions.");
  process.exitCode = 1;
});
