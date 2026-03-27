import fs from "node:fs/promises";

import { runCleanupOnce } from "@/lib/cleanup/service";
import { getConfigPath } from "@/lib/config/paths";
import { readSelflifyConfig } from "@/lib/config/service";

const DEFAULT_PREVIEW_TTL_DAYS = 30;
const DEFAULT_ORPHAN_TTL_DAYS = 30;

function readTtlDays(name: string, fallback: number): number {
  const raw = Number(process.env[name] ?? fallback);

  if (!Number.isFinite(raw) || raw < 1) {
    return fallback;
  }

  return Math.floor(raw);
}

async function main(): Promise<void> {
  const configPath = getConfigPath();

  try {
    await fs.access(configPath);
  } catch {
    console.error(`Config not found: ${configPath}`);
    process.exit(1);
  }

  const config = await readSelflifyConfig();
  const report = await runCleanupOnce(config, {
    previewTtlDays: readTtlDays("SELFLIFY_PREVIEW_TTL_DAYS", DEFAULT_PREVIEW_TTL_DAYS),
    orphanTtlDays: readTtlDays("SELFLIFY_ORPHAN_TTL_DAYS", DEFAULT_ORPHAN_TTL_DAYS),
    logger: (message) => {
      console.log(message);
    },
  });

  console.log(
    `Cleanup finished. Removed ${report.removedPreviewDirs.length} preview dirs and ${report.removedOrphanDirs.length} orphan dirs.`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
