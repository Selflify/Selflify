import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { packBuild, serverUrl } from "../bin/selflify.mjs";

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
