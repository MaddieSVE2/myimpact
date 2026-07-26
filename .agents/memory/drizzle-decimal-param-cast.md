---
name: Drizzle decimal params vs integer columns
description: Multiplying integer columns by decimal JS constants in raw sql`` needs CAST AS numeric or Postgres throws 22P02
---

Rule: in drizzle `sql\`...\`` expressions, a JS decimal constant (e.g. 0.004) bound as a parameter next to an integer column gets typed as integer by Postgres and throws `22P02 invalid input syntax for type integer: "0.004"` — even with zero rows, at plan time. Wrap it: `CAST(${constant} AS numeric)`.

**Why:** crashed the admin voice-usage leaderboard in production (ORDER BY cost expression).

**How to apply:** any raw SQL mixing integer columns with fractional multipliers/divisors. Shared helper `voiceUsageCostPenceExpr()` in the voice usage lib; regression test executes the real query (tests/voiceUsageCostQuery.test.ts) — plan-time failure means it catches the bug with an empty table.
