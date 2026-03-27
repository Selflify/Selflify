import { cp, mkdir, rm, writeFile, chmod, copyFile } from "node:fs/promises";
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
  ".env.example",
  ".nvmrc",
  ".yarnrc.yml",
  "cleanup-previews.sh",
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

const configTemplate = {
  version: 1,
  configRevision: 0,
  updatedAt: "2026-03-26T18:00:00.000Z",
  sessionSecret: "__SELFLIFY_SESSION_SECRET__",
  admin: {
    login: "",
    passwordHash: "",
    configuredAt: null,
  },
  server: {
    domain: "__SELFLIFY_DOMAIN__",
    serverIp: "__SELFLIFY_SERVER_IP__",
    cloudflareApiToken: "",
    previewRootDir: "/var/www",
    orphanedRootDir: "/var/www/.orphaned-sites",
    caddyConfigPath: "./Caddyfile",
    caddyBinaryPath: "caddy",
    caddyAdminAddress: "http://caddy:2019",
    selflifyUpstream: "selflify:3000",
    caddyContactEmail: "__SELFLIFY_CADDY_EMAIL__",
  },
  operations: {
    lastOperationId: null,
    lastOperationLabel: null,
    lastStatus: "idle",
    lastMessage: null,
    lastAppliedAt: null,
  },
  sites: [],
};

const caddyTemplate = `{
    admin 0.0.0.0:2019
    email __SELFLIFY_CADDY_EMAIL__
}

(common_headers) {
    header {
        X-Robots-Tag "noindex, nofollow, noarchive, nosnippet, noimageindex"
        Referrer-Policy "strict-origin-when-cross-origin"
        X-Content-Type-Options "nosniff"
    }
}

(static_cache) {
    @static {
        path *.js *.mjs *.css *.map *.png *.jpg *.jpeg *.gif *.svg *.webp *.ico *.woff *.woff2 *.ttf *.eot
    }
    header @static Cache-Control "public, max-age=31536000, immutable"

    @html {
        path *.html /
    }
    header @html Cache-Control "no-store, no-cache, must-revalidate"
}

(common_site) {
    import common_headers
    import static_cache

    encode gzip zstd
}

__SELFLIFY_DOMAIN__ {
    import common_site

    reverse_proxy selflify:3000
}
`;

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
  await mkdir(path.join(bundleDir, "bootstrap"), { recursive: true });

  for (const entry of bundleEntries) {
    await copyEntry(entry);
  }

  await pruneBundleTests(path.join(bundleDir, "src"));

  await writeFile(
    path.join(bundleDir, "bootstrap", "selflify.config.template.json"),
    `${JSON.stringify(configTemplate, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    path.join(bundleDir, "bootstrap", "Caddyfile.template"),
    caddyTemplate,
    "utf8",
  );

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
