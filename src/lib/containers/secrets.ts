import fs from "node:fs/promises";
import path from "node:path";

import { getConfigPath } from "@/lib/config/paths";
import { atomicJson } from "@/lib/deploy/permissions";
import { containerSecretsSchema, type ContainerSecrets } from "./schema";

function getSecretsPath(id: string): string {
  return path.join(path.dirname(getConfigPath()), "container-secrets", `${id}.json`);
}

export async function readContainerSecrets(id?: string): Promise<ContainerSecrets> {
  if (!id) return { env: {} };
  return containerSecretsSchema.parse(JSON.parse(await fs.readFile(getSecretsPath(id), "utf8")));
}

export async function writeContainerSecrets(id: string, secrets: ContainerSecrets): Promise<void> {
  const file = getSecretsPath(id);
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  await atomicJson(file, secrets);
}

export async function removeContainerSecrets(id: string): Promise<void> {
  await fs.rm(getSecretsPath(id), { force: true });
}
