import http from "node:http";
import { z } from "zod";

import { createDockerRuntime } from "./docker";
import { ContainerError, prepareSchema, pruneSchema } from "./runner-contract";
import { containerReleaseSchema, releaseIdSchema } from "./schema";
import { readBody } from "./unix-http";

export function createContainerRunner(runtime: ReturnType<typeof createDockerRuntime>) {
  return http.createServer(async (req, res) => {
    const respond = (status: number, body: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify(body));
    };
    try {
      if (req.method !== "POST") return respond(405, { error: "Method not allowed." });
      const payload = JSON.parse(await readBody(req, 600_000));
      switch (req.url) {
        case "/prepare": {
          const { release, secrets } = prepareSchema.parse(payload);
          await runtime.prepare(release, secrets);
          break;
        }
        case "/check":
          await runtime.check(containerReleaseSchema.parse(payload));
          break;
        case "/logs": {
          const { id } = z.object({ id: releaseIdSchema }).parse(payload);
          return respond(200, { logs: await runtime.logs(id) });
        }
        case "/prune":
          await runtime.prune(pruneSchema.parse(payload).keep);
          break;
        default:
          return respond(404, { error: "Runner operation not found." });
      }
      respond(200, { ok: true });
    } catch (error) {
      if (error instanceof ContainerError) return respond(error.status, { error: error.message });
      if (error instanceof z.ZodError || error instanceof SyntaxError) {
        return respond(400, { error: "Invalid runner request." });
      }
      respond(502, { error: "Could not communicate with the Docker runtime." });
    }
  });
}
