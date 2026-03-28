import fs from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

const e2eRoot = path.join(process.cwd(), ".tmp", "playwright-runtime");
const configPath = path.join(e2eRoot, "selflify.config.json");
const caddyfilePath = path.join(e2eRoot, "Caddyfile");

test("completes first launch and signs in with the created account", async ({ page }) => {
  await page.goto("/setup");

  await expect(page.getByRole("heading", { name: "Create account" })).toBeVisible();
  await expect(page.getByText("Step 1 of 2")).toBeVisible();

  await page.locator("#setup-login").fill("owner");
  await page.locator("#setup-password").fill("supersecret123");
  await page.locator("#setup-password-confirm").fill("supersecret123");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("heading", { name: "Project settings" })).toBeVisible();
  await expect(page.getByText("Step 2 of 2")).toBeVisible();
  await expect(page.getByLabel("Primary domain")).toHaveValue("");
  await expect(page.getByLabel("Caddy contact email")).toHaveValue("");

  await page.locator("#setup-domain").fill("example.dev");
  await page.locator("#setup-server-ip").fill("203.0.113.10");
  await page.locator("#setup-caddy-contact-email").fill("ops@example.dev");
  await page.locator("#setup-cloudflare-api-token").fill("cf-token-for-e2e");
  await page.getByRole("button", { name: "Finish setup" }).click();

  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

  await expect
    .poll(async () => {
      const raw = await fs.readFile(configPath, "utf8");
      const config = JSON.parse(raw) as {
        admin: { login: string; passwordHash: string; configuredAt: string | null };
        server: {
          domain: string;
          serverIp: string;
          caddyContactEmail: string;
          cloudflareApiToken: string;
        };
      };

      return {
        login: config.admin.login,
        hasPasswordHash: Boolean(config.admin.passwordHash),
        configuredAt: Boolean(config.admin.configuredAt),
        domain: config.server.domain,
        serverIp: config.server.serverIp,
        caddyContactEmail: config.server.caddyContactEmail,
        cloudflareApiToken: config.server.cloudflareApiToken,
      };
    })
    .toEqual({
      login: "owner",
      hasPasswordHash: true,
      configuredAt: true,
      domain: "example.dev",
      serverIp: "203.0.113.10",
      caddyContactEmail: "ops@example.dev",
      cloudflareApiToken: "cf-token-for-e2e",
    });

  await expect
    .poll(async () => {
      const caddyfile = await fs.readFile(caddyfilePath, "utf8");

      return (
        caddyfile.includes("example.dev") &&
        caddyfile.includes('dns cloudflare "cf-token-for-e2e"') &&
        caddyfile.includes("email ops@example.dev")
      );
    })
    .toBe(true);

  await page.locator("#login-form-login").fill("owner");
  await page.locator("#login-form-password").fill("supersecret123");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/sites/);
  await expect(page.getByRole("heading", { name: /^Sites$/ })).toBeVisible();
  await expect(page.getByText("example.dev")).toBeVisible();
});
