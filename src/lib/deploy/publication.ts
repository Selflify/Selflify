import fs from "node:fs/promises";
import path from "node:path";

import { DeployError } from "@/lib/deploy/archive";

// Walk only real directories. Client archives cannot create links, but legacy
// SSH uploads may already contain them, including at the site/deploy root.
export async function ensureRealDirectory(dir: string): Promise<void> {
  const absolute = path.resolve(dir);
  let current = path.parse(absolute).root;
  for (const segment of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    await fs.mkdir(current, { mode: 0o775 }).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") throw error;
    });
    const stats = await fs.lstat(current);
    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      throw new DeployError(409, "Deployment path contains a link or a non-directory.");
    }
  }
}

export async function publishBuild(
  root: string,
  slug: string,
  deploy: string,
  id: string,
  build: string,
): Promise<void> {
  const deployDir = path.join(await fs.realpath(root), slug, deploy);
  const managed = path.join(deployDir, ".selflify");
  const releases = path.join(managed, "releases");
  await ensureRealDirectory(releases);
  const release = path.join(releases, id);
  // A retry after a crash can find the release already moved into place.
  const existing = await fs.lstat(release).catch(() => null);
  if (existing && (!existing.isDirectory() || existing.isSymbolicLink())) {
    throw new DeployError(409, "Release path is not a regular directory.");
  }
  if (!existing) await fs.rename(build, release);
  const link = path.join(managed, `current-${id}`);
  await fs.rm(link, { force: true });
  await fs.symlink(`releases/${id}`, link);
  await fs.rename(link, path.join(managed, "current"));
  const now = new Date();
  await fs.utimes(deployDir, now, now);
  await fs.utimes(path.dirname(deployDir), now, now);
}

export async function currentRelease(deployDir: string): Promise<string | null> {
  const managed = path.join(deployDir, ".selflify");
  const link = path.join(managed, "current");
  const target = await fs.readlink(link).catch(() => null);
  if (!target) return null;
  if (!/^releases\/[a-f0-9-]{36}$/.test(target))
    throw new Error("Invalid managed release pointer.");
  const dir = path.join(managed, target);
  const stats = await fs.lstat(dir);
  if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error("Invalid release directory.");
  return dir;
}

export async function pruneReleases(deployDir: string, now = Date.now()): Promise<void> {
  const current = await currentRelease(deployDir);
  if (!current) return;
  const releases = path.dirname(current);
  const entries = await fs.readdir(releases, { withFileTypes: true });
  const previous = [];
  for (const entry of entries) {
    const dir = path.join(releases, entry.name);
    if (!entry.isDirectory() || dir === current) continue;
    previous.push({ dir, time: (await fs.stat(dir)).mtimeMs });
  }
  // Keep the most recent previous release and all releases younger than a day.
  previous.sort((a, b) => b.time - a.time);
  for (const release of previous.slice(1)) {
    if (now - release.time > 86400_000) await fs.rm(release.dir, { recursive: true, force: true });
  }
}
