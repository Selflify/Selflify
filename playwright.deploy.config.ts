import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "https-deploy.spec.ts",
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  outputDir: "output/playwright/deploy-results",
  reporter: [["list"]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000",
    screenshot: "only-on-failure",
  },
});
