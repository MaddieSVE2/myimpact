---
name: Report share flow
description: Behavioural rules for "Review & share" org shares sourced from a personal Impact Report.
---
- Only saved Impact Reports qualify as share sources; dated records (quick logs etc.) must never be shareable this way. The report is authoritative — share contents are copied server-side and client-sent quantities are ignored.
- **Why:** the feature exists to avoid re-entry and prevent tampering with already-computed values.
- Shares are always period-level: single activity dates are rejected, and reports without a stored period get a derived calendar-year period so a share never carries an invented date.
- Dedupe must hold on every surface: personal views exclude the org copy, and when both a report and its share reach an aggregation, they count once — for headline totals AND per-activity/category/SDG breakdowns.
- One live share per report per org is enforced by the database (not just a pre-check), so concurrent submits surface as "already shared". Shares can't be edited — withdraw and re-share.
- Provenance is durable: a report can't be deleted while a live share points at it (DB-enforced; withdraw first). A full account wipe withdraws shares before their sources.
- The share entry point must stay reachable after leaving the results screen (History offers it for qualifying reports); eligibility gating in UI must not be stricter than the server's submission rule (pending members may submit).
