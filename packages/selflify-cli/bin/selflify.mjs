#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import { fileURLToPath } from "node:url";
import tar from "tar-stream";

export async function packBuild(directory, archive) {
  const root = await fsp.realpath(directory);
  if (!(await fsp.stat(path.join(root, "index.html"))).isFile())
    throw new Error("Build must contain index.html at its root.");
  const pack = tar.pack();
  const output = pipeline(
    pack,
    createGzip(),
    fs.createWriteStream(archive, { flags: "wx", mode: 0o600 }),
  );
  // Attach a rejection handler immediately, even while walking the directory.
  output.catch(() => {});
  let count = 0;
  let bytes = 0;
  async function walk(relative = "") {
    const entries = await fsp.readdir(path.join(root, relative), { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.name === ".selflify" || /[\\\x00-\x1f\x7f:]/.test(name) || name.length > 512)
        throw new Error("Build contains a reserved or unsafe path.");
      if (++count > 20_000) throw new Error("Build contains too many files.");
      if (entry.isDirectory()) {
        await walk(name);
        continue;
      }
      if (!entry.isFile()) throw new Error("Build may contain only regular files and directories.");
      const full = path.join(root, name);
      // Open without following links to catch a file replaced after readdir.
      const handle = await fsp.open(full, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
      try {
        const stat = await handle.stat();
        if (!stat.isFile()) throw new Error("Build contains a non-file.");
        bytes += stat.size;
        if (bytes > 512 * 1024 * 1024) throw new Error("Build exceeds the expanded size limit.");
        await pipeline(
          handle.createReadStream({ autoClose: false }),
          pack.entry({ name, size: stat.size, mode: 0o644, mtime: new Date(0) }),
        );
      } finally {
        await handle.close();
      }
    }
  }
  try {
    await walk();
    pack.finalize();
    await output;
  } catch (error) {
    pack.destroy(error);
    await output.catch(() => {});
    throw error;
  }
  const size = (await fsp.stat(archive)).size;
  if (size > 128 * 1024 * 1024) throw new Error("Archive exceeds the upload size limit.");
  const hash = crypto.createHash("sha256");
  for await (const chunk of fs.createReadStream(archive)) hash.update(chunk);
  return { size, sha256: hash.digest("hex") };
}

export function serverUrl(value, allowLocalHttp = false) {
  const url = new URL(value);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(allowLocalHttp && local && url.protocol === "http:")) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  ) {
    throw new Error("Server must be an HTTPS origin. Local HTTP requires --allow-local-http.");
  }
  return url.origin;
}

export async function deploy({
  directory,
  server,
  token,
  site,
  deploy: name,
  key = crypto.randomUUID(),
  allowLocalHttp = false,
}) {
  const origin = serverUrl(server, allowLocalHttp);
  if (!/^slf_[a-f0-9-]{36}\.[A-Za-z0-9_-]{43}$/.test(token ?? ""))
    throw new Error("Set SELFLIFY_DEPLOY_TOKEN to a deploy token from the panel.");
  if (
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(site ?? "") ||
    !/^[a-z0-9](?:[a-z0-9-]{0,62})$/.test(name ?? "")
  )
    throw new Error("Supply valid --site and --deploy names.");
  const temp = await fsp.mkdtemp(path.join(os.tmpdir(), "selflify-cli-"));
  const archive = path.join(temp, "build.tar.gz");
  async function request(endpoint, method = "GET", bodyFactory, extra = {}) {
    for (let attempt = 0; attempt < 3; attempt++) {
      let response;
      const body = bodyFactory?.();
      try {
        response = await fetch(`${origin}/api/deploy/v1${endpoint}`, {
          method,
          headers: { Authorization: `Bearer ${token}`, ...extra },
          body,
          ...(body instanceof fs.ReadStream ? { duplex: "half" } : {}),
          redirect: "error",
          signal: AbortSignal.timeout(5 * 60_000),
        });
      } catch {
        body?.destroy?.();
        if (attempt === 2)
          throw new Error("Could not reach Selflify. Check the server address and connection.");
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
        continue;
      }
      if ([429, 502, 503, 504].includes(response.status) && attempt < 2) {
        await response.body?.cancel();
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
        continue;
      }
      const result = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(
          `Selflify returned ${response.status}: ${result?.error ?? "Request failed."}`,
        );
      return result;
    }
  }
  try {
    const metadata = await packBuild(directory, archive);
    let upload = await request(
      "/uploads",
      "POST",
      () => JSON.stringify({ site, deploy: name, ...metadata }),
      {
        "Content-Type": "application/json",
        "Idempotency-Key": key,
      },
    );
    if (upload.state === "created") {
      upload = await request(
        `/uploads/${upload.id}/content`,
        "PUT",
        () => fs.createReadStream(archive),
        {
          "Content-Type": "application/gzip",
          "Content-Length": String(metadata.size),
        },
      );
    }
    if (upload.state === "validated")
      upload = await request(`/uploads/${upload.id}/publish`, "POST");
    if (upload.state !== "published" || !upload.url)
      throw new Error(
        `Upload is ${upload.state}. Check its status before retrying with a new key.`,
      );
    return upload;
  } finally {
    await fsp.rm(temp, { recursive: true, force: true });
  }
}

async function main() {
  const { values, positionals } = parseArgs({
    options: {
      server: { type: "string" },
      site: { type: "string" },
      deploy: { type: "string" },
      "idempotency-key": { type: "string" },
      "allow-local-http": { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  });
  if (values.help) {
    console.log(
      "selflify deploy <directory> --server https://panel.example.com --site app --deploy pr-123\nSet SELFLIFY_DEPLOY_TOKEN in the environment. Optional: --idempotency-key <CI-job-key>.",
    );
    return;
  }
  if (positionals[0] !== "deploy" || positionals.length !== 2)
    throw new Error(
      "Usage: selflify deploy <directory> --site <site> --deploy <deploy> --server <HTTPS origin>",
    );
  const result = await deploy({
    directory: positionals[1],
    server: values.server ?? process.env.SELFLIFY_SERVER,
    token: process.env.SELFLIFY_DEPLOY_TOKEN,
    site: values.site,
    deploy: values.deploy,
    key: values["idempotency-key"],
    allowLocalHttp: values["allow-local-http"],
  });
  console.log(result.url);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
