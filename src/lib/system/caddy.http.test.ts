import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { hashSync } from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createDefaultConfig } from "@/lib/config/service";
import { generateCaddyfile } from "@/lib/system/caddy";

const exec = promisify(execFile);

// Opt in to the real Docker-backed HTTP regression suite:
// SELFLIFY_TEST_CADDY_HTTP=1 yarn test:run src/lib/system/caddy.http.test.ts
describe.skipIf(process.env.SELFLIFY_TEST_CADDY_HTTP !== "1")(
  "generated Caddy HTTP routing",
  () => {
    let tempDir: string;
    let containerId: string | undefined;
    let origin: string;
    const password = "local-preview-test";
    const authorization = `Basic ${Buffer.from(`preview-user:${password}`).toString("base64")}`;
    const sha = "0123456789abcdef0123456789abcdef01234567";
    const markerPath = `/__preview_commit__/${sha}`;
    const hosts = [
      { host: "branch.app.example.test", directory: "app/branch", protected: false },
      { host: "app.example.test", directory: "app/stable", protected: false },
      { host: "alias.example.test", directory: "app/stable", protected: false },
      { host: "branch.private.example.test", directory: "private/branch", protected: true },
    ];

    function request(host: string, urlPath: string, authenticated = false) {
      return new Promise<Response>((resolve, reject) => {
        const req = http.get(
          `${origin}${urlPath}`,
          {
            headers: { Host: host, ...(authenticated ? { Authorization: authorization } : {}) },
            signal: AbortSignal.timeout(2000),
          },
          (response) => {
            const chunks: Buffer[] = [];
            response.on("data", (chunk: Buffer) => chunks.push(chunk));
            response.on("error", reject);
            response.on("end", () =>
              resolve(
                new Response(Buffer.concat(chunks), {
                  status: response.statusCode,
                  headers: response.headers as Record<string, string>,
                }),
              ),
            );
          },
        );
        req.on("error", reject);
      });
    }

    beforeAll(async () => {
      vi.stubEnv("SELFLIFY_DEV_MODE", "1");
      vi.stubEnv("SELFLIFY_MOCK_CLOUDFLARE", "1");
      vi.stubEnv("SELFLIFY_PREVIEW_ROOT", "/fixtures/sites");
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "selflify-caddy-http-"));
      for (const directory of new Set(hosts.map((host) => host.directory))) {
        const root = path.join(tempDir, "sites", directory);
        await fs.mkdir(path.join(root, "__preview_commit__"), { recursive: true });
        await fs.writeFile(path.join(root, "index.html"), `old build: ${directory}`);
      }
      const config = createDefaultConfig();
      config.server.domain = "example.test";
      config.server.serverIp = "";
      config.server.cloudflareApiToken = "";
      config.sites = ["app", "private"].map((slug) => ({
        slug,
        name: slug,
        mainBranch: "stable",
        stableAlias: slug === "app" ? "alias.example.test" : null,
        stableAliasAutoTls: true,
        stableAliasUseCloudflare: false,
        previewAuth: {
          enabled: slug === "private",
          login: "preview-user",
          passwordHash: hashSync(password, 4),
        },
        createdAt: "2026-10-13T00:00:00.000Z",
        updatedAt: "2026-10-13T00:00:00.000Z",
      }));
      // Only disable the admin listener. Host blocks and routing are generated unchanged;
      // HTTP dev mode prevents certificate issuance, and fixtures have no DNS token.
      const rendered = generateCaddyfile(config).replace(
        /    admin [^\n]+ \{\n[^}]+\}/,
        "    admin off",
      );
      await fs.writeFile(path.join(tempDir, "Caddyfile"), rendered);
      const started = await exec("docker", [
        "run",
        "--rm",
        "-d",
        "-p",
        "127.0.0.1::80",
        "-v",
        `${tempDir}:/fixtures:ro`,
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
          const port = await exec("docker", ["port", containerId!, "80/tcp"]);
          const address = port.stdout.trim();
          if (!/^127\.0\.0\.1:\d+$/.test(address)) {
            throw new Error(`Caddy HTTP port is not ready: ${address}`);
          }
          origin = `http://${address}`;
          if ((await request("app.example.test", "/")).status !== 200) {
            throw new Error("Caddy is not serving the stable fixture yet");
          }
        },
        { timeout: 10000, interval: 100 },
      );
    }, 30000);

    afterAll(async () => {
      if (containerId) await exec("docker", ["stop", "-t", "1", containerId]);
      if (tempDir) await fs.rm(tempDir, { recursive: true, force: true });
      vi.unstubAllEnvs();
    });

    it.each(hosts)(
      "waits for the exact SHA on $host",
      async ({ host, directory, protected: authenticated }) => {
        const marker = path.join(tempDir, "sites", directory, "__preview_commit__", sha);
        await fs.rm(marker, { force: true });
        const missing = await request(host, markerPath, authenticated);
        expect(missing.status).toBe(404);
        expect(missing.headers.get("cache-control")).toBe("no-store");
        expect(missing.headers.get("x-content-type-options")).toBe("nosniff");
        expect(await missing.text()).not.toContain("old build");

        await fs.writeFile(marker, "");
        const ready = await request(host, markerPath, authenticated);
        expect(ready.status).toBe(200);
        expect(ready.headers.get("cache-control")).toBe("no-store");
        expect(await ready.text()).toBe("");
        expect(ready.headers.get("x-content-type-options")).toBe("nosniff");

        const spa = await request(host, "/ordinary/spa/route", authenticated);
        expect(spa.status).toBe(200);
        expect(await spa.text()).toBe(`old build: ${directory}`);
      },
    );

    it("requires preview credentials for both missing and existing markers", async () => {
      const marker = path.join(tempDir, "sites/private/branch/__preview_commit__", sha);
      await fs.rm(marker, { force: true });
      const missing = await request("branch.private.example.test", markerPath);
      expect(missing.status).toBe(401);
      expect(missing.headers.get("cache-control")).toBe("no-store");
      await fs.writeFile(marker, "");
      const ready = await request("branch.private.example.test", markerPath);
      expect(ready.status).toBe(401);
      expect(ready.headers.get("cache-control")).toBe("no-store");
    });
  },
);
