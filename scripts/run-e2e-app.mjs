import { chmod, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import http from "node:http";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const e2eRoot = path.join(rootDir, ".tmp", "playwright-runtime");
const fakeCaddyPath = path.join(e2eRoot, "fake-caddy.sh");

function createMockCloudflareServer() {
  const zoneId = "zone-e2e";
  const records = [];
  let nextRecordId = 1;

  function sendJson(response, statusCode, payload) {
    response.writeHead(statusCode, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    response.end(JSON.stringify(payload));
  }

  async function readJsonBody(request) {
    const chunks = [];

    for await (const chunk of request) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    const raw = Buffer.concat(chunks).toString("utf8").trim();
    return raw ? JSON.parse(raw) : {};
  }

  return http.createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);

    if (request.method === "GET" && url.pathname === "/client/v4/zones") {
      sendJson(response, 200, {
        success: true,
        result: [{ id: zoneId }],
      });
      return;
    }

    if (url.pathname === `/client/v4/zones/${zoneId}/dns_records`) {
      if (request.method === "GET") {
        const type = url.searchParams.get("type");
        const name = url.searchParams.get("name");

        const filteredRecords = records.filter((record) => {
          if (type && record.type !== type) {
            return false;
          }

          if (name && record.name !== name) {
            return false;
          }

          return true;
        });

        sendJson(response, 200, {
          success: true,
          result: filteredRecords,
        });
        return;
      }

      if (request.method === "POST") {
        const payload = await readJsonBody(request);
        const record = {
          id: `dns-${nextRecordId++}`,
          type: payload.type ?? "A",
          name: payload.name,
          content: payload.content,
          ttl: payload.ttl ?? 1,
          proxied: payload.proxied ?? false,
        };
        records.push(record);

        sendJson(response, 200, {
          success: true,
          result: record,
        });
        return;
      }
    }

    if (
      url.pathname.startsWith(`/client/v4/zones/${zoneId}/dns_records/`) &&
      /^\/client\/v4\/zones\/[^/]+\/dns_records\/[^/]+$/.test(url.pathname)
    ) {
      const recordId = url.pathname.split("/").at(-1);
      const recordIndex = records.findIndex((entry) => entry.id === recordId);

      if (recordIndex === -1) {
        sendJson(response, 404, {
          success: false,
          errors: [{ message: "DNS record not found." }],
          result: null,
        });
        return;
      }

      if (request.method === "PUT") {
        const payload = await readJsonBody(request);
        records[recordIndex] = {
          ...records[recordIndex],
          type: payload.type ?? records[recordIndex].type,
          name: payload.name ?? records[recordIndex].name,
          content: payload.content ?? records[recordIndex].content,
          ttl: payload.ttl ?? records[recordIndex].ttl,
          proxied: payload.proxied ?? records[recordIndex].proxied,
        };

        sendJson(response, 200, {
          success: true,
          result: records[recordIndex],
        });
        return;
      }

      if (request.method === "DELETE") {
        const [removed] = records.splice(recordIndex, 1);
        sendJson(response, 200, {
          success: true,
          result: removed,
        });
        return;
      }
    }

    sendJson(response, 404, {
      success: false,
      errors: [{ message: `Unhandled Cloudflare mock route: ${request.method} ${url.pathname}` }],
      result: null,
    });
  });
}

async function prepareRuntime() {
  await rm(e2eRoot, { recursive: true, force: true });
  await mkdir(path.join(e2eRoot, "backups"), { recursive: true });
  await mkdir(path.join(e2eRoot, "var-www"), { recursive: true });

  const fakeCaddyScript = `#!/bin/sh
cmd="$1"
shift

case "$cmd" in
  validate)
    config=""
    while [ "$#" -gt 0 ]; do
      case "$1" in
        --config)
          config="$2"
          shift 2
          ;;
        *)
          shift
          ;;
      esac
    done

    if [ -n "$config" ] && grep -q "dns cloudflare" "$config"; then
      token="$(grep "dns cloudflare" "$config" | head -n 1 | sed -E 's/.*dns cloudflare[[:space:]]+//')"
      if ! printf '%s' "$token" | grep -Eq '^(cf(ut|at)_[A-Za-z0-9_-]{32,}|[A-Za-z0-9_-]{35,50})$'; then
        printf '%s\\n' "Error: loading TLS automation management module: loading DNS provider module 'cloudflare': API token '$token' appears invalid; ensure it's correctly entered and not wrapped in braces nor quotes" >&2
        exit 1
      fi
    fi

    exit 0
    ;;
  hash-password)
    printf '%s\\n' "hashed-password"
    exit 0
    ;;
  reload)
    exit 0
    ;;
  *)
    exit 0
    ;;
esac
`;

  await writeFile(fakeCaddyPath, fakeCaddyScript, "utf8");
  await chmod(fakeCaddyPath, 0o755);
}

async function main() {
  await prepareRuntime();
  const cloudflareServer = createMockCloudflareServer();

  const cloudflareAddress = await new Promise((resolve, reject) => {
    cloudflareServer.once("error", reject);
    cloudflareServer.listen(0, "127.0.0.1", () => {
      cloudflareServer.off("error", reject);
      resolve(cloudflareServer.address());
    });
  });
  const cloudflarePort =
    typeof cloudflareAddress === "object" && cloudflareAddress ? cloudflareAddress.port : 4010;
  const mockCloudflareBaseUrl = `http://127.0.0.1:${cloudflarePort}/client/v4`;

  const child = spawn("yarn", ["dev", "--hostname", "127.0.0.1", "--port", "3201"], {
    cwd: rootDir,
    stdio: "inherit",
    env: {
      ...process.env,
      AUTH_SECRET: "selflify-e2e-auth-secret-0000000000000000",
      NEXT_TELEMETRY_DISABLED: "1",
      SELFLIFY_DEV_MODE: "0",
      SELFLIFY_MOCK_CLOUDFLARE: "0",
      SELFLIFY_SKIP_CADDY_RELOAD: "1",
      SELFLIFY_CLOUDFLARE_API_BASE_URL: mockCloudflareBaseUrl,
      SELFLIFY_CONFIG_PATH: path.join(e2eRoot, "selflify.config.json"),
      SELFLIFY_CADDY_CONFIG_PATH: path.join(e2eRoot, "Caddyfile"),
      SELFLIFY_CADDY_BIN: fakeCaddyPath,
      SELFLIFY_BACKUP_ROOT: path.join(e2eRoot, "backups"),
      SELFLIFY_PREVIEW_ROOT: path.join(e2eRoot, "var-www"),
      SELFLIFY_LOCK_PATH: path.join(e2eRoot, "selflify.lock"),
    },
  });

  const forwardSignal = (signal) => {
    if (!child.killed) {
      child.kill(signal);
    }
  };

  process.on("SIGINT", forwardSignal);
  process.on("SIGTERM", forwardSignal);

  child.on("exit", (code, signal) => {
    process.off("SIGINT", forwardSignal);
    process.off("SIGTERM", forwardSignal);
    cloudflareServer.close();

    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 0);
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
