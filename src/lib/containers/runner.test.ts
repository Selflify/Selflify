import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { describe, expect, it, vi } from "vitest";
import { createContainerRunner } from "./runner";

describe("runner mutation concurrency", () => {
  it("does not pull two images or remove images during a publication, and releases its slot", async () => {
    let complete!: () => void;
    let started!: () => void;
    const pending = new Promise<void>((resolve) => {
      complete = resolve;
    });
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const runtime = {
      prepare: vi.fn(async () => {
        started();
        await pending;
      }),
      activate: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
      check: vi.fn(async () => {}),
      logs: vi.fn(async () => ""),
      prune: vi.fn(async () => {}),
    };
    const server = createContainerRunner(runtime);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const payload = {
      release: {
        id: "364ba140-a198-4132-b02b-6f5456ff2e4a",
        image: `example.test/app@sha256:${"a".repeat(64)}`,
        port: 3000,
        healthPath: "/",
        publishedAt: "2026-11-17T00:00:00Z",
      },
      secrets: { env: {} },
    };
    const call = (path: string, body: unknown) =>
      fetch(url + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    try {
      const first = call("/prepare", payload);
      await ready;
      expect((await call("/prepare", payload)).status).toBe(429);
      expect((await call("/prune", { keep: [] })).status).toBe(429);
      expect((await call("/stage", payload)).status).toBe(429);
      expect(runtime.prepare).toHaveBeenCalledTimes(1);
      expect(runtime.prune).not.toHaveBeenCalled();
      complete();
      expect((await first).status).toBe(200);
      expect((await call("/stage", payload)).status).toBe(200);
      expect(runtime.prepare).toHaveBeenLastCalledWith(payload.release, payload.secrets, true);
      expect((await call("/prune", { keep: [] })).status).toBe(200);
    } finally {
      complete();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});
