# Contribution data model & double-count prevention

Design note for the estimate-vs-actual contribution model (foundation for the
Quick Log refactor). Written before implementation per the spec checklist.

## Problem

Every `impact_records` row was summed per calendar year regardless of origin.
An annualised Full Impact Report estimate ("50 hours gardening this year") plus
a Quick Logged actual ("2 hours gardening on 3 May") counted twice for the same
activity in the same year.

## Audit summary (as implemented today)

- **Schema** — `lib/db/src/schema/impact.ts`: one `impact_records` table. Each
  row stores the *whole* server-calculated result (`resultJson` with
  `totalValue = impactValue + contributionValue (£12.21/hr NLW) +
  donationsValue (pound-for-pound) + personalDevelopmentValue (£15/hr)`), an
  `entryDate` deciding calendar-year membership, `source`
  (`user | retrospective | habit | member-submitted | org-attested`), and
  `habitTemplateId`.
- **Save/calculate** — `POST /api/impact/calculate` and `POST /api/impact/save`
  (`artifacts/api-server/src/routes/impact.ts`) recompute server-side via
  `calculateImpact` (`src/lib/impactData.ts`). `calculateImpact` performs *no
  annualisation*: it multiplies the submitted quantities/hours by proxy values
  as given, so per-occurrence payloads price correctly without any methodology
  change. Long-horizon proxies are deflated by `src/lib/proxyValuation.ts`.
- **Aggregation surfaces** — personal: `GET /recap/:year`, `GET /yoy`,
  `GET /year-rollover`, `GET /history` (list, no sums); org:
  `computeOrgStats` (`GET /org-stats`), org PDF export, `GET /org/stats/monthly`,
  `getVerifiedTotalsForOrg` (`src/routes/org.ts`). All JS-sum
  `resultJson.totalValue`/`totalHours` per row (yoy used SQL SUM of the
  `total_value` column, which equals the resultJson value).
- **Habit dedupe** — `/save` returns 409 when a non-forced save overlaps a
  habit-generated entry's activities in the same calendar month; edits preserve
  habit identity. This is a *conflict prompt*, not aggregation-time dedupe.

## Model

New columns on `impact_records` (migration `0043_impact_record_kind_location.sql`):

| column | meaning |
|---|---|
| `kind` (text, NOT NULL, default `'legacy'`) | `legacy`, `annual_estimate`, `quick_log`, `recurring_confirmation`, `bulk_retrospective`, `org_api` |
| `location_json` (jsonb, nullable) | structured activity location: `{ mode: 'in_person'\|'online'\|'multiple', label, postcode, townCity, lat, lng, localAuthority, region, country }` |
| `reporting_year` (int, nullable) | reporting period derived from `entryDate` (calendar year today); NULL = unassociated, record still saves |

- **All existing rows are `kind='legacy'`** and are always summed exactly as
  before — historical totals and display are unchanged by construction.
- `kind` is orthogonal to `source` (which keeps driving existing UI labels,
  habit-conflict logic and org twin exclusion).
- Server-set kinds: recurring-template confirms → `recurring_confirmation`
  (past-year backfill → `bulk_retrospective`); year-rollover bulk create →
  `bulk_retrospective` semantics preserved via same path; org REST API →
  `org_api`. `/save` accepts an explicit `kind` (`annual_estimate` or
  `quick_log`) from clients; when absent it stays `legacy` so today's clients
  keep producing rows that aggregate identically (the Quick Log UX task will
  start sending explicit kinds).
- Per-occurrence payloads: a `quick_log` save submits its actual quantities /
  hours in `activities[]` unchanged; `calculateImpact` already applies proxy
  values, NLW, donations and the £15/hr premium to whatever quantities are
  supplied, so single occurrences need no annual conversion anywhere.
- `location_json` supports "Online / remote" (`mode:'online'`) and "Multiple
  locations" (`mode:'multiple'`); a future beneficiary-location will be a
  sibling jsonb column (deliberately not added now).
- `reporting_year` is derived at save time from the entry date. Today's
  periods are calendar years so exactly one always fits; the column is
  nullable so a future report entity (e.g. academic years) can leave a record
  unassociated and associate it later without schema change.

## De-duplication rule

Implemented in `artifacts/api-server/src/lib/contributionModel.ts`
(`computeEstimateActualReconciliation`).

Within one **(user, reporting year)**, for each **activity id** that appears in
BOTH `annual_estimate` rows and `quick_log` rows:

- the report can show *"Estimated: X / Logged so far: Y"* (per-activity detail
  is returned by the helper and exposed on the recap response as
  `estimateVsLogged`), and
- the headline total counts the activity **once — the greater of estimate vs
  logged-so-far** (validated against existing calculations: equivalent to
  subtracting the overlap `min(estimate, logged)` from the raw sum).

Excluded hours also surrender their derived NLW (£12.21/hr) and
personal-development (£15/hr) components, since those live inside every stored
`totalValue`. Donations follow the same max rule at the year level. Records of
any other kind never participate, so an all-`legacy` dataset produces a zero
adjustment — regression tests assert historical aggregation is unchanged
(`tests/contributionModel.test.ts`).

Applied to: personal recap (`/recap/:year`), dashboard year-over-year (`/yoy`),
year-rollover prior-year totals, org stats (`computeOrgStats`), org PDF totals,
and verified org totals (`getVerifiedTotalsForOrg`) — grouped per member.
The reconciliation also applies to the org REST API (`GET /v1/org/stats`) and
the public org share page (summary totals, category split, and per-region
totals in `src/routes/org-share.ts`), the public member profile + embeddable
widget (`src/routes/public-profile.ts` — headline hours/SROI, verified-hours
subset, category-hours and top-SDG maps), and the monthly digest email
(`src/lib/digestData.ts` — month totals and cumulative totals), and the
onboarding email activity summary (`src/scripts/onboarding-emails.ts`).
The org *monthly timeline* intentionally keeps raw per-month sums: it shows
logging cadence, while all headline/period totals are reconciled.

## Migration approach

- Numbered SQL migration `lib/db/migrations/0043_…` (runner:
  `lib/db/src/migrate.ts`). Dev DB has drizzle-push drift, so the migration is
  also applied to dev via psql with SQL matching the schema exactly.
- Production picks the migration up on next publish (prod DB is not writable
  from dev).
- No data rewrite beyond backfilling `reporting_year` from `entry_date`;
  `kind` defaults keep all history `legacy`.
