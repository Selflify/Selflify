import { chmod, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const e2eRoot = path.join(rootDir, ".tmp", "playwright-runtime");
const fakeCaddyPath = path.join(e2eRoot, "fake-caddy.sh");

async function prepareRuntime() {
  await rm(e2eRoot, { recursive: true, force: true });
  await mkdir(path.join(e2eRoot, "backups"), { recursive: true });
  await mkdir(path.join(e2eRoot, "var-www"), { recursive: true });

  const fakeCaddyScript = `#!/bin/sh
cmd="$1"
shift

case "$cmd" in
  validate)
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

  const child = spawn("yarn", ["dev", "--hostname", "127.0.0.1", "--port", "3201"], {
    cwd: rootDir,
    stdio: "inherit",
    env: {
      ...process.env,
      AUTH_SECRET: "selflify-e2e-auth-secret-0000000000000000",
      NEXT_TELEMETRY_DISABLED: "1",
      SELFLIFY_DEV_MODE: "0",
      SELFLIFY_MOCK_CLOUDFLARE: "1",
      SELFLIFY_SKIP_CADDY_RELOAD: "1",
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
