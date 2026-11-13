import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { deployImage, packBuild, serverUrl } from "../bin/selflify.mjs";

test("requires HTTPS and rejects URLs which could redirect or embed credentials", () => {
  assert.equal(serverUrl("https://panel.example.test"), "https://panel.example.test");
  for (const url of [
    "http://panel.example.test",
    "https://user:pass@panel.example.test",
    "https://panel.example.test/path",
    "https://panel.example.test?token=secret",
  ]) {
    assert.throws(() => serverUrl(url));
  }
  assert.equal(serverUrl("http://127.0.0.1:3001", true), "http://127.0.0.1:3001");
  assert.throws(() => serverUrl("http://panel.example.test", true));
});

test("creates deterministic archives and rejects build symlinks", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "selflify-cli-test-"));
  try {
    const build = path.join(root, "build");
    await fs.mkdir(build);
    await fs.writeFile(path.join(build, "index.html"), "build");
    const first = await packBuild(build, path.join(root, "first.tar.gz"));
    const second = await packBuild(build, path.join(root, "second.tar.gz"));
    assert.deepEqual(first, second);
    await fs.symlink("index.html", path.join(build, "link.html"));
    await assert.rejects(packBuild(build, path.join(root, "third.tar.gz")), /regular files/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("publishes an image by digest through the container deployment API", async () => {
  const image = `registry.example.test/account/storybook@sha256:${"a".repeat(64)}`;
  const token = `slf_71f7d606-2d4a-4a69-8183-1a4b06bf22f2.${"a".repeat(43)}`;
  const result = { url: "https://storybook.example.test" };
  const server = createServer(async (req, res) => {
    assert.equal(req.method, "POST");
    assert.equal(req.url, "/api/deploy/v1/images");
    assert.equal(req.headers.authorization, `Bearer ${token}`);
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    assert.deepEqual(JSON.parse(Buffer.concat(chunks).toString("utf8")), {
      site: "storybook",
      image,
    });
    res.end(JSON.stringify(result));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const options = { server: origin, token, site: "storybook", allowLocalHttp: true };
    await assert.rejects(
      deployImage({ ...options, image: "storybook:latest" }),
      /pinned by digest/,
    );
    assert.deepEqual(await deployImage({ ...options, image }), result);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
