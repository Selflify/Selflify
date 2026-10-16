import fs from "node:fs/promises";
import path from "node:path";
import lockfile from "proper-lockfile";

import { getDeployLockPath } from "@/lib/config/paths";

// All containers use the same mounted directory and lease settings.
export async function withDeployLock<T>(task: () => Promise<T>): Promise<T> {
  const target = getDeployLockPath();
  await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o770 });
  const release = await lockfile.lock(target, {
    realpath: false,
    stale: 120_000,
    update: 10_000,
    retries: { retries: 100, factor: 1, minTimeout: 100, maxTimeout: 100 },
  });
  try {
    return await task();
  } finally {
    await release();
  }
}
