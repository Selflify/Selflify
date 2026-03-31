import { expect, test } from "@playwright/test";

import { attachRuntimeErrorTracker } from "./support/runtime-errors";

const initialCloudflareToken = "cfut_12345678901234567890123456789012";
const updatedCloudflareToken = "cfut_abcdefghijklmnopqrstuvwxyzABCDEF1234567890";

test("setup, login and key admin pages render without runtime errors", async ({ page }) => {
  const runtimeErrors = attachRuntimeErrorTracker(page);

  await page.goto("/setup");
  await expect(page.getByRole("heading", { name: "Create account" })).toBeVisible();
  await runtimeErrors.assertClean();

  await page.locator("#setup-login").fill("owner");
  await page.locator("#setup-password").fill("supersecret123");
  await page.locator("#setup-password-confirm").fill("supersecret123");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("heading", { name: "Project settings" })).toBeVisible();
  await runtimeErrors.assertClean();

  await page.locator("#setup-domain").fill("example.dev");
  await page.locator("#setup-server-ip").fill("203.0.113.10");
  await page.locator("#setup-caddy-contact-email").fill("ops@example.dev");
  await page.locator("#setup-cloudflare-api-token").fill(initialCloudflareToken);
  await page.getByRole("button", { name: "Finish setup" }).click();

  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await runtimeErrors.assertClean();

  await page.locator("#login-form-login").fill("owner");
  await page.locator("#login-form-password").fill("supersecret123");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/sites(?:\?|$)/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create site" })).toBeVisible();
  await expect(page.getByText("Stable + preview directories detected")).toBeVisible();
  await expect(page.getByText("Last deploys")).toBeVisible();
  await runtimeErrors.assertClean();

  await page.getByRole("button", { name: "Create site" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.locator("#create-site-slug").fill("app");
  await page.locator("#create-site-name").fill("App");
  await page.locator("#create-site-main-branch").fill("stable");
  await page.getByRole("button", { name: "Create site" }).last().click();

  await expect(page).toHaveURL(/\/sites(?:\?|$)/);
  const siteLink = page.locator('a[href="/sites/app"]').first();
  await expect(siteLink).toBeVisible();
  await expect(page.getByRole("link", { name: "app.example.dev" }).first()).toBeVisible();
  await runtimeErrors.assertClean();

  await siteLink.click();
  await expect(page).toHaveURL(/\/sites\/app(?:\?|$)/);
  await expect(page.getByText("Deploy inventory")).toBeVisible();
  await runtimeErrors.assertClean();

  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Global settings" })).toBeVisible();
  await expect(page.getByText("Cloudflare DNS records")).toBeVisible();
  await expect(page.getByRole("cell", { name: "app.example.dev", exact: true })).toBeVisible();
  await expect(page.getByText("********9012")).toBeVisible();
  await page.getByLabel("Edit token").click();
  await page.locator("#settings-cloudflare-api-token").fill(updatedCloudflareToken);
  await page.getByRole("button", { name: "Save token" }).click();
  await expect(page).toHaveURL(/\/settings(?:\?|$)/);
  await expect(page.getByText("********7890")).toBeVisible();
  await runtimeErrors.assertClean();
});
