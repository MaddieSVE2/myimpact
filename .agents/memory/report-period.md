---
name: Authoritative report period
description: Period model decision for Full Impact Report saves and reconciliation
---

A Full Impact Report's period is chosen once at the start of the wizard and stored on the saved record as an inclusive date range. It is authoritative: estimate-vs-actual reconciliation groups by that range and absorbs actuals logged anywhere inside it, even across calendar-year boundaries, while each report still counts in exactly one calendar year. Rows saved before this model have no stored period and must keep the per-calendar-year behaviour byte-identically.

**Why:** the journey used to ask for dates three times; academic/custom periods span two calendar years, and naive per-year grouping defeats the double-count protection. An estimate's capacity must be consumed once across its whole period — windowed aggregations that each subtract `min(estimate, own-window logs)` reuse the same capacity and under-report.

**How to apply:** year-windowed aggregation surfaces add period-overlapping reports and their out-of-window in-period actuals to the reconciliation input only (never the raw sums), and consume estimate capacity chronologically so each window's excess is allocated once. A supplied-but-invalid period must be rejected (400), never silently downgraded to a legacy save. The report name is display-only and never affects dates or maths.
