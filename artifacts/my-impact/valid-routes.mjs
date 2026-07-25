/**
 * valid-routes.mjs — canonical list of every React Router route defined in src/App.tsx.
 *
 * serve.mjs imports isKnownRoute() from here to decide whether an incoming
 * path should be served as SPA (HTTP 200 + index.html) or treated as a
 * genuine 404 (no matching route, never will be).
 *
 * Keep this file in sync with the <Route path="..."> entries in src/App.tsx.
 * String entries are exact-path matches. RegExp entries cover dynamic segments.
 */

export const ROUTE_PATTERNS = [
  // ── Public / marketing ──────────────────────────────────────────────────
  "/",
  "/about",
  "/methodology",
  "/whats-new",
  "/privacy",
  "/terms",
  "/security",
  "/pricing",
  "/contact",
  "/feedback",

  // ── Auth ────────────────────────────────────────────────────────────────
  "/login",
  "/auth/confirm",

  // ── Wizard (open to all) ────────────────────────────────────────────────
  "/wizard/actions",
  "/wizard/activities",
  "/wizard/contributions",
  "/results",
  "/suggestions",
  "/log",
  "/quick-log",

  // ── Authenticated app ───────────────────────────────────────────────────
  "/profile/setup",
  "/profile",
  "/settings",
  "/history",
  "/journal",
  "/milestones",
  "/recap",
  "/badges",

  // ── Org ─────────────────────────────────────────────────────────────────
  "/org",
  "/org/demo",
  "/org/demo/education",
  "/org/register",
  "/org/submit",
  "/org/dashboard",
  "/org/activities",
  "/org/challenges",
  "/org/member/challenges",
  "/org/member/pulse",
  "/org/pulse",
  "/org/export",
  "/org/settings",
  "/org/types/explicit-submission",
  "/org/types/consented-logging",

  // ── Challenges ───────────────────────────────────────────────────────────
  "/challenges",
  "/challenges/join",

  // ── Admin ────────────────────────────────────────────────────────────────
  "/admin",

  // ── Dynamic segments ────────────────────────────────────────────────────
  // /org/share/:slug
  /^\/org\/share\/[^/]+$/,
  // /challenges/:id
  /^\/challenges\/[^/]+$/,
  // /profile/:slug  (public profile — must be last; comes after /profile/setup)
  /^\/profile\/[^/]+$/,
];

/**
 * Returns true when `pathname` (no query string) matches a known React Router route.
 * String entries require an exact match; RegExp entries are tested against the path.
 *
 * @param {string} pathname  e.g. "/login", "/org/share/foobar"
 * @returns {boolean}
 */
export function isKnownRoute(pathname) {
  for (const pattern of ROUTE_PATTERNS) {
    if (typeof pattern === "string") {
      if (pathname === pattern) return true;
    } else {
      if (pattern.test(pathname)) return true;
    }
  }
  return false;
}
