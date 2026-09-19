/**
 * Automated WCAG accessibility gate for every public My Impact page.
 *
 * PUBLIC_ROUTES is the same source used to build PRERENDER_PAGES, so every
 * prerendered public page enters this gate automatically.
 * The package a11y script runs this config with both desktop and mobile
 * Lighthouse profiles.
 * A score of 1.0 requires every automated Lighthouse accessibility audit to
 * pass. Manual keyboard, screen-reader, zoom and content checks still apply.
 */

const BASE_URL = process.env.LHCI_BASE_URL || "http://localhost:4173";
const FORM_FACTOR = process.env.A11Y_FORM_FACTOR || "desktop";

if (!["desktop", "mobile"].includes(FORM_FACTOR)) {
  throw new Error(`Unsupported A11Y_FORM_FACTOR: ${FORM_FACTOR}`);
}

const PUBLIC_ROUTES = require("./artifacts/my-impact/src/lib/public-routes.json");

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
        // Lighthouse defaults to mobile emulation when no preset is provided.
        ...(FORM_FACTOR === "desktop" ? { preset: "desktop" } : {}),
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