---
name: Recurring reminder flow
description: Product invariant — recurring templates are reminders; forecasts never become actual impact.
---

Recurring templates are reminders + reusable templates: one actual contribution is created only when the user confirms a due occurrence; skipping creates nothing; annual projections are display-only forecasts.

**Why:** Bulk-creating months of records from annual defaults recorded forecast as confirmed actual impact, inflating totals and firing webhooks for work that never happened.

**How to apply:** Any new surface touching recurring templates must preserve: (1) no record creation without an explicit per-occurrence confirmation, (2) scheduling is anchor-aware — a template is never due before its first scheduled occurrence, (3) occurrence-level dedupe prompts rather than merging, (4) the hours-logged webhook fires only for confirmed actuals. Past-year retrospective backfill is a deliberately separate flow.
