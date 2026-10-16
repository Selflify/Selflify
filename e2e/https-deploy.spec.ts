import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";
import { attachRuntimeErrorTracker } from "./support/runtime-errors";

test("deploys preview and stable builds through the CLI and revokes access", async ({
  page,
  request,
  baseURL,
}) => {
  const errors = attachRuntimeErrorTracker(page);
  const slug = `cli-${crypto.randomBytes(4).toString("hex")}`;
  const build = await fs.mkdtemp(path.join(os.tmpdir(), "selflify-deploy-e2e-"));
  const domain = process.env.E2E_PRIMARY_DOMAIN ?? "example.dev";
  const deployServer = process.env.E2E_DEPLOY_SERVER ?? baseURL!;
  const exec = promisify(execFile);
  await page.goto("/login");
  await page.locator("#login-form-login").fill(process.env.E2E_SETUP_LOGIN ?? "owner");
  await page
    .locator("#login-form-password")
    .fill(process.env.E2E_SETUP_PASSWORD ?? "supersecret123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/sites(?:\?|$)/);
  await page.getByRole("button", { name: "Create site" }).click();
  await page.locator("#create-site-slug").fill(slug);
  await page.locator("#create-site-name").fill(slug);
  await page.locator("#create-site-main-branch").fill("stable");
  await page.getByRole("button", { name: "Create site" }).last().click();
  await expect(
    page.getByRole("link", { name: `${slug}.${domain}`, exact: true }).first(),
  ).toBeVisible();
  await page.goto(`/sites/${slug}?view=configuration`);

  async function createToken(name: string, stable = false) {
    await page.locator("#deploy-token-name").fill(name);
    await page
      .locator("#deploy-token-expiry")
      .fill(new Date(Date.now() + 86400_000 * 30).toISOString().slice(0, 10));
    await page.getByLabel("Allow stable deployments").setChecked(stable);
    await page.getByRole("button", { name: "Create token", exact: true }).click();
    const input = page.getByRole("textbox", { name: "New deploy token" });
    await expect(input).toBeVisible();
    const value = await input.inputValue();
    await page.getByRole("button", { name: "Hide token" }).click();
    return value;
  }
  const deploy = (token: string, name: string) =>
    exec(
      process.execPath,
      [
        "packages/selflify-cli/bin/selflify.mjs",
        "deploy",
        build,
        "--site",
        slug,
        "--deploy",
        name,
        "--server",
        deployServer,
        ...(deployServer.startsWith("http:") ? ["--allow-local-http"] : []),
      ],
      { env: { ...process.env, SELFLIFY_DEPLOY_TOKEN: token } },
    );
  async function served(name: string, expected: string) {
    const host = `${name === "stable" ? "" : `${name}.`}${slug}.${domain}`;
    await expect
      .poll(async () => (await request.get(`${deployServer}/`, { headers: { Host: host } })).text())
      .toBe(expected);
  }
  try {
    const token = await createToken("Preview CI");
    await fs.writeFile(path.join(build, "index.html"), "build one");
    expect((await deploy(token, "pr-123")).stdout.trim()).toBe(`https://pr-123.${slug}.${domain}`);
    await served("pr-123", "build one");
    await expect(deploy(token, "stable")).rejects.toThrow("403");
    await fs.writeFile(path.join(build, "index.html"), "build two");
    await deploy(token, "pr-123");
    await served("pr-123", "build two");
    await page.reload();
    await expect(page.getByText("Last used:", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "Revoke", exact: true }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Revoke", exact: true })
      .click();
    await expect(page.getByText("Deploy token revoked.")).toBeVisible();
    await expect(deploy(token, "pr-123")).rejects.toThrow("401");
    const stableToken = await createToken("Stable CI", true);
    expect((await deploy(stableToken, "stable")).stdout.trim()).toBe(`https://${slug}.${domain}`);
    await served("stable", "build two");
    await errors.assertClean();
  } finally {
    await fs.rm(build, { recursive: true, force: true });
    await page.goto(`/sites/${slug}?view=configuration`);
    await page.getByRole("button", { name: "Delete site", exact: true }).click();
    const dialog = page.getByRole("alertdialog");
    await dialog.getByPlaceholder(slug).fill(slug[0].toUpperCase() + slug.slice(1));
    await dialog.getByLabel("Remove files from server").check();
    await dialog.getByRole("button", { name: "Delete site", exact: true }).click();
    await expect(page).toHaveURL(/\/sites(?:\?|$)/);
  }
});
