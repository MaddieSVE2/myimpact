import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the service-worker update e2e suite.
 *
 * The single spec under `specs/` builds the my-impact app twice with
 * a deliberate source perturbation between builds (so asset hashes
 * differ), serves each build with the production `serve.mjs`, and
 * asserts that a returning visitor running the previously-installed
 * service worker successfully fetches the new app shell + bundles
 * after a redeploy — i.e. that we never regress into the white-screen
 * bug that prompted this guardrail.
 *
 * The spec spawns its own static server on a free port; it does not
 * need a database, the api-server, or any other external dependency.
 */

export default defineConfig({
  testDir: "./specs",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }], ["list"]]
    : [["list"], ["html", { open: "never" }]],

  // Building the app twice is the dominant cost. 5 minutes is plenty
  // on CI hardware and leaves headroom on slower local machines.
  timeout: 300_000,
  expect: { timeout: 15_000 },

  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
