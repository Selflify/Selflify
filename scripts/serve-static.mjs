import http from "node:http";
import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import path from "node:path";

const directory = path.resolve(process.argv[2] ?? "landing");
const port = Number(process.argv[3] ?? process.env.PORT ?? 4173);

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "application/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".ico", "image/x-icon"],
]);

function contentType(filePath) {
  return contentTypes.get(path.extname(filePath).toLowerCase()) ?? "application/octet-stream";
}

async function resolveFile(urlPath) {
  const safePath = path.normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, "");
  const candidate = path.join(directory, safePath === "/" ? "index.html" : safePath);
  const relative = path.relative(directory, candidate);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }

  try {
    const info = await stat(candidate);

    if (info.isDirectory()) {
      const nestedIndex = path.join(candidate, "index.html");
      await access(nestedIndex);
      return nestedIndex;
    }

    return candidate;
  } catch {
    try {
      const fallback = path.join(directory, "index.html");
      await access(fallback);
      return fallback;
    } catch {
      return null;
    }
  }
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const filePath = await resolveFile(requestUrl.pathname);

  if (!filePath) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "Content-Type": contentType(filePath),
    "Cache-Control": "no-store",
  });
  createReadStream(filePath).pipe(response);
});

server.listen(port, () => {
  console.log(`Static server for ${directory}`);
  console.log(`Open http://127.0.0.1:${port}`);
});
