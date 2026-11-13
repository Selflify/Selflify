import { existsSync } from "node:fs";

import { ContainerError } from "./runner-contract";
import type { ContainerRelease, ContainerSecrets } from "./schema";
import { readBody, unixRequest } from "./unix-http";

export function containerRunnerEnabled(): boolean {
  const socket = process.env.SELFLIFY_CONTAINER_RUNNER_SOCKET;
  return Boolean(socket && existsSync(socket));
}

async function call(path: string, body: unknown, timeout: number): Promise<{ logs?: string }> {
  const socket = process.env.SELFLIFY_CONTAINER_RUNNER_SOCKET;
  if (!socket) throw new ContainerError(503, "Enable the Selflify container runner first.");

  try {
    const response = await unixRequest(socket, path, { method: "POST", body, timeout });
    const result = JSON.parse(await readBody(response, 160_000));
    if (response.statusCode !== 200) {
      throw new ContainerError(response.statusCode ?? 502, result.error);
    }
    return result;
  } catch (error) {
    if (error instanceof ContainerError) throw error;
    throw new ContainerError(502, "The container runner is unavailable.");
  }
}

export const containerRunner = {
  prepare: (release: ContainerRelease, secrets: ContainerSecrets) =>
    call("/prepare", { release, secrets }, 205_000),
  check: (release: ContainerRelease) => call("/check", release, 32_000),
  prune: (keep: string[]) => call("/prune", { keep }, 30_000),
  logs: (id: string) => call("/logs", { id }, 12_000),
};
