---
name: Org dashboard tiering
description: How managers are routed to the full vs lite org dashboard
---
Managers see the full Organisation-tier dashboard (/org/dashboard + activities/challenges/pulse/export/settings) only when their org is the demo org, has type "university", or has `organisations.full_tier_enabled = true` (super-admin toggle in Admin → Organisations, PATCH /api/admin/orgs/:id).

**Why:** real paying orgs (e.g. Social Value Engine) were stuck on the lite portal with the £2,500/yr upsell card because tiering was hard-wired to demo/university only.

**How to apply:** any new dashboard-gating logic (web routing, navbar, sub-pages) must include the fullTierEnabled condition alongside demo/university. Client reads it from GET /api/org/my. Note: dashboard sub-pages are not server-side gated on the flag — URL-guessing bypasses the upsell (accepted for now).
