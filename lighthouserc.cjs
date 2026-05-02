/**
 * Lighthouse CI configuration for the My Impact web app.
 *
 * Runs against a locally served production build of `artifacts/my-impact`
 * and asserts per-category budgets for our five most important routes.
 *
 * Local usage:
 *   pnpm lhci          # build + collect + assert (same as CI)
 *   pnpm lhci:open     # open the most recent HTML reports in a browser
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

module.exports = {
  ci: {
    collect: {
      startServerCommand:
        "pnpm --filter @workspace/my-impact exec vite preview --config vite.config.ts --host 0.0.0.0 --port 4173",
      startServerReadyPattern: "Local:",
      startServerReadyTimeout: 60000,
      url: ROUTES.map((path) => `${BASE_URL}${path}`),
      numberOfRuns: 1,
      settings: {
        preset: "desktop",
        chromeFlags: "--no-sandbox --headless=new --disable-dev-shm-usage",
        skipAudits: ["uses-http2"],
      },
    },
    assert: {
      assertions: {
        "categories:performance": ["error", { minScore: 0.75 }],
        "categories:accessibility": ["error", { minScore: 0.95 }],
        "categories:best-practices": ["error", { minScore: 0.85 }],
        "categories:seo": ["error", { minScore: 0.85 }],
      },
    },
    upload: {
      target: "temporary-public-storage",
    },
  },
};
