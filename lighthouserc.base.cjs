/**
 * Shared Lighthouse CI configuration for the My Impact web app.
 *
 * Consumed by `lighthouserc.desktop.cjs` and `lighthouserc.mobile.cjs`,
 * which layer preset-specific collect settings and budgets on top.
 *
 * Local usage:
 *   pnpm lhci             # desktop: build + collect + assert (same as CI)
 *   pnpm lhci:mobile      # mobile: build + collect + assert (Moto G4, 4G)
 *   pnpm lhci:open        # open the most recent HTML reports in a browser
 *
 * Tuning budgets:
 *   Lower a number only with a documented reason in the PR description.
 *   Raise budgets after a deliberate optimisation lands so regressions are
 *   caught early. PWA is intentionally omitted: Lighthouse 12 (bundled with
 *   @lhci/cli@^0.14) deprecated the PWA category in favour of installability
 *   audits, so we cannot assert a single PWA score against modern Lighthouse.
 */

const BASE_URL = process.env.LHCI_BASE_URL || "http://localhost:4173";

const ROUTES = [
  "/",
  "/wizard/actions",
  "/results",
  "/history",
  "/profile/demo",
];

/**
 * Build a full LHCI config from preset-specific overrides.
 *
 * @param {object} options
 * @param {object} options.settings   Lighthouse settings merged into collect.settings
 * @param {object} options.assertions Category assertions for this preset
 */
function makeConfig({ settings, assertions }) {
  return {
    ci: {
      collect: {
        startServerCommand:
          "pnpm --filter @workspace/my-impact exec vite preview --config vite.config.ts --host 0.0.0.0 --port 4173",
        startServerReadyPattern: "Local:",
        startServerReadyTimeout: 60000,
        url: ROUTES.map((path) => `${BASE_URL}${path}`),
        numberOfRuns: 1,
        settings: {
          chromeFlags: "--no-sandbox --headless=new --disable-dev-shm-usage",
          skipAudits: ["uses-http2"],
          ...settings,
        },
      },
      assert: {
        assertions,
      },
      upload: {
        target: "temporary-public-storage",
      },
    },
  };
}

module.exports = { makeConfig, ROUTES, BASE_URL };
