import fs from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { getConfigPath } from "@/lib/config/paths";
import { readSelflifyConfig } from "@/lib/config/service";
import { atomicJson, writeDeployPermissions } from "@/lib/deploy/permissions";
import { runSerializedTask } from "@/lib/operations";
import { caddyGateway } from "@/lib/system/caddy";

function markerPath() {
  return path.join(path.dirname(getConfigPath()), "container-publication.json");
}

export function markContainerPublication() {
  return atomicJson(markerPath(), { startedAt: new Date().toISOString() });
}

export function clearContainerPublication() {
  return fs.rm(markerPath(), { force: true });
}

export async function hasPendingContainerPublication() {
  try {
    await fs.access(markerPath());
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

// A worker crash may leave Caddy serving a different route from the durable config.
export async function recoverContainerPublication() {
  if (!(await hasPendingContainerPublication())) return;
  await runSerializedTask(async () => {
    if (!(await hasPendingContainerPublication())) return;
    const config = await readSelflifyConfig();
    await caddyGateway.writeGeneratedConfig(config);
    await caddyGateway.validateConfig(config);
    await caddyGateway.reload(config);
    await writeDeployPermissions(config);
    await clearContainerPublication();
  });
}

// A process that exited abruptly may still own the lock until its lease expires.
export async function recoverContainerPublicationOnStartup() {
  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      await recoverContainerPublication();
      return;
    } catch (error) {
      if (attempt === 11) throw error;
      await delay(5000, undefined, { ref: false });
    }
  }
}
