---
name: Dev DB drift vs drizzle push
description: Rules that keep drizzle-kit push clean and prevent it undoing FK behaviours
---
**Array columns must never have a DDL default.** drizzle-kit push perpetually re-diffs any DB-level default on `text[]` columns (it mis-parses the introspected default), re-applying `SET DEFAULT` on every run forever. Use `.$default(() => [])` (app-side) with no DB default.

**FK `onDelete` behaviour must be declared in the Drizzle schema.** Any ON DELETE SET NULL / CASCADE applied via SQL but not via `.references(..., { onDelete })` gets silently reverted to a plain FK by the next push — which blocks user deletion (GDPR erasure relies on those FK actions for retained org rows).

**Why:** both patterns have bitten this project: an array-default push loop blocked non-interactive pushes, and a push that reverted erasure FKs broke user deletion.

**How to apply:** schema changes go in `lib/db/src/schema/*` and are applied with `pnpm --filter @workspace/db run push` — never hand SQL alone. If SQL is unavoidable, mirror it in the schema and in a numbered migration. Prod schema is synced only by the Publish diff flow; startup DDL for prod is forbidden by platform rules.
