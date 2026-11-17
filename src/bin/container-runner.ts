import fs from "node:fs/promises";
import path from "node:path";

import { ContainerError } from "@/lib/containers/runner-contract";
import { createDockerRuntime } from "@/lib/containers/docker";
import { createContainerRunner } from "@/lib/containers/runner";

async function main() {
  const socket = process.env.SELFLIFY_CONTAINER_RUNNER_SOCKET ?? "/run/selflify-runner/runner.sock";
  const network = process.env.SELFLIFY_CONTAINER_NETWORK;
  if (!network) throw new Error("Set SELFLIFY_CONTAINER_NETWORK.");
  process.umask(0o077);
  await fs.mkdir(path.dirname(socket), { recursive: true });
  await fs.rm(socket, { force: true });
  createContainerRunner(
    createDockerRuntime(
      process.env.SELFLIFY_DOCKER_SOCKET ?? "/var/run/docker.sock",
      network,
      async () => {
        const disk = await fs.statfs("/host-docker-data");
        if (disk.bavail * disk.bsize < 2 * 1024 * 1024 * 1024) {
          throw new ContainerError(
            507,
            "Less than 2 GiB remains on the Docker filesystem. Free space before publishing.",
          );
        }
      },
    ),
  ).listen(socket);
}

main().catch(() => {
  console.error("Could not start the Selflify container runner.");
  process.exitCode = 1;
});
