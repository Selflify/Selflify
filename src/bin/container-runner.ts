import fs from "node:fs/promises";
import path from "node:path";

import { ContainerError } from "@/lib/containers/runner-contract";
import { readDockerInfo } from "@/lib/containers/docker-info";
import { createDockerRuntime } from "@/lib/containers/docker";
import { createContainerRunner } from "@/lib/containers/runner";

async function main() {
  const socket = process.env.SELFLIFY_CONTAINER_RUNNER_SOCKET ?? "/run/selflify-runner/runner.sock";
  const network = process.env.SELFLIFY_CONTAINER_NETWORK;
  if (!network) throw new Error("Set SELFLIFY_CONTAINER_NETWORK.");
  process.umask(0o077);
  await fs.mkdir(path.dirname(socket), { recursive: true });
  await fs.rm(socket, { force: true });
  const dockerSocket = process.env.SELFLIFY_DOCKER_SOCKET ?? "/var/run/docker.sock";
  const diskPath = process.env.SELFLIFY_DOCKER_DISK_PATH;
  const assertDiskBudget = diskPath
    ? async () => {
        if (!process.env.SELFLIFY_DOCKER_IMAGE_ROOT) {
          const info = await readDockerInfo(dockerSocket);
          const legacyRoot = process.env.SELFLIFY_DOCKER_DATA_ROOT || "/var/lib/docker";
          if (info.usesContainerd || info.root !== legacyRoot) {
            throw new ContainerError(
              503,
              "Set SELFLIFY_DOCKER_IMAGE_ROOT to the Docker image store on the host, then recreate the runner.",
            );
          }
        }
        const disk = await fs.statfs(diskPath);
        if (disk.bavail * disk.bsize < 2 * 1024 * 1024 * 1024) {
          throw new ContainerError(
            507,
            "Less than 2 GiB remains on the Docker filesystem. Free space before publishing.",
          );
        }
      }
    : undefined;
  createContainerRunner(createDockerRuntime(dockerSocket, network, assertDiskBudget)).listen(
    socket,
  );
}

main().catch(() => {
  console.error("Could not start the Selflify container runner.");
  process.exitCode = 1;
});
