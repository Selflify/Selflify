import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { z } from "zod";

import { deployTokenSchema, deployNamePattern, siteSlugPattern } from "@/lib/config/schema";
import { ARCHIVE_LIMITS, byteLimit, DeployError, extractBuild } from "@/lib/deploy/archive";
import { withDeployLock } from "@/lib/deploy/lock";
import {
  atomicJson,
  hashDeploySecret,
  tokenAllowsSite,
  type DeployPermissions,
} from "@/lib/deploy/permissions";
import { ensureRealDirectory, publishBuild } from "@/lib/deploy/publication";

const permissionSchema = z.object({
  version: z.literal(1),
  domain: z.string().min(1),
  previewRoot: z.string().min(1),
  sites: z.array(
    z.object({
      id: z.string(),
      slug: z.string().regex(siteSlugPattern),
      mainBranch: z.string().regex(deployNamePattern),
    }),
  ),
  tokens: z.array(deployTokenSchema),
});
const createSchema = z
  .object({
    site: z.string().regex(siteSlugPattern),
    deploy: z.string().regex(deployNamePattern),
    size: z.number().int().positive().max(ARCHIVE_LIMITS.compressed),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
type CreateInput = z.infer<typeof createSchema>;
type Upload = CreateInput & {
  id: string;
  tokenId: string;
  siteId: string;
  key: string;
  createdAt: string;
  state: "created" | "receiving" | "validated" | "publishing" | "published" | "failed" | "expired";
  publishedAt?: string;
  url?: string;
};
type ServerOptions = {
  root: string;
  state: string;
  permissions: string;
  logger?: (event: Record<string, unknown>) => void;
};
const UPLOAD_TTL = 30 * 60_000;
const MAX_PENDING = 4;

export async function createUploadServer(options: ServerOptions): Promise<http.Server> {
  const stageRoot = path.join(options.root, ".selflify-uploads");
  await fsp.mkdir(options.root, { recursive: true });
  await ensureRealDirectory(path.join(await fsp.realpath(options.root), ".selflify-uploads"));
  await fsp.chmod(stageRoot, 0o700);
  await fsp.mkdir(options.state, { recursive: true, mode: 0o700 });
  const busy = new Set<string>();
  const rate = new Map<string, { count: number; until: number }>();
  const log = options.logger ?? (() => {});
  const recordPath = (id: string) => path.join(options.state, `${id}.json`);
  const stage = (id: string) => path.join(stageRoot, id);
  const save = (upload: Upload) => atomicJson(recordPath(upload.id), upload);
  const markUsed = (tokenId: string) =>
    atomicJson(path.join(options.state, `usage-${tokenId}.json`), {
      lastUsedAt: new Date().toISOString(),
    });
  const read = async (id: string): Promise<Upload> => {
    const raw = await fsp.readFile(recordPath(id), "utf8").catch(() => null);
    if (!raw) throw new DeployError(404, "Upload not found.");
    return JSON.parse(raw) as Upload;
  };
  const records = async (): Promise<Upload[]> => {
    const names = (await fsp.readdir(options.state)).filter((name) =>
      /^[a-f0-9-]{36}\.json$/.test(name),
    );
    return Promise.all(names.map((name) => read(name.slice(0, -5))));
  };
  function limit(key: string, max: number) {
    const now = Date.now();
    for (const [id, item] of rate) if (item.until <= now) rate.delete(id);
    if (rate.size >= 10_000 && !rate.has(key)) throw new DeployError(429, "Too many requests.");
    const item = rate.get(key) ?? { count: 0, until: now + 60_000 };
    rate.set(key, item);
    if (++item.count > max) throw new DeployError(429, "Too many requests.");
  }
  function contentTicket(secretHash: string, id: string) {
    return crypto.createHmac("sha256", secretHash).update(`upload-content:${id}`).digest("hex");
  }
  async function authenticate(request: http.IncomingMessage) {
    const match = /^Bearer slf_([a-f0-9-]{36})\.([A-Za-z0-9_-]{43})$/.exec(
      request.headers.authorization ?? "",
    );
    const url = new URL(request.url ?? "/", "http://upload");
    const content =
      request.method === "PUT" && !request.headers.authorization
        ? /^\/api\/deploy\/v1\/uploads\/([a-f0-9-]{36})\/content$/.exec(url.pathname)
        : null;
    const ticket = url.searchParams.get("ticket");
    if (!match && !(content && ticket && /^[a-f0-9]{64}$/.test(ticket)))
      throw new DeployError(401, "Invalid deploy token.");
    let permissions: DeployPermissions;
    try {
      permissions = permissionSchema.parse(
        JSON.parse(await fsp.readFile(options.permissions, "utf8")),
      );
    } catch {
      throw new DeployError(503, "Deploy permissions are unavailable.");
    }
    if (path.resolve(permissions.previewRoot) !== path.resolve(options.root)) {
      throw new DeployError(503, "Deploy storage configuration does not match.");
    }
    const upload = content ? await read(content[1]) : undefined;
    const token = permissions.tokens.find((entry) => entry.id === (match?.[1] ?? upload?.tokenId));
    const supplied = Buffer.from(match ? hashDeploySecret(match[2]) : ticket!, "hex");
    const expected = Buffer.from(
      content
        ? contentTicket(token?.secretHash ?? "", content[1])
        : (token?.secretHash ?? "0".repeat(64)),
      "hex",
    );
    if (
      !crypto.timingSafeEqual(supplied, expected) ||
      !token ||
      token.revokedAt ||
      Date.parse(token.expiresAt) <= Date.now() ||
      (upload && Date.now() - Date.parse(upload.createdAt) > UPLOAD_TTL)
    ) {
      throw new DeployError(401, "Invalid deploy token.");
    }
    return { permissions, token };
  }
  function authorize(
    auth: Awaited<ReturnType<typeof authenticate>>,
    input: CreateInput,
    siteId?: string,
  ) {
    const site = auth.permissions.sites.find(
      (entry) => entry.slug === input.site && tokenAllowsSite(auth.token, entry.id),
    );
    if (!site || (siteId && site.id !== siteId))
      throw new DeployError(403, "Token cannot deploy to this site.");
    const scope = input.deploy === site.mainBranch ? "stable:write" : "preview:write";
    if (!auth.token.scopes.includes(scope))
      throw new DeployError(403, "Token cannot deploy to this environment.");
    return site;
  }
  async function owned(request: http.IncomingMessage, id: string) {
    const auth = await authenticate(request);
    const upload = await read(id);
    if (upload.tokenId !== auth.token.id) throw new DeployError(404, "Upload not found.");
    authorize(auth, upload, upload.siteId);
    return { auth, upload };
  }
  async function recoverPublications() {
    for (const upload of await records()) {
      if (upload.state !== "publishing") continue;
      const current = path.join(options.root, upload.site, upload.deploy, ".selflify", "current");
      const target = await fsp.readlink(current).catch(() => null);
      upload.state = target === `releases/${upload.id}` ? "published" : "failed";
      await save(upload);
    }
  }
  async function expire() {
    await recoverPublications();
    for (const upload of await records()) {
      if (busy.has(upload.id)) continue;
      const age = Date.now() - Date.parse(upload.createdAt);
      if (age > UPLOAD_TTL || upload.state === "failed" || upload.state === "expired") {
        await fsp.rm(stage(upload.id), { recursive: true, force: true });
        if (upload.state !== "published" && upload.state !== "failed") {
          upload.state = "expired";
          await save(upload);
        }
      }
      if (age > 7 * 86400_000) await fsp.rm(recordPath(upload.id), { force: true });
    }
  }
  // A process restart abandons partial transfers; a validated build can still
  // be published. Published pointers reconcile crashes before status persistence.
  await withDeployLock(async () => {
    for (const upload of await records()) {
      if (upload.state === "receiving") {
        upload.state = "failed";
        await save(upload);
      }
    }
    await expire();
  });
  function response(res: http.ServerResponse, status: number, body: unknown) {
    res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify(body));
  }
  function publicStatus(upload: Upload) {
    return { id: upload.id, state: upload.state, url: upload.url, publishedAt: upload.publishedAt };
  }
  async function handle(req: http.IncomingMessage, res: http.ServerResponse) {
    const pathname = new URL(req.url ?? "/", "http://upload").pathname;
    if (req.method === "GET" && pathname === "/health") return response(res, 200, { status: "ok" });
    // Use the socket address, never a caller-supplied forwarded header. Behind
    // Caddy this is a global unauthenticated request budget.
    limit(`ip:${req.socket.remoteAddress}`, 600);
    if (req.method === "POST" && pathname === "/api/deploy/v1/uploads") {
      const auth = await authenticate(req);
      limit(`token:${auth.token.id}`, 10);
      const chunks: Buffer[] = [];
      let bytes = 0;
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 4096) throw new DeployError(413, "Request is too large.");
        chunks.push(chunk);
      }
      let input: CreateInput;
      try {
        input = createSchema.parse(JSON.parse(Buffer.concat(chunks).toString()));
      } catch {
        throw new DeployError(400, "Invalid upload metadata.");
      }
      const key = req.headers["idempotency-key"];
      if (typeof key !== "string" || !/^[A-Za-z0-9_-]{16,128}$/.test(key))
        throw new DeployError(400, "Supply an idempotency key.");
      const upload = await withDeployLock(async () => {
        const fresh = await authenticate(req);
        const site = authorize(fresh, input);
        await expire();
        const all = await records();
        const existing = all.find((entry) => entry.tokenId === fresh.token.id && entry.key === key);
        if (existing) {
          if (
            existing.site !== input.site ||
            existing.deploy !== input.deploy ||
            existing.size !== input.size ||
            existing.sha256 !== input.sha256
          ) {
            throw new DeployError(409, "Idempotency key was used for a different build.");
          }
          return existing;
        }
        if (all.length >= 5000)
          throw new DeployError(
            429,
            "Deployment history is full. Retry after old upload records expire.",
          );
        if (
          all.filter((entry) => ["created", "receiving", "validated"].includes(entry.state))
            .length >= MAX_PENDING
        ) {
          throw new DeployError(
            429,
            "Too many pending uploads. Retry after an upload finishes or expires.",
          );
        }
        const disk = await fsp.statfs(options.root);
        if (
          disk.bavail * disk.bsize <
          MAX_PENDING * (ARCHIVE_LIMITS.expanded + ARCHIVE_LIMITS.compressed) + 128 * 1024 * 1024
        ) {
          throw new DeployError(507, "Insufficient free space for a deployment.");
        }
        const created: Upload = {
          ...input,
          id: crypto.randomUUID(),
          tokenId: fresh.token.id,
          siteId: site.id,
          key,
          createdAt: new Date().toISOString(),
          state: "created",
        };
        await save(created);
        await markUsed(fresh.token.id);
        log({
          event: "upload-created",
          uploadId: created.id,
          tokenId: created.tokenId,
          site: created.site,
          deploy: created.deploy,
        });
        return created;
      });
      return response(res, 201, {
        ...publicStatus(upload),
        contentTicket: contentTicket(auth.token.secretHash, upload.id),
        uploadExpiresAt: new Date(
          Math.min(Date.parse(upload.createdAt) + UPLOAD_TTL, Date.parse(auth.token.expiresAt)),
        ).toISOString(),
      });
    }
    const match = /^\/api\/deploy\/v1\/uploads\/([a-f0-9-]{36})(?:\/(content|publish))?$/.exec(
      pathname,
    );
    if (!match) throw new DeployError(404, "Endpoint not found.");
    const id = match[1];
    const { upload } = await owned(req, id);
    if (req.method === "GET" && !match[2]) {
      const status = await withDeployLock(async () => {
        await recoverPublications();
        return (await owned(req, id)).upload;
      });
      return response(res, 200, publicStatus(status));
    }
    if (req.method === "PUT" && match[2] === "content") {
      if (busy.has(id) || busy.size >= 2)
        throw new DeployError(409, "Another transfer is in progress. Retry later.");
      if (upload.state === "validated" || upload.state === "published")
        return response(res, 200, publicStatus(upload));
      if (upload.state !== "created" || Date.now() - Date.parse(upload.createdAt) > UPLOAD_TTL) {
        throw new DeployError(409, "Upload is no longer accepting content.");
      }
      if (Number(req.headers["content-length"]) !== upload.size)
        throw new DeployError(400, "Content length does not match the archive.");
      busy.add(id);
      try {
        upload.state = "receiving";
        await save(upload);
        await markUsed(upload.tokenId);
        await fsp.mkdir(stage(id), { mode: 0o700 });
        const archive = path.join(stage(id), "archive.tar.gz");
        const digest = crypto.createHash("sha256");
        const signal = AbortSignal.timeout(5 * 60_000);
        await pipeline(
          req,
          byteLimit(upload.size, (chunk) => digest.update(chunk)),
          fs.createWriteStream(archive, { flags: "wx", mode: 0o600 }),
          { signal },
        );
        if (
          (await fsp.stat(archive)).size !== upload.size ||
          digest.digest("hex") !== upload.sha256
        ) {
          throw new DeployError(422, "Archive checksum or size does not match.");
        }
        await extractBuild(archive, path.join(stage(id), "build"), signal);
        await fsp.rm(archive);
        // Revocation/expiry during a long transfer also prevents validation.
        await withDeployLock(async () => {
          await owned(req, id);
          upload.state = "validated";
          await save(upload);
        });
        return response(res, 200, publicStatus(upload));
      } catch (error) {
        upload.state = "failed";
        await save(upload);
        await fsp.rm(stage(id), { recursive: true, force: true });
        if (error instanceof DeployError) throw error;
        throw new DeployError(422, "Archive could not be received or validated.");
      } finally {
        busy.delete(id);
      }
    }
    if (req.method === "POST" && match[2] === "publish") {
      const result = await withDeployLock(async () => {
        await recoverPublications();
        const { auth, upload: fresh } = await owned(req, id);
        if (fresh.state === "published") return fresh;
        if (fresh.state !== "validated" || Date.now() - Date.parse(fresh.createdAt) > UPLOAD_TTL) {
          throw new DeployError(409, "Upload is not ready for publication.");
        }
        fresh.state = "publishing";
        fresh.publishedAt = new Date().toISOString();
        const site = authorize(auth, fresh, fresh.siteId);
        fresh.url = `https://${fresh.deploy === site.mainBranch ? "" : `${fresh.deploy}.`}${fresh.site}.${auth.permissions.domain}`;
        await save(fresh);
        await publishBuild(
          options.root,
          fresh.site,
          fresh.deploy,
          fresh.id,
          path.join(stage(id), "build"),
        );
        fresh.state = "published";
        await save(fresh);
        await markUsed(fresh.tokenId);
        await fsp.rm(stage(id), { recursive: true, force: true });
        log({
          event: "deploy-published",
          tokenId: fresh.tokenId,
          uploadId: id,
          site: fresh.site,
          deploy: fresh.deploy,
          publishedAt: fresh.publishedAt,
        });
        return fresh;
      });
      return response(res, 200, publicStatus(result));
    }
    throw new DeployError(405, "Method not allowed.");
  }
  const server = http.createServer((req, res) => {
    handle(req, res).catch((error: unknown) => {
      const known = error instanceof DeployError;
      log({ event: "deploy-request-failed", status: known ? error.status : 500 });
      if (!res.destroyed && !res.headersSent)
        response(res, known ? error.status : 500, {
          error: known ? error.message : "Deployment request failed.",
        });
    });
  });
  server.requestTimeout = 5 * 60_000;
  server.headersTimeout = 15_000;
  server.timeout = 5 * 60_000;
  const janitor = setInterval(() => {
    withDeployLock(expire).catch(() => log({ event: "upload-cleanup-failed" }));
  }, 60_000);
  janitor.unref();
  server.on("close", () => clearInterval(janitor));
  return server;
}
