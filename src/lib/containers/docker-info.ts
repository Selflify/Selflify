import { ContainerError } from "./runner-contract";
import { readBody, unixRequest } from "./unix-http";

export const dockerApi = "/v1.44";

export async function readDockerInfo(socket: string) {
  const response = await unixRequest(socket, dockerApi + "/info", { method: "GET" });
  const body = await readBody(response, 4 * 1024 * 1024);
  if (response.statusCode !== 200) {
    throw new ContainerError(502, "Could not determine the Docker image store.");
  }
  const info = JSON.parse(body) as { DriverStatus?: string[][]; DockerRootDir: string };
  if (!info.DockerRootDir) {
    throw new ContainerError(502, "Docker did not report its data root.");
  }
  return {
    root: info.DockerRootDir,
    usesContainerd: !!info.DriverStatus?.some(
      ([key, value]) => key === "driver-type" && value === "io.containerd.snapshotter.v1",
    ),
  };
}
