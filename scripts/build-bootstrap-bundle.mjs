import { cp, mkdir, rm, chmod, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist", "bootstrap");
const bundleName = "selflify-bootstrap";
const bundleDir = path.join(distDir, bundleName);
const archivePath = path.join(distDir, `${bundleName}.tar.gz`);

const bundleEntries = [
  ".dockerignore",
  ".yarnrc.yml",
  "bootstrap",
  "docker",
  "docker-compose.yml",
  "next-env.d.ts",
  "next.config.ts",
  "package.json",
  "public",
  "src",
  "tsconfig.json",
  "yarn.lock",
];

async function copyEntry(relativePath) {
  const source = path.join(rootDir, relativePath);
  const target = path.join(bundleDir, relativePath);

  await cp(source, target, { recursive: true });
}

async function pruneBundleTests(dirPath) {
  const result = spawnSync(
    "find",
    [
      dirPath,
      "(",
      "-name",
      "*.test.ts",
      "-o",
      "-name",
      "*.test.tsx",
      "-o",
      "-path",
      "*/src/test",
      ")",
      "-print",
    ],
    { encoding: "utf8" },
  );

  if (result.status !== 0) {
    throw new Error("Could not inspect bootstrap bundle for test files.");
  }

  const targets = result.stdout
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);

  for (const target of targets.sort((left, right) => right.length - left.length)) {
    await rm(target, { recursive: true, force: true });
  }
}

async function main() {
  await rm(distDir, { recursive: true, force: true });
  await mkdir(bundleDir, { recursive: true });

  for (const entry of bundleEntries) {
    await copyEntry(entry);
  }

  await pruneBundleTests(path.join(bundleDir, "src"));
  await copyFile(
    path.join(rootDir, "scripts", "install-selflify.sh"),
    path.join(distDir, "install-selflify.sh"),
  );
  await chmod(path.join(distDir, "install-selflify.sh"), 0o755);

  const archive = spawnSync("tar", ["-czf", archivePath, "-C", distDir, bundleName], {
    stdio: "inherit",
  });

  if (archive.status !== 0) {
    throw new Error("Could not create bootstrap archive.");
  }

  console.log(`Bootstrap archive: ${archivePath}`);
  console.log(`Installer script: ${path.join(distDir, "install-selflify.sh")}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
