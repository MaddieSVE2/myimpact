/**
 * Default Lighthouse CI config — desktop preset.
 *
 * Kept as a thin re-export so `lhci autorun` without --config (the existing
 * `lighthouse` validation workflow and `pnpm lhci`) keeps running the
 * desktop pass. The mobile pass is `pnpm lhci:mobile`
 * (lighthouserc.mobile.cjs). Shared settings live in lighthouserc.base.cjs.
 */

module.exports = require("./lighthouserc.desktop.cjs");
