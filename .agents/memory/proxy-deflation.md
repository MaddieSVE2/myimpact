---
name: Proxy deflation system
description: Long-horizon financial proxies are deflated in the DB-backed proxy bank; where the rules live and pitfalls when editing them.
---

# Proxy deflation system

- Financial proxies live in the DB (`proxies` table), seeded insert-only from the JSON bank so admin edits survive restarts. A 60s in-process cache must be invalidated after any write (`invalidateProxyCache`).
- Long-horizon proxies (horizon=lifetime/multi-year) carry a `deflationFactor` in (0,1]; the matcher only ever offers `enabled` proxies and enforces `allowedUnits`. Applied value = full value × factor.
- **Why:** a single contribution (e.g. one tutoring session) must not claim a lifetime value like £79k; deflation keeps claims defensible.
- **How to apply:** never bypass the proxy store when valuing custom activities; guardrail deflates unpriced lifetime proxies by default.
- Startup repair sweep fixes overstated historic records. Pitfall: filtering jsonb::text with LIKE needs Postgres formatting — `"category": "Custom"` has a space after the colon.
- Admins manage the bank at /admin/proxies (search, factor, horizon, units, enable/disable).
