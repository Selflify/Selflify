import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDockerRuntime } from "./docker";
import { unixRequest } from "./unix-http";
vi.mock("./unix-http", async (original) => ({
  ...(await original<typeof import("./unix-http")>()),
  unixRequest: vi.fn(),
}));
describe("container network policy", () => {
  beforeEach(() => {
    vi.mocked(unixRequest).mockReset();
  });
  it("pins MPTCP off on the Docker create request while preserving deployment", async () => {
    const id = "364ba140-a198-4132-b02b-6f5456ff2e4a";
    vi.mocked(unixRequest).mockImplementation(async (_socket, path) => {
      const body = path.includes("images/create")
        ? "{}\n"
        : path.includes("/images/")
          ? JSON.stringify({ Id: "sha256:image" })
          : path.includes("/containers/create")
            ? JSON.stringify({ Id: "container" })
            : path.endsWith("/json")
              ? JSON.stringify({
                  Config: {
                    Labels: { "io.selflify.container-network": "sites", "io.selflify.release": id },
                  },
                  State: { Running: true },
                })
              : "";
      return Object.assign(Readable.from([Buffer.from(body)]), { statusCode: 200 }) as Awaited<
        ReturnType<typeof unixRequest>
      >;
    });
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("OK"));
    try {
      await createDockerRuntime("socket", "sites").prepare(
        {
          id,
          image: `example.test/app@sha256:${"a".repeat(64)}`,
          port: 3000,
          healthPath: "/health",
          publishedAt: "2026-11-17T00:00:00Z",
        },
        { env: { EXAMPLE: "value" } },
      );
      const created = vi
        .mocked(unixRequest)
        .mock.calls.find((call) => call[1].includes("/containers/create"));
      expect(created?.[2].body).toMatchObject({
        Env: ["EXAMPLE=value", "PORT=3000"],
        Labels: { "io.selflify.image-reference": `example.test/app@sha256:${"a".repeat(64)}` },
        HostConfig: {
          NetworkMode: "sites",
          Sysctls: { "net.mptcp.enabled": "0" },
          CapDrop: ["ALL"],
        },
      });
      expect(fetch).toHaveBeenCalledWith(
        `http://selflify-release-${id}:3000/health`,
        expect.any(Object),
      );
    } finally {
      fetch.mockRestore();
    }
  });
  it("rejects a publication before pulling when the disk reserve is exhausted", async () => {
    const budget = vi.fn().mockRejectedValue(new Error("disk full"));
    await expect(
      createDockerRuntime("socket", "sites", budget).prepare(
        { id: "id", image: "image", port: 3000, healthPath: "/", publishedAt: "now" },
        { env: {} },
      ),
    ).rejects.toThrow("disk full");
    expect(unixRequest).not.toHaveBeenCalled();
  });

  it.each(["classic", "containerd"])(
    "prunes retired releases on %s storage safely",
    async (store) => {
      const old = Math.floor(Date.now() / 1000) - 3600;
      const reference = (digit: string) => `example.test/app@sha256:${digit.repeat(64)}`;
      const container = (release: string, image: string, digest?: string) => ({
        Id: `${release}-container`,
        ImageID: image,
        Created: old,
        Labels: {
          "io.selflify.release": release,
          ...(digest ? { "io.selflify.image-reference": digest } : {}),
        },
      });
      const releases = [
        container("active", "active-image", reference("a")),
        container("previous", "previous-image", reference("b")),
        container("retired-shared", "shared-image", reference("c")),
        container("retired", "retired-image", reference("d")),
        container("legacy", "legacy-image"),
      ];
      vi.mocked(unixRequest).mockImplementation(async (_socket, path) => {
        const filters = new URLSearchParams(path.split("?")[1]).get("filters");
        const body = path.endsWith("/info")
          ? JSON.stringify({
              DockerRootDir: "/var/lib/docker",
              DriverStatus:
                store === "containerd" ? [["driver-type", "io.containerd.snapshotter.v1"]] : [],
            })
          : filters?.includes("ancestor")
            ? JSON.stringify(filters.includes("shared-image") ? [{ Id: "other-project" }] : [])
            : filters
              ? JSON.stringify(releases)
              : "";
        return Object.assign(Readable.from([Buffer.from(body)]), { statusCode: 200 }) as Awaited<
          ReturnType<typeof unixRequest>
        >;
      });
      await createDockerRuntime("socket", "sites").prune(["active", "previous"]);
      const deletions = vi
        .mocked(unixRequest)
        .mock.calls.filter((call) => call[2].method === "DELETE")
        .map((call) => call[1]);
      expect(deletions).toEqual([
        "/v1.44/containers/retired-shared-container?force=true&v=true",
        "/v1.44/containers/retired-container?force=true&v=true",
        ...(store === "classic"
          ? [`/v1.44/images/${encodeURIComponent(reference("d"))}?noprune=true`]
          : []),
        "/v1.44/containers/legacy-container?force=true&v=true",
      ]);
    },
  );
});
