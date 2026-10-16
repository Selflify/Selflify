import { expect, test } from "@playwright/test";
import crypto from "node:crypto";

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

  await page.goto("/sites/app?view=configuration");
  await expect(page.getByRole("heading", { name: "Stable alias (optional)" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Deploy tokens", exact: true })).toBeVisible();
  await expect(page.getByLabel("Allow stable deployments")).not.toBeChecked();
  await page.locator("#deploy-token-name").fill("Runtime smoke CI");
  await page
    .locator("#deploy-token-expiry")
    .fill(new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10));
  await page.getByRole("button", { name: "Create token", exact: true }).click();
  const newToken = page.getByRole("textbox", { name: "New deploy token" });
  await expect(newToken).toBeVisible();
  expect(await newToken.inputValue()).toMatch(/^slf_[a-f0-9-]{36}\.[A-Za-z0-9_-]{43}$/);
  await page.getByRole("button", { name: "Hide token" }).click();
  await expect(newToken).not.toBeVisible();
  await page.getByRole("button", { name: "Revoke", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Revoke", exact: true }).click();
  await expect(page.getByText("preview:write · Expires", { exact: false })).toContainText(
    "Revoked",
  );
  await runtimeErrors.assertClean();

  await page.locator("#deploy-token-name").fill("Runtime smoke MCP");
  await page
    .locator("#deploy-token-expiry")
    .fill(new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10));
  await page.getByLabel("Allow preview deployments", { exact: true }).uncheck();
  await page.getByLabel("Allow MCP read access", { exact: true }).check();
  await page.getByRole("button", { name: "Create token", exact: true }).click();
  await expect(newToken).toBeVisible();
  const mcpToken = await newToken.inputValue();
  const mcpHeaders = {
    Authorization: `Bearer ${mcpToken}`,
    Accept: "application/json, text/event-stream",
    Host: "example.dev",
  };
  const initialize = await page.request.post("/mcp", {
    headers: mcpHeaders,
    data: {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "smoke", version: "1" },
      },
    },
  });
  expect(initialize.status()).toBe(200);
  expect((await initialize.json()).result.serverInfo.name).toBe("selflify");
  const sites = await page.request.post("/mcp", {
    headers: mcpHeaders,
    data: {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "list_sites", arguments: {} },
    },
  });
  expect(sites.status()).toBe(200);
  expect((await sites.json()).result.structuredContent.sites).toEqual([
    expect.objectContaining({ slug: "app" }),
  ]);
  await page.getByRole("button", { name: "Hide token" }).click();
  await page.getByRole("button", { name: "Revoke", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Revoke", exact: true }).click();
  await expect(page.getByText("mcp:read · Expires", { exact: false })).toContainText("Revoked");
  const revokedMcp = await page.request.post("/mcp", {
    headers: mcpHeaders,
    data: { jsonrpc: "2.0", id: 3, method: "tools/list", params: {} },
  });
  expect(revokedMcp.status()).toBe(401);
  await runtimeErrors.assertClean();

  await page.locator("#site-settings-stable-alias").fill("www.example.com");
  await page
    .locator("#site-settings-stable-alias")
    .locator("xpath=ancestor::form")
    .getByRole("button", { name: "Save" })
    .click();
  await expect(page).toHaveURL(/\/sites\/app\?view=configuration(?:&|$)/);
  await expect
    .poll(() => new URL(page.url()).searchParams.get("notice"))
    .toBe("Stable alias saved for app.");
  await expect(page.locator("#site-settings-stable-alias")).toHaveValue("www.example.com");
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
  await expect
    .poll(() => new URL(page.url()).searchParams.get("notice"))
    .toBe("Cloudflare token saved.");
  await expect(page.getByText("********7890")).toBeVisible();
  await runtimeErrors.assertClean();

  for (const [slug, name] of [
    ["docs", "Docs"],
    ["studio", "Studio"],
  ]) {
    await page.goto("/sites");
    await page.getByRole("button", { name: "Create site", exact: true }).click();
    await page.locator("#create-site-slug").fill(slug);
    await page.locator("#create-site-name").fill(name);
    await page.locator("#create-site-main-branch").fill("stable");
    await page.getByRole("button", { name: "Create site", exact: true }).last().click();
    await expect(page.locator(`a[href="/sites/${slug}"]`).first()).toBeVisible();
  }
  await page.goto("/mcp/authorize");
  await page.setViewportSize({ width: 1440, height: 1100 });
  await expect(page.getByRole("heading", { name: "Choose its access" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create access token" })).toBeDisabled();
  await page.getByLabel("Connection name", { exact: true }).fill("Development agent");
  await page.getByRole("checkbox", { name: "Access App", exact: true }).check();
  await page.getByRole("checkbox", { name: "Access Docs", exact: true }).check();
  await page.getByRole("checkbox", { name: "Deploy previews", exact: false }).check();
  await page.getByRole("checkbox", { name: "Manage settings", exact: false }).check();
  await expect(
    page.getByRole("checkbox", { name: "Publish to production", exact: false }),
  ).not.toBeChecked();
  await page.screenshot({
    path: "output/playwright/mcp-authorization-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: "output/playwright/mcp-authorization-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Create access token" }).click();
  await expect(page.getByLabel("Access token", { exact: true })).toBeVisible();
  const selectedToken = await page.getByLabel("Access token", { exact: true }).inputValue();
  const callMcp = async (accessToken: string, name: string, args = {}) =>
    page.request.post("/mcp", {
      headers: {
        Host: "example.dev",
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json, text/event-stream",
      },
      data: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } },
    });
  const selectedSites = await callMcp(selectedToken, "list_sites");
  expect(
    (await selectedSites.json()).result.structuredContent.sites.map(
      (site: { slug: string }) => site.slug,
    ),
  ).toEqual(["app", "docs"]);
  expect(
    (await (await callMcp(selectedToken, "get_site", { site: "studio" })).json()).result.isError,
  ).toBe(true);
  const docsSettings = (await (await callMcp(selectedToken, "get_site", { site: "docs" })).json())
    .result.structuredContent.site;
  const updatedDocs = await callMcp(selectedToken, "update_site", {
    site: "docs",
    name: "Docs",
    mainBranch: "stable",
    expectedRevision: docsSettings.configRevision,
  });
  expect((await updatedDocs.json()).result.structuredContent.status).toBe("success");
  await page.getByRole("button", { name: "Create another connection", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Choose its access" })).toBeVisible();
  await expect(page.getByLabel("Access token", { exact: true })).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create access token", exact: true }),
  ).toBeDisabled();
  await runtimeErrors.assertClean();

  const registration = await page.request.post("/mcp/oauth/register", {
    data: {
      client_name: "Development agent",
      redirect_uris: ["http://127.0.0.1:49100/mcp-callback"],
      token_endpoint_auth_method: "none",
    },
  });
  expect(registration.status()).toBe(201);
  const clientId = (await registration.json()).client_id;
  const verifier = "selflify-browser-test-verifier-".repeat(3);
  const authorization = new URLSearchParams({
    client_id: clientId,
    redirect_uri: "http://127.0.0.1:49100/mcp-callback",
    response_type: "code",
    code_challenge: crypto.createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    resource: "https://example.dev/mcp",
    state: "browser-test-state",
  });
  await page.context().clearCookies();
  await page.goto(`/mcp/authorize?${authorization}`);
  await expect(page).toHaveURL(/\/login\?returnTo=/);
  await page.locator("#login-form-login").fill("owner");
  await page.locator("#login-form-password").fill("supersecret123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Development agent wants access", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.getByRole("radio", { name: "All sites", exact: true }).check();
  await expect(
    page.getByText("Includes all 3 current sites and any sites you create later."),
  ).toBeVisible();
  await page.screenshot({ path: "output/playwright/mcp-oauth-consent.png", fullPage: true });
  await page.route("http://127.0.0.1:49100/mcp-callback**", (route) =>
    route.fulfill({ contentType: "text/html", body: "<h1>Connection complete</h1>" }),
  );
  await page.getByRole("button", { name: "Authorize connection", exact: true }).click();
  await expect(page).toHaveURL(/127\.0\.0\.1:49100\/mcp-callback\?code=/);
  const callback = new URL(page.url());
  expect(callback.searchParams.get("state")).toBe("browser-test-state");
  const exchange = await page.request.post("http://localhost:3201/mcp/oauth/token", {
    form: {
      grant_type: "authorization_code",
      client_id: clientId,
      redirect_uri: "http://127.0.0.1:49100/mcp-callback",
      code: callback.searchParams.get("code")!,
      code_verifier: verifier,
      resource: "https://example.dev/mcp",
    },
  });
  expect(exchange.status()).toBe(200);
  const oauthToken = (await exchange.json()).access_token;
  expect(
    (await (await callMcp(oauthToken, "list_sites")).json()).result.structuredContent.sites,
  ).toHaveLength(3);
  await page.goto("/mcp/authorize");
  await expect(page.getByRole("heading", { name: "Connected agents" })).toBeVisible();
  await page.getByRole("button", { name: "Revoke", exact: true }).last().click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Revoke", exact: true }).click();
  await expect(page.getByText("1 active", { exact: true })).toBeVisible();
  expect((await callMcp(oauthToken, "list_sites")).status()).toBe(401);
  await runtimeErrors.assertClean();
});
