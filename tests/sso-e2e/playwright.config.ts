import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the real SSO sign-in e2e suite.
 *
 * The suite drives a Google Workspace and a Microsoft Entra account
 * through the full OAuth handshake against a running My Impact stack
 * (typically a staging deployment so the prod database isn't polluted).
 *
 * The base URL is read from `SSO_TEST_BASE_URL` (preferred) or, if that
 * is unset, from `APP_URL` / `REPLIT_DEV_DOMAIN`. The specs themselves
 * call `test.skip()` when the IdP credentials they need are missing,
 * so this config can be loaded safely even with no env vars set.
 */
function resolveBaseUrl(): string {
  const explicit = process.env.SSO_TEST_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const appUrl = process.env.APP_URL?.trim();
  if (appUrl) return appUrl.replace(/\/$/, "");
  const dev = process.env.REPLIT_DEV_DOMAIN?.trim();
  if (dev) return `https://${dev.replace(/\/$/, "")}`;
  // Fallback that will simply produce skips because no creds will match.
  return "http://localhost:5000";
}

export default defineConfig({
  testDir: "./specs",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: resolveBaseUrl(),
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
