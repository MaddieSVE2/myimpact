---
name: Admin session for dev testing
description: How to exercise admin-only API/UI in dev when no admin user exists
---
Admin routes are gated by `isAdminEmail` (allowlist in api-server `lib/adminEmails.ts`); demo personas are never admins, so persona instant login can't test admin surfaces.

**How to apply:** insert a user row with an allowlisted email (e.g. hello@myimpact.uk) into the dev DB, then sign a JWT `{id,email}` with `SESSION_SECRET` (use `npx tsx` on a script file — tsx `-e` eval chokes on top-level await) and send it as the `mi_session` cookie. Works for curl and for Playwright via `context.addCookies` (run ad-hoc scripts from `tests/e2e/` so `@playwright/test` resolves).

**Why:** magic-link login rate-limits per email and there's no admin persona; this is the only quick path to admin-only endpoints/pages in dev.

Also: never `git stash` in this environment to compare against baseline — an interrupted stash/pop can silently drop tracked edits.
