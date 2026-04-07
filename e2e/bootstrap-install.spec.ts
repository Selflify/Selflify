import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

const setupLogin = process.env.E2E_SETUP_LOGIN ?? "owner";
const setupPassword = process.env.E2E_SETUP_PASSWORD ?? "supersecret123";
const installDir = process.env.E2E_INSTALL_DIR ?? "/opt/selflify";
const primaryDomain = process.env.E2E_PRIMARY_DOMAIN ?? "example.dev";
const serverIp = process.env.E2E_SERVER_IP ?? "127.0.0.1";
const caddyContactEmail = process.env.E2E_CADDY_CONTACT_EMAIL ?? "ops@example.dev";
const cloudflareApiToken =
  process.env.E2E_CLOUDFLARE_API_TOKEN ?? "cfut_12345678901234567890123456789012";

async function resolveSetupToken(): Promise<string | null> {
  if (process.env.E2E_SETUP_TOKEN) {
    return process.env.E2E_SETUP_TOKEN;
  }

  try {
    const envFile = await readFile(`${installDir}/.env`, "utf8");
    const match = envFile.match(/^SELFLIFY_SETUP_TOKEN=(.+)$/m);

    return match?.[1]?.trim() ?? null;
  } catch {
    return null;
  }
}

test("bootstraps the latest release and reaches the authenticated app", async ({ page }) => {
  await page.goto("/setup");

  if (await page.getByRole("heading", { name: "Unlock setup" }).isVisible()) {
    const setupToken = await resolveSetupToken();

    expect(setupToken).toBeTruthy();
    await page.locator("#setup-access-token").fill(setupToken ?? "");
    await page.getByRole("button", { name: "Continue to setup" }).click();
  }

  await expect(page.getByRole("heading", { name: "Create account" })).toBeVisible();
  await expect(page.getByText("Step 1 of 2")).toBeVisible();

  await page.locator("#setup-login").fill(setupLogin);
  await page.locator("#setup-password").fill(setupPassword);
  await page.locator("#setup-password-confirm").fill(setupPassword);
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("heading", { name: "Project settings" })).toBeVisible();
  await expect(page.getByText("Step 2 of 2")).toBeVisible();

  await page.locator("#setup-domain").fill(primaryDomain);
  await page.locator("#setup-server-ip").fill(serverIp);
  await page.locator("#setup-caddy-contact-email").fill(caddyContactEmail);
  await page.locator("#setup-cloudflare-api-token").fill(cloudflareApiToken);
  await page.getByRole("button", { name: "Finish setup" }).click();

  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

  await page.locator("#login-form-login").fill(setupLogin);
  await page.locator("#login-form-password").fill(setupPassword);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/sites(?:\?|$)/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByText(primaryDomain)).toBeVisible();
  await expect(page.getByRole("button", { name: "Create site" })).toBeVisible();
});
