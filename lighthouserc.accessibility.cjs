/**
 * Automated WCAG accessibility gate for every public My Impact page.
 *
 * Keep PUBLIC_ROUTES aligned with PRERENDER_PAGES in
 * artifacts/my-impact/src/lib/page-metadata.ts whenever a public page is added.
 * A score of 1.0 requires every automated Lighthouse accessibility audit to
 * pass. Manual keyboard, screen-reader, zoom and content checks still apply.
 */

const BASE_URL = process.env.LHCI_BASE_URL || "http://localhost:4173";

const PUBLIC_ROUTES = [
  "/",
  "/about",
  "/methodology",
  "/whats-new",
  "/contact",
  "/organisations",
  "/org/demo",
  "/pricing",
  "/org/register",
  "/suggestions",
  "/404",
];

const ROUTES = process.env.A11Y_ROUTES
  ? process.env.A11Y_ROUTES.split(",").map((route) => route.trim()).filter(Boolean)
  : PUBLIC_ROUTES;

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
        onlyCategories: ["accessibility"],
        chromeFlags: "--no-sandbox --headless=new --disable-dev-shm-usage",
      },
    },
    assert: {
      assertions: {
        "categories:accessibility": ["error", { minScore: 1 }],
      },
    },
    upload: {
      target: "temporary-public-storage",
    },
  },
};