---
name: Dev DB drift vs drizzle push
description: drizzle-kit push aborts interactively on the dev database; how to apply schema changes safely
---

The dev database has drifted from the Drizzle schema. `pnpm --filter @workspace/db run push` is interactive and currently aborts because it wants to drop a leftover `opportunities` table (has rows, not in schema) and add unique constraints on `org_share_links` / `challenges`.

**Why:** letting push proceed would delete data; answering prompts non-interactively requires a pty driver and still ends at the data-loss abort.

**How to apply:** for new tables/columns, create them directly with psql SQL matching the schema (defaults/nullability included), or reconcile the drift deliberately (archive/drop `opportunities`) so push runs clean. Several `organisations` columns (data_sharing_mode, contact_*, revoked_at, dashboard_sections) were added manually this way.
- analytics_daily_summary was missing from dev DB (drizzle push aborts); created via psql to match lib/db schema — same pattern as other drift tables.
- users.voice_accent was also missing (broke demo seed + persona login with "column does not exist"); added via psql with the schema default. If demo login fails oddly, suspect drift first.
