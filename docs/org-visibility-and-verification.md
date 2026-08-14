# Org visibility, twins & verification states

Findings and decisions for aligning organisation sharing, twin records,
verification wording and webhook payloads with the contribution model
(activity date + structured location), without changing any organisation's
configured visibility behaviour.

## Visibility modes (unchanged semantics)

- `consented_logging` (automatic visibility): a member's logged activity is
  shared with the org automatically within their consent window. The
  post-log UI no longer asks "Share with organisation?" — it shows an
  informational note: "This activity will be visible to [Org]".
- `explicit_submission`: nothing reaches the org's named feed unless the
  member submits it. The post-log UI asks the share question and routes to
  the full submission flow (`/org/submit`). The personal Impact Report keeps
  the activity either way.

Internal mode names and each org's configured mode are untouched.

The previous inline share flow on the Results page (removed in the earlier
share-flow overhaul and left unmounted) was **not** reinstated: it created an
org copy that was not twin-linked to the wizard's personal save, so explicit
orgs — whose aggregates include all members' personal records — could
double-count. The share question now routes to `/org/submit`, which links
personal copies via `resultJson.orgRecordId`.

## Verification states — audit & compatibility review

Three distinct states now flow through manager surfaces as
`verificationStatus`:

| State | Meaning |
| --- | --- |
| `submitted` | Self-reported / awaiting review (no verification row) |
| `approved` | Organisation approved — manual manager decision **or** auto-verify orgs (reason `member-submitted` / `auto-verified`) |
| `verified` | Pre-attested — pushed via the org REST API with an org API key (`attested_at` set) |

Audit findings:

- Server-side, member submissions were **never** unconditionally verified:
  an approved `record_verifications` row is only created when the org has
  `autoVerifyActivities` enabled; otherwise the record waits in the pending
  queue. The task brief's "instantly marked verified" applied only to
  auto-verify orgs (intended behaviour, preserved).
- The real offender was labelling: the Org Portal panel titled **all**
  member submissions "Verified records / Auto-accepted" regardless of state.
  That panel is now "Organisation records" with a per-row state chip.
- `/api/org/activities` and `/api/org/member-submissions` now return
  `verificationStatus` alongside the legacy `verified` boolean
  (= approved OR attested), which is retained for compatibility — the
  Activity feed CSV keeps its "Verified" Yes/No column and gains a
  three-state "Status" column.
- Member-facing "Verified by {org}" chips (History, Results, PublicProfile)
  are driven by real approved verification rows, not auto-labels, so they
  were left unchanged for compatibility; exports likewise keep existing
  columns. No customer-visible totals changed.

## Twin strategy — assessment: keep twins

Investigated replacing the org-twin personal copy with a reference to the
canonical contribution for new entries. Decision: **keep twins** with
double-count protection.

**Why:** the org copy and the personal copy legitimately differ — the org
copy is Activities-only (custom "something_else" hours valued without an SVE
proxy), carries org-specific fields (`submittedToOrgId`, evidence links,
verification rows) and can be withdrawn by a manager without deleting the
member's personal history. A single canonical record would need per-viewer
recomputation in every reporting surface (stats, exports, PDFs, digests,
matches) and would break withdraw/edit semantics. Existing protection is
robust: new personal copies carry an explicit `resultJson.orgRecordId` link
and `notOrgTwinCondition` excludes them (plus a legacy date+activities
fallback for old rows). Regression coverage lives in
`artifacts/api-server/tests/orgSharing.test.ts` and
`orgMemberSubmit.test.ts` (twin link on personal copies).

## Org reporting dimensions

`GET /api/org/stats/breakdown?dimension=<d>` (manager-only) groups the org's
shared records by: `month`, `town`, `postcode_area`, `local_authority`,
`region`, `category`, `sdg`, `proxy` — using `entry_date` and
`location_json` (flat `region`/`outward_code` as legacy fallback). Member
groups are not a supported concept in the schema, so no member-group
dimension. Every dimension reports the same social-value / hours metrics as
the monthly view: record-level dimensions sum the stored record totals
directly, and the line-level dimensions (`category`, `sdg`, `proxy`)
allocate each record's full stored totals pro-rata across its activity
lines (value by line `impactValue`, hours by line `hours`; equal split when
all lines are zero; records without lines land in "Unknown") so column
totals always match the record-level views. The
estimate-vs-actual reconciliation excess is returned separately as
`reconciliation` and surfaced as a note — it is never re-summed into a row.
Exposed in the manager Activity feed page as a "Reporting breakdown" panel
with CSV download.

## Webhook payloads

`hours.logged` (and `hours.attested` for org-API pushes) now additionally
carry: `activityDate` (ISO date), `location` (general area only — mode,
townCity, localAuthority, region, country, and the postcode area letter
prefix; the full postcode, venue label, and lat/lng coordinates are NEVER
sent to organisations, matching the member-facing disclosure — or null),
`kind` (contribution kind), `reportingYear`, `recurrenceSource`
(`{ habitTemplateId }` or null) and `verificationStatus`. Existing fields —
including the member-submit path's legacy `attested: true` — are preserved
for consumer compatibility; the three-state truth is `verificationStatus`.

Webhook visibility gating: `/api/impact/save` emissions follow the same
visibility predicate as dashboards/exports/breakdowns. For
`consented_logging` orgs the event (including the new date/location
metadata) is only sent when the member has an ACTIVE consent and the
activity date falls inside their `shareFrom` window; revoked orgs never
receive events. For `explicit_submission` orgs the event fires as before —
under that mode's documented legacy semantics all active members' records
are already org-visible in aggregates, so the webhook discloses nothing the
dashboard does not. The post-log banner copy was written to match this:
it does not claim the org sees only submitted activity.

The reporting breakdown endpoint intentionally reuses
`sharedRecordsCondition` — the identical predicate behind the existing
monthly/regions stats, dashboards and exports — so it exposes no record that
those surfaces don't already include; changing either mode's visibility
semantics was explicitly out of scope.

Forecast guarantee: webhooks only fire when a record is actually created
(`/api/impact/save`, `/api/org/member-submit`, `/api/v1/org/hours`).
Projected/forecast quantities (recurring-template projections) never create
records and therefore never emit. `kind: "annual_estimate"` payloads are the
member's own annualised estimate, flagged via `kind` so consumers can treat
them separately.

Org-API pushes also now persist `entry_date = occurredAt`, keeping period
and location reporting consistent with the already-`occurredAt`-based
`reporting_year`.
