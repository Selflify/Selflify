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

  it("removes only retired owned images and tolerates an image shared by active containers", async () => {
    const old = Math.floor(Date.now() / 1000) - 3600;
    vi.mocked(unixRequest).mockImplementation(async (_socket, path) => {
      const items = [
        {
          Id: "active-container",
          ImageID: "active-image",
          Created: old,
          Labels: { "io.selflify.release": "active" },
        },
        {
          Id: "previous-container",
          ImageID: "previous-image",
          Created: old,
          Labels: { "io.selflify.release": "previous" },
        },
        {
          Id: "retired-container",
          ImageID: "shared-image",
          Created: old,
          Labels: { "io.selflify.release": "retired" },
        },
      ];
      return Object.assign(
        Readable.from([
          Buffer.from(path.includes("/containers/json?") ? JSON.stringify(items) : ""),
        ]),
        { statusCode: path.includes("/images/") ? 409 : 200 },
      ) as Awaited<ReturnType<typeof unixRequest>>;
    });
    await createDockerRuntime("socket", "sites").prune(["active", "previous"]);
    const deletions = vi
      .mocked(unixRequest)
      .mock.calls.filter((call) => call[2].method === "DELETE")
      .map((call) => call[1]);
    expect(deletions).toEqual([
      "/v1.44/containers/retired-container?force=true&v=true",
      "/v1.44/images/shared-image",
    ]);
  });
});
