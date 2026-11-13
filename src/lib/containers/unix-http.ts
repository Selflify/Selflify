import http, { type IncomingMessage } from "node:http";

export async function readBody(
  stream: AsyncIterable<Buffer | string>,
  limit: number,
): Promise<string> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > limit) throw new Error("Response or request body is too large.");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export function unixRequest(
  socketPath: string,
  path: string,
  options: { method: string; body?: unknown; headers?: Record<string, string>; timeout?: number },
): Promise<IncomingMessage> {
  const body = options.body === undefined ? undefined : JSON.stringify(options.body);
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        socketPath,
        path,
        method: options.method,
        signal: AbortSignal.timeout(options.timeout ?? 10_000),
        headers: {
          ...options.headers,
          ...(body === undefined
            ? {}
            : {
                "Content-Type": "application/json",
                "Content-Length": String(Buffer.byteLength(body)),
              }),
        },
      },
      resolve,
    );
    req.on("error", reject);
    req.end(body);
  });
}
