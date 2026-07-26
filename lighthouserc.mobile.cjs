/**
 * Mobile Lighthouse CI budgets for My Impact.
 *
 * Uses Lighthouse's default mobile emulation: Moto G Power-class device
 * (successor to the Moto G4 profile), 4x CPU slowdown and simulated
 * slow-4G network throttling. No `preset` key — mobile is Lighthouse's
 * default form factor.
 *
 * Performance budgets are deliberately lower than desktop: the 4x CPU
 * throttle and slow-4G RTT roughly double LCP/TBT on our route set.
 * Initial target (documented July 2026): performance >= 0.50 across all
 * five routes — measured scores were ~0.54 on the homepage (slowest route)
 * under mobile throttling, so 0.50 gives headroom for CI runner variance
 * without letting real regressions through. Raise this after a deliberate
 * mobile optimisation lands.
 * Accessibility/best-practices/SEO are form-factor independent and keep
 * the same budgets as desktop.
 */

const { makeConfig } = require("./lighthouserc.base.cjs");

module.exports = makeConfig({
  settings: {
    // Mobile is Lighthouse's default: Moto G4-class emulation + 4G throttling.
  },
  assertions: {
    "categories:performance": ["error", { minScore: 0.5 }],
    "categories:accessibility": ["error", { minScore: 0.95 }],
    "categories:best-practices": ["error", { minScore: 0.85 }],
    "categories:seo": ["error", { minScore: 0.85 }],
  },
});
