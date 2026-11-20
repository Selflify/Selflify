import { createHash } from "node:crypto";
import readline from "node:readline";
import { setTimeout as delay } from "node:timers/promises";

import { ContainerError } from "./runner-contract";
import { containerHostname, type ContainerRelease, type ContainerSecrets } from "./schema";
import { readBody, unixRequest } from "./unix-http";

const dockerApi = "/v1.44";
const ownerLabel = "io.selflify.container-network";
const releaseLabel = "io.selflify.release";
const volumeLabel = "io.selflify.storage-site";

export function createDockerRuntime(
  socket: string,
  network: string,
  assertDiskBudget: () => Promise<void> = async () => {},
) {
  async function request(
    path: string,
    method = "GET",
    body?: unknown,
    ignoreMissing = false,
    timeout?: number,
  ): Promise<string | null> {
    const response = await unixRequest(socket, dockerApi + path, { method, body, timeout });
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

  async function inspect(id: string) {
    const data = await request(`/containers/${containerHostname(id)}/json`, "GET", undefined, true);
    if (data === null) return null;
    const container = JSON.parse(data) as {
      Id: string;
      Config?: { Labels?: Record<string, string> };
      State?: { Running?: boolean };
    };
    if (
      container.Config?.Labels?.[ownerLabel] !== network ||
      container.Config.Labels[releaseLabel] !== id
    ) {
      throw new ContainerError(404, "Container release not found.");
    }
    return container;
  }

  async function check(release: ContainerRelease) {
    const name = containerHostname(release.id);
    if (!(await inspect(release.id))?.State?.Running) {
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

  async function removeUnusedImage(id: string) {
    const response = await unixRequest(socket, `${dockerApi}/images/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    const status = response.statusCode ?? 500;
    await readBody(response, 4 * 1024 * 1024);
    // Docker refuses to delete an image still referenced by another container/tag.
    if (status !== 404 && status !== 409 && status >= 400) {
      throw new ContainerError(502, "Could not remove the retired container image.");
    }
  }

  function mountsFor(release: ContainerRelease) {
    if (!release.storage) return [];
    const { siteId, volumes } = release.storage;
    const namespace = createHash("sha256")
      .update(network + ":" + siteId)
      .digest("hex");
    return volumes.map(({ name, path }) => ({
      Type: "volume",
      Source: `selflify-${namespace}-${name}`,
      Target: path,
      VolumeOptions: { Labels: { [ownerLabel]: network, [volumeLabel]: siteId } },
    }));
  }

  async function stopContainer(id: string) {
    await request(
      `/containers/${encodeURIComponent(id)}/stop?t=30`,
      "POST",
      undefined,
      true,
      40_000,
    );
  }

  return {
    check,
    async stop(id: string) {
      const container = await inspect(id);
      if (container) await stopContainer(container.Id);
    },
    async activate(release: ContainerRelease, replaceId?: string) {
      const target = await inspect(release.id);
      if (!target) throw new ContainerError(404, "Container release not found.");

      const replace = replaceId && replaceId !== release.id ? await inspect(replaceId) : null;
      const toStop = new Set<string>(replace ? [replace.Id] : []);
      const volumes = mountsFor(release).map(({ Source }) => Source);
      if (volumes.length) {
        const query = new URLSearchParams({ filters: JSON.stringify({ volume: volumes }) });
        const holders = JSON.parse((await request(`/containers/json?${query}`))!) as Array<{
          Id: string;
          Labels: Record<string, string>;
        }>;
        for (const holder of holders) {
          if (holder.Id === target.Id) continue;
          if (holder.Labels[ownerLabel] !== network || !holder.Labels[releaseLabel]) {
            throw new ContainerError(409, "A persistent volume is in use by another container.");
          }
          toStop.add(holder.Id);
        }
      }

      const stops = await Promise.allSettled([...toStop].map(stopContainer));
      for (const stop of stops) {
        if (stop.status === "rejected") throw stop.reason;
      }
      if (!target.State?.Running) await request(`/containers/${target.Id}/start`, "POST");
    },
    async prepare(release: ContainerRelease, secrets: ContainerSecrets, staged = false) {
      await assertDiskBudget();
      await pull(release.image, secrets.registry);
      const image = JSON.parse(
        (await request(`/images/${encodeURIComponent(release.image)}/json`))!,
      ) as {
        Id: string;
        Config?: { Volumes?: Record<string, unknown> };
      };
      try {
        await assertDiskBudget();
      } catch (error) {
        await removeUnusedImage(image.Id).catch(() => {});
        throw error;
      }
      const mounts = mountsFor(release);
      const mountPaths = new Set(mounts.map(({ Target }) => Target));
      const unmapped = Object.keys(image.Config?.Volumes ?? {}).filter(
        (path) => !mountPaths.has(path),
      );
      if (unmapped.length) {
        throw new ContainerError(
          422,
          `Configure persistent volume mounts for these image paths: ${unmapped.join(", ")}.`,
        );
      }
      // Let Docker initialize a new volume from the image. Once it exists,
      // staging must leave it alone even if the active release emptied it.
      const persistentMounts = await Promise.all(
        mounts.map(async (mount) => {
          const existing = await request(`/volumes/${mount.Source}`, "GET", undefined, true);
          return { ...mount, VolumeOptions: { ...mount.VolumeOptions, NoCopy: existing !== null } };
        }),
      );

      const name = containerHostname(release.id);
      const env = { ...secrets.env, PORT: String(release.port) };
      const created = JSON.parse(
        (await request(`/containers/create?name=${name}`, "POST", {
          Image: image.Id,
          Env: Object.entries(env).map(([key, value]) => `${key}=${value}`),
          Labels: { [ownerLabel]: network, [releaseLabel]: release.id },
          HostConfig: {
            Mounts: persistentMounts,
            NetworkMode: network,
            Sysctls: { "net.mptcp.enabled": "0" },
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
      if (staged) return;
      try {
        await request(`/containers/${created.Id}/start`, "POST");
        await check(release);
      } catch (error) {
        await remove(created.Id).catch(() => {});
        await removeUnusedImage(image.Id).catch(() => {});
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
        ImageID: string;
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
          if (container.ImageID) await removeUnusedImage(container.ImageID);
        }
      }
    },
  };
}
