# Funnel analytics

My Impact ships a small, privacy-first analytics layer used to power the
internal funnel and retention dashboards on the `/admin` page. It is
deliberately self-hosted: no third-party SaaS receives event data, and **no
PII is ever stored beyond the optional `users.id` foreign key** that already
identifies the row's owner internally.

This document is the source of truth for what we track, where it fires, and
how to extend it.

---

## Architecture

```
  Browser (artifacts/my-impact)        API server (artifacts/api-server)        Postgres
  ─────────────────────────────        ──────────────────────────────────        ────────────
  src/lib/analytics.ts                 src/lib/analytics.ts                      analytics_events
       │ track(event, props)                │ trackServerEvent({ ... })          ─────────────────
       ▼                                    ▼                                    id
  POST /api/analytics/track ────►      sanitise + decode session ────────►       event_name
                                                                                 user_id  (FK, nullable)
                                                                                 surface  ('member' | 'org')
                                                                                 props    (jsonb)
                                                                                 created_at
```

- Client events go through `POST /api/analytics/track`. The server
  attaches the user id when a session cookie is present (so guests can
  still emit `page_view`), sanitises props, and writes one row.
- Server-side events (signup, first record, public profile view, org
  invite accepted) call `trackServerEvent()` directly.
- `surface` is either `member` or `org`. Member-side and org-side funnels
  are reported separately in the admin dashboard so cross-contamination
  between the two products doesn't skew the numbers.
- Everything is fire-and-forget — analytics failures never break a
  user-facing request.

## What we track

The full list lives in `ANALYTICS_EVENTS` in both
`artifacts/api-server/src/lib/analytics.ts` and
`artifacts/my-impact/src/lib/analytics.ts`. The two lists must stay in
sync; the server validates the name on every ingest.

| Event                   | Surface       | Where it fires                                                             | Notes                                                                 |
| ----------------------- | ------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `page_view`             | member or org | `usePageViewTracking` on every authenticated route change                  | Org-dashboard pages emit with `surface: org`                          |
| `signup_complete`       | member        | `POST /api/auth/confirm` on the user's first-ever confirmation             | Detected by checking for any prior `confirmed=true` magic token       |
| `wizard_step_complete`  | member        | `ActionsStep`, `ActivitiesStep`, `ContributionsStep` after a successful next | `props.step` is `actions` \| `activities` \| `contributions`          |
| `first_record_logged`   | member        | `POST /api/impact/save` on the user's first impact record                   | Snapshot of impact records is taken **before** the insert             |
| `milestone_earned`      | member        | `Milestones` page on first render of each newly-earned badge               | Deduped per browser via `localStorage` so refresh doesn't double-count |
| `sidekick_message_sent` | member        | `Sidekick.sendMessage`                                                     | `props.fromTemplate`, `props.isRegenerate`                            |
| `share_click`           | member        | `Results` share menu and `MilestoneShareModal` buttons                      | `props.channel` is `twitter` \| `linkedin` \| `facebook` \| `native`  |
| `public_profile_view`   | member        | `GET /api/public-profile/:slug`                                            | Logs only the slug — viewer is anonymous by design                    |
| `org_invite_accepted`   | org           | `POST /api/org/join` when not already a member                             | `props.role`, `props.orgType`                                         |

### What we DON'T put in `props`

- Email addresses, names, postcodes, free-text input, journal text, or
  Sidekick prompts/replies. The server sanitiser
  (`sanitiseProps()` in `routes/analytics.ts`) drops any value that
  looks like an email or contains a `token=` URL fragment, caps strings
  at 120 chars, and limits each event to 12 keys.

## Dashboards

The admin page (`/admin`, restricted to the three admin emails) renders:

1. **Signup → first record logged** — five-step funnel showing the full
   onboarding journey from `signup_complete` through to
   `milestone_earned` for the same cohort of users.
2. **Wizard completion** — independent of signup; shows everyone who
   started each wizard step in the window.
3. **Retention D1 / D7 / D30** — for each cohort of new signups in the
   window, the share who emitted any analytics event in the relevant
   day-bucket. Buckets are excluded for cohorts younger than the bucket
   itself, so newly-joined users don't drag the percentage down.
4. **Raw event counts** — every event in the window, split by surface,
   so admins can sanity-check volume even before a funnel is meaningful.

The window selector at the top of the section is `7d / 30d / 90d`.

## Adding a new event

1. Add the event name (lowercase snake_case) to `ANALYTICS_EVENTS` in
   **both** `analytics.ts` files (server and client).
2. Decide on the surface (`member` or `org`).
3. Fire it:
   - From the browser: `track(ANALYTICS_EVENTS.MY_NEW_EVENT, { ... })`
   - From the server: `await trackServerEvent({ eventName: "my_new_event", userId, surface, props })`
4. Choose props carefully — short scalars only, no PII.
5. Add a row to the table in this file.
6. (Optional) If it's part of a new funnel, extend
   `routes/analytics.ts → /admin/funnels` to surface it.

## Schema / migration

The table lives in `lib/db/src/schema/analytics.ts` and is created by
`lib/db/migrations/0011_analytics_events.sql`. It uses `ON DELETE SET
NULL` for `user_id` so that erasing a user account preserves
aggregate counts but removes the link.

---

## Long-term retention & archiving

Raw `analytics_events` and `page_views` rows are deleted after 90 days by
the retention cleanup job (`src/lib/retentionCleanup.ts`). Just before
deletion, the job archives daily aggregate counts — one row per
(day, event_name, surface) — into the `analytics_daily_summary` table,
which is kept forever. Archive + delete run in a single transaction per
table, so a failed run can neither lose data nor double-count.

Legacy `page_views` rows are archived under the event name
`page_view_legacy` so they don't double-count the mirrored `page_view`
analytics events.

`GET /api/analytics/admin/trends` merges the archive with live raw rows
into monthly buckets and powers the "Long-term trends" section on `/admin`.
