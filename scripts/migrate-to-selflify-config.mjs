import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const sourcePath = path.join(root, "sites.json");
const targetPath = path.join(root, "selflify.config.json");
const force = process.argv.includes("--force");

function now() {
  return new Date().toISOString();
}

function slugToLabel(slug) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

const raw = await fs.readFile(sourcePath, "utf8");
const legacy = JSON.parse(raw);

try {
  if (!force) {
    await fs.access(targetPath);
    console.error("selflify.config.json already exists. Use --force to overwrite it.");
    process.exit(1);
  }
} catch {
  // missing target is expected
}

const timestamp = now();
const previewRootDir = legacy.sites?.root?.dir ?? "/var/www";

const migrated = {
  version: 1,
  configRevision: 0,
  updatedAt: timestamp,
  sessionSecret: "change-me-before-production-selflify-session-secret",
  admin: {
    login: "",
    passwordHash: "",
    configuredAt: null,
  },
  server: {
    domain: legacy.domain ?? "sendsay.dev",
    serverIp: "",
    cloudflareApiToken: "",
    previewRootDir,
    orphanedRootDir: path.posix.join(previewRootDir, ".orphaned-sites"),
    caddyConfigPath: "./Caddyfile",
    caddyBinaryPath: "caddy",
    caddyAdminAddress: "http://caddy:2019",
    selflifyUpstream: "selflify:3000",
    caddyContactEmail: `dev@${legacy.domain ?? "sendsay.dev"}`,
  },
  operations: {
    lastOperationId: null,
    lastOperationLabel: null,
    lastStatus: "idle",
    lastMessage: null,
    lastAppliedAt: null,
  },
  sites: Object.entries(legacy.sites ?? {})
    .filter(([slug]) => slug !== "root")
    .map(([slug, site]) => ({
      slug,
      name: slugToLabel(slug),
      mainBranch: site.main_branch ?? "stable",
      previewAuth:
        site.login && site.password_hash
          ? {
              enabled: true,
              login: site.login,
              passwordHash: site.password_hash,
            }
          : {
              enabled: false,
              login: null,
              passwordHash: null,
            },
      createdAt: timestamp,
      updatedAt: timestamp,
    })),
};

await fs.writeFile(targetPath, `${JSON.stringify(migrated, null, 2)}\n`, {
  encoding: "utf8",
  mode: 0o600,
});

console.log(`Migrated ${sourcePath} -> ${targetPath}`);
