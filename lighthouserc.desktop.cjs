/**
 * Desktop Lighthouse CI budgets for My Impact.
 * See lighthouserc.base.cjs for shared collect/upload settings.
 */

const { makeConfig } = require("./lighthouserc.base.cjs");

module.exports = makeConfig({
  settings: {
    preset: "desktop",
  },
  assertions: {
    "categories:performance": ["error", { minScore: 0.75 }],
    "categories:accessibility": ["error", { minScore: 0.95 }],
    "categories:best-practices": ["error", { minScore: 0.85 }],
    "categories:seo": ["error", { minScore: 0.85 }],
  },
});
