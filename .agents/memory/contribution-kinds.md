---
name: Estimate vs actual double-count rule
description: Why yearly aggregations subtract a reconciliation excess instead of re-summing
---

**Rule:** wherever impact records are summed per user/year (dashboards, recap, org stats, exports, public profiles, digest emails), an annual estimate and quick-logged actuals of the same activity must count once — the greater of the two. Aggregators keep their raw sums and subtract the shared reconciliation helper's "excess"; they must never re-implement the grouping or use a bare SQL SUM.

**Why:** subtract-the-excess leaves all-legacy datasets byte-identical (excess is zero unless kinds mix), which was the acceptance bar for historical reports. Re-summing risks drift.

**How to apply:** any NEW aggregation surface must select the kind/date/reporting-year/result fields and subtract the excess. Org monthly/timeline cadence views intentionally stay raw. Record edits must preserve the original kind unless the client explicitly re-classifies.
