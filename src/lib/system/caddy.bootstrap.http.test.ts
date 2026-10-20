import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createDefaultConfig } from "@/lib/config/service";
import { generateCaddyfile } from "@/lib/system/caddy";

const exec = promisify(execFile);

describe.skipIf(process.env.SELFLIFY_TEST_CADDY_HTTP !== "1")(
  "fresh production Caddy routing",
  () => {
    let tempDir: string;
    let containerId: string;
    let origin: string;

    beforeAll(async () => {
      vi.stubEnv("SELFLIFY_DEV_MODE", "0");
      vi.stubEnv("SELFLIFY_MOCK_CLOUDFLARE", "1");
      const config = createDefaultConfig();
      config.server.serverIp = "203.0.113.10";
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "selflify-bootstrap-http-"));
      // Isolate the generated routing from Next.js and the shared admin socket.
      const rendered = generateCaddyfile(config)
        .replace(/    admin [^\n]+ \{\n[^}]+\}/, "    admin off")
        .replaceAll(
          `reverse_proxy ${config.server.selflifyUpstream}`,
          'respond "setup fixture" 200',
        );
      await fs.writeFile(path.join(tempDir, "Caddyfile"), rendered);
      const started = await exec("docker", [
        "run",
        "--rm",
        "-d",
        "-p",
        "127.0.0.1::80",
        "-v",
        `${tempDir}:/fixtures`,
        "caddy:2.10.2-alpine",
        "caddy",
        "run",
        "--config",
        "/fixtures/Caddyfile",
        "--adapter",
        "caddyfile",
      ]);
      containerId = started.stdout.trim();
      await vi.waitFor(
        async () => {
          const port = await exec("docker", ["port", containerId, "80/tcp"]);
          origin = `http://${port.stdout.trim()}`;
          await fetch(origin, { redirect: "manual", signal: AbortSignal.timeout(2000) });
        },
        { timeout: 30000, interval: 100 },
      );
    }, 45000);

    afterAll(async () => {
      if (containerId) await exec("docker", ["stop", "-t", "1", containerId]);
      if (tempDir) await fs.rm(tempDir, { recursive: true, force: true });
      vi.unstubAllEnvs();
    });

    it("serves setup over loopback HTTP even when the detected server IP is public", async () => {
      const response = await fetch(`${origin}/setup`, { redirect: "manual" });
      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
      expect(await response.text()).toBe("setup fixture");
    });
  },
);
