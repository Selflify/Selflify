import readline from "node:readline";
import { setTimeout as delay } from "node:timers/promises";

import { ContainerError } from "./runner-contract";
import { containerHostname, type ContainerRelease, type ContainerSecrets } from "./schema";
import { readBody, unixRequest } from "./unix-http";

const dockerApi = "/v1.44";
const ownerLabel = "io.selflify.container-network";
const releaseLabel = "io.selflify.release";

export function createDockerRuntime(socket: string, network: string) {
  async function request(
    path: string,
    method = "GET",
    body?: unknown,
    ignoreMissing = false,
  ): Promise<string | null> {
    const response = await unixRequest(socket, dockerApi + path, { method, body });
    const status = response.statusCode ?? 500;
    const contents = await readBody(response, 4 * 1024 * 1024);
    if (ignoreMissing && status === 404) return null;
    if (status >= 400)
      throw new ContainerError(502, "Docker could not complete the container operation.");
    return contents;
  }

  async function pull(image: string, credentials: ContainerSecrets["registry"]) {
    const host = image.split("/")[0];
    const auth =
      credentials?.host === host
        ? { username: credentials.username, password: credentials.password, serveraddress: host }
        : {};
    const query = new URLSearchParams({ fromImage: image });
    const response = await unixRequest(socket, `${dockerApi}/images/create?${query}`, {
      method: "POST",
      headers: { "X-Registry-Auth": Buffer.from(JSON.stringify(auth)).toString("base64url") },
      timeout: 150_000,
    });
    const failure = () =>
      new ContainerError(
        502,
        "Could not pull the image. Check the digest, registry access, and platform.",
      );
    if (response.statusCode !== 200) {
      response.destroy();
      throw failure();
    }
    for await (const line of readline.createInterface({ input: response, crlfDelay: Infinity })) {
      if (!line.trim()) continue;
      const event = JSON.parse(line);
      if (event.error || event.errorDetail) {
        response.destroy();
        throw failure();
      }
    }
  }

  async function check(release: ContainerRelease) {
    const name = containerHostname(release.id);
    const container = JSON.parse((await request(`/containers/${name}/json`))!) as {
      Config?: { Labels?: Record<string, string> };
      State?: { Running?: boolean };
    };
    if (
      container.Config?.Labels?.[ownerLabel] !== network ||
      container.Config.Labels[releaseLabel] !== release.id ||
      !container.State?.Running
    ) {
      throw new ContainerError(422, "The container release is not running.");
    }
    const target = `http://${name}:${release.port}${release.healthPath}`;
    const deadline = Date.now() + 25_000;
    do {
      try {
        const response = await fetch(target, {
          redirect: "manual",
          signal: AbortSignal.timeout(1500),
        });
        await response.body?.cancel();
        if (response.ok) return;
      } catch {
        // The container may still be starting or obtaining a DNS record.
      }
      await delay(500);
    } while (Date.now() < deadline);
    throw new ContainerError(422, "The container did not pass its HTTP health check.");
  }

  async function remove(id: string) {
    await request(
      `/containers/${encodeURIComponent(id)}?force=true&v=true`,
      "DELETE",
      undefined,
      true,
    );
  }

  return {
    check,
    async prepare(release: ContainerRelease, secrets: ContainerSecrets) {
      await pull(release.image, secrets.registry);
      const image = JSON.parse(
        (await request(`/images/${encodeURIComponent(release.image)}/json`))!,
      ) as {
        Id: string;
        Config?: { Volumes?: Record<string, unknown> };
      };
      if (Object.keys(image.Config?.Volumes ?? {}).length) {
        throw new ContainerError(
          422,
          "The image declares volumes. Container deployments require a stateless image.",
        );
      }

      const name = containerHostname(release.id);
      const env = { ...secrets.env, PORT: String(release.port) };
      const created = JSON.parse(
        (await request(`/containers/create?name=${name}`, "POST", {
          Image: image.Id,
          Env: Object.entries(env).map(([key, value]) => `${key}=${value}`),
          Labels: { [ownerLabel]: network, [releaseLabel]: release.id },
          HostConfig: {
            NetworkMode: network,
            CapDrop: ["ALL"],
            SecurityOpt: ["no-new-privileges:true"],
            Memory: 512 * 1024 * 1024,
            NanoCpus: 1_000_000_000,
            PidsLimit: 128,
            RestartPolicy: { Name: "unless-stopped" },
            LogConfig: { Type: "json-file", Config: { "max-size": "5m", "max-file": "2" } },
          },
          NetworkingConfig: { EndpointsConfig: { [network]: {} } },
        }))!,
      ) as { Id: string };
      try {
        await request(`/containers/${created.Id}/start`, "POST");
        await check(release);
      } catch (error) {
        await remove(created.Id).catch(() => {});
        throw error;
      }
    },
    async logs(id: string) {
      const name = containerHostname(id);
      const container = JSON.parse((await request(`/containers/${name}/json`))!) as {
        Id: string;
        Config?: { Labels?: Record<string, string>; Tty?: boolean };
      };
      if (
        container.Config?.Labels?.[ownerLabel] !== network ||
        container.Config.Labels[releaseLabel] !== id
      ) {
        throw new ContainerError(404, "Container release not found.");
      }
      const response = await unixRequest(
        socket,
        `${dockerApi}/containers/${container.Id}/logs?stdout=true&stderr=true&tail=100`,
        { method: "GET" },
      );
      if (response.statusCode !== 200) {
        response.destroy();
        throw new ContainerError(502, "Could not read container logs.");
      }
      const limit = 24_000;
      const chunks: Buffer[] = [];
      let bytes = 0;
      for await (const chunk of response) {
        const data = Buffer.from(chunk);
        chunks.push(data.subarray(0, limit - bytes));
        bytes += data.length;
        if (bytes >= limit) break;
      }
      const data = Buffer.concat(chunks);
      let logs = "";
      if (container.Config.Tty) {
        logs = data.toString("utf8");
      } else {
        // Docker frames stdout and stderr with an eight-byte header when TTY is disabled.
        for (let offset = 0; offset + 8 <= data.length; ) {
          const size = data.readUInt32BE(offset + 4);
          offset += 8;
          logs += data.toString("utf8", offset, Math.min(offset + size, data.length));
          offset += size;
        }
      }
      return bytes >= limit ? logs + "\n[Output truncated]" : logs;
    },
    async prune(keep: string[]) {
      const filter = new URLSearchParams({
        all: "true",
        filters: JSON.stringify({
          label: [`${ownerLabel}=${network}`],
        }),
      });
      const containers = JSON.parse((await request(`/containers/json?${filter}`))!) as Array<{
        Id: string;
        Created: number;
        Labels: Record<string, string>;
      }>;
      const protectedReleases = new Set(keep);
      // Let in-flight requests drain after a route switch.
      for (const container of containers) {
        const release = container.Labels[releaseLabel];
        if (
          release &&
          !protectedReleases.has(release) &&
          Date.now() - container.Created * 1000 > 10 * 60_000
        ) {
          await remove(container.Id);
        }
      }
    },
  };
}
