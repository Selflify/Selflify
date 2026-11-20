import fs from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";

import { getConfigPath } from "@/lib/config/paths";
import type { SelflifyConfig } from "@/lib/config/schema";
import { readSelflifyConfig } from "@/lib/config/service";
import { atomicJson, getDeploymentSiteId, writeDeployPermissions } from "@/lib/deploy/permissions";
import { runSerializedTask } from "@/lib/operations";
import { caddyGateway } from "@/lib/system/caddy";
import { containerRunner } from "./client";
import { releaseIdSchema, storageSiteIdSchema } from "./schema";

const activationSchema = z.object({ siteId: storageSiteIdSchema, candidateId: releaseIdSchema });
type Activation = z.infer<typeof activationSchema>;

function markerPath() {
  return path.join(path.dirname(getConfigPath()), "container-publication.json");
}

export function markContainerPublication(activation?: Activation) {
  return atomicJson(markerPath(), { startedAt: new Date().toISOString(), activation });
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

export async function restoreContainerActivation(config: SelflifyConfig, activation: Activation) {
  const active = config.sites.find((site) => getDeploymentSiteId(site) === activation.siteId)
    ?.container?.active;
  if (active?.id !== activation.candidateId) await containerRunner.stop(activation.candidateId);
  if (active) await containerRunner.activate(active);
}

// The caller holds the deploy lock.
export async function reconcileContainerPublication(config: SelflifyConfig) {
  if (!(await hasPendingContainerPublication())) return;
  const { activation } = z
    .object({ activation: activationSchema.optional() })
    .parse(JSON.parse(await fs.readFile(markerPath(), "utf8")));
  if (activation) await restoreContainerActivation(config, activation);
  await caddyGateway.writeGeneratedConfig(config);
  await caddyGateway.validateConfig(config);
  await caddyGateway.reload(config);
  await writeDeployPermissions(config);
  await clearContainerPublication();
}

// A worker crash may leave Caddy serving a different route from the durable config.
export async function recoverContainerPublication() {
  if (!(await hasPendingContainerPublication())) return;
  await runSerializedTask(async () => {
    if (await hasPendingContainerPublication()) {
      await reconcileContainerPublication(await readSelflifyConfig());
    }
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
