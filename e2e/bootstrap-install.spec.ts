import { expect, test } from "@playwright/test";

const setupLogin = process.env.E2E_SETUP_LOGIN ?? "owner";
const setupPassword = process.env.E2E_SETUP_PASSWORD ?? "supersecret123";
const primaryDomain = process.env.E2E_PRIMARY_DOMAIN ?? "example.dev";
const serverIp = process.env.E2E_SERVER_IP ?? "127.0.0.1";
const caddyContactEmail = process.env.E2E_CADDY_CONTACT_EMAIL ?? "ops@example.dev";
const cloudflareApiToken = process.env.E2E_CLOUDFLARE_API_TOKEN ?? "cf-token-for-e2e";

test("bootstraps the latest release and reaches the authenticated app", async ({ page }) => {
  await page.goto("/setup");

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
