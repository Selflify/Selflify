import { copyFile, mkdir, access } from "node:fs/promises";
import path from "node:path";

const devRoot = path.resolve(".dev");

const seededFiles = [
  {
    source: path.join(devRoot, "Caddyfile.example"),
    target: path.join(devRoot, "Caddyfile"),
  },
  {
    source: path.join(devRoot, "selflify.config.example.json"),
    target: path.join(devRoot, "selflify.config.json"),
  },
];

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  await mkdir(devRoot, { recursive: true });
  await mkdir(path.join(devRoot, "caddy-data"), { recursive: true });
  await mkdir(path.join(devRoot, "caddy-config"), { recursive: true });
  await mkdir(path.join(devRoot, "logs"), { recursive: true });
  await mkdir(path.join(devRoot, "var-www"), { recursive: true });

  for (const file of seededFiles) {
    if (await fileExists(file.target)) {
      continue;
    }

    await copyFile(file.source, file.target);
  }
}

await main();
