import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import tar from "tar-stream";

export class DeployError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const ARCHIVE_LIMITS = {
  compressed: 128 * 1024 * 1024,
  expanded: 512 * 1024 * 1024,
  files: 20_000,
  path: 512,
};

export function byteLimit(max: number, onChunk?: (chunk: Buffer) => void): Transform {
  let bytes = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > max) return callback(new DeployError(413, "Upload exceeds the size limit."));
      onChunk?.(chunk);
      callback(null, chunk);
    },
  });
}

export async function extractBuild(
  archive: string,
  destination: string,
  signal?: AbortSignal,
): Promise<void> {
  await fsp.mkdir(destination, { recursive: true, mode: 0o755 });
  const extractor = tar.extract();
  const paths = new Set<string>();
  let entries = 0;
  let bytes = 0;
  extractor.on("entry", (header, stream, next) => {
    const extractEntry = async () => {
      const name = header.name.replace(/\/$/, "");
      const segments = name.split("/");
      if (
        !name ||
        name.length > ARCHIVE_LIMITS.path ||
        name.includes("\\") ||
        segments.some((part) => !part || part === "." || part === ".." || part === ".selflify") ||
        /[\x00-\x1f\x7f:]/.test(name) ||
        paths.has(name)
      ) {
        throw new DeployError(422, "Archive contains an unsafe or duplicate path.");
      }
      if (header.type !== "file" && header.type !== "directory") {
        throw new DeployError(422, "Archive may contain only regular files and directories.");
      }
      if (
        ++entries > ARCHIVE_LIMITS.files ||
        !Number.isSafeInteger(header.size) ||
        (header.size ?? 0) < 0
      ) {
        throw new DeployError(413, "Archive contains too many files or an invalid size.");
      }
      if (header.type === "directory" && header.size !== 0) {
        throw new DeployError(422, "Directory entries must be empty.");
      }
      bytes += header.size ?? 0;
      if (bytes > ARCHIVE_LIMITS.expanded)
        throw new DeployError(413, "Expanded build exceeds the size limit.");
      paths.add(name);
      const target = path.resolve(destination, name);
      if (!target.startsWith(`${path.resolve(destination)}${path.sep}`)) {
        throw new DeployError(422, "Archive path is outside the build root.");
      }
      if (header.type === "directory") {
        await fsp.mkdir(target, { recursive: true, mode: 0o755 });
        for await (const _chunk of stream) {
          void _chunk;
        }
      } else {
        await fsp.mkdir(path.dirname(target), { recursive: true, mode: 0o755 });
        await pipeline(stream, fs.createWriteStream(target, { flags: "wx", mode: 0o644 }));
      }
    };
    extractEntry().then(
      () => next(),
      (error: Error) => next(error),
    );
  });
  // Bound all decompressed bytes, including tar headers and padding.
  await pipeline(
    fs.createReadStream(archive),
    createGunzip(),
    byteLimit(ARCHIVE_LIMITS.expanded + ARCHIVE_LIMITS.files * 1024),
    extractor,
    { signal },
  );
  const index = await fsp.stat(path.join(destination, "index.html")).catch(() => null);
  if (!index?.isFile()) throw new DeployError(422, "Build must contain index.html at its root.");
}
