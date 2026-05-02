import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for the My Impact e2e suite.
 *
 * The suite expects three pieces of infrastructure:
 *   1. A Postgres database (DATABASE_URL must be set; migrations applied).
 *   2. The api-server running with E2E_TEST_MODE=1 and SESSION_SECRET set.
 *   3. The my-impact Vite dev server, with /api proxied to the api-server.
 *
 * `pnpm test:e2e` (defined in the workspace root package.json) starts both
 * services with the right env vars before invoking this runner.
 */

const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 24656);
const API_PORT = Number(process.env.E2E_API_PORT ?? 8080);

const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${WEB_PORT}`;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // Never silently retry: the project policy is to quarantine flakes.
  retries: 0,
  // Single worker so test data isolation (per-email) is easier to reason about.
  workers: 1,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }], ["list"]]
    : [["list"], ["html", { open: "never" }]],

  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    // Cookies & localStorage are scoped per browser-context, so each test
    // gets a fresh session unless it explicitly reuses one.
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // The webServer is opt-in via env: when E2E_MANAGED_SERVERS=1 we let
  // Playwright start/stop the api-server and Vite. When the suite is run
  // against an already-running stack (default in dev), we skip it.
  webServer: process.env.E2E_MANAGED_SERVERS === "1"
    ? [
        {
          command: "pnpm --filter @workspace/api-server run dev",
          port: API_PORT,
          reuseExistingServer: false,
          timeout: 60_000,
          env: {
            PORT: String(API_PORT),
            E2E_TEST_MODE: "1",
            ENABLE_DEMO_LOGIN: "true",
            NODE_ENV: "development",
            SESSION_SECRET: process.env.SESSION_SECRET ?? "e2e-test-session-secret",
            APP_URL: BASE_URL,
            ALLOWED_ORIGINS: BASE_URL,
            DATABASE_URL: process.env.DATABASE_URL ?? "",
          },
        },
        {
          command: "pnpm --filter @workspace/my-impact run dev",
          port: WEB_PORT,
          reuseExistingServer: false,
          timeout: 60_000,
          env: {
            PORT: String(WEB_PORT),
            BASE_PATH: "/",
            VITE_E2E_API_PROXY: `http://localhost:${API_PORT}`,
            VITE_ENABLE_DEMO_LOGIN: "true",
          },
        },
      ]
    : undefined,
});
