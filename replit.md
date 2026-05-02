# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Hosts the **My Impact** web application — a personal social value calculator aimed at younger users (16-35), powered by Social Value Engine proxy library data.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite + Tailwind CSS + framer-motion + recharts

## My Impact App

A 3-step wizard that calculates a user's personal social value in GBP:

1. **Actions** — freetext description of what you do for others
2. **Activities** — select from Social Value Engine proxy library (20+ activities across 5 categories)
3. **Contributions** — donations (£) and additional volunteering hours

**Results page** shows:
- Total social value and 4 breakdown metrics (Impact, Contribution, Donations, Personal Development)
- Donut charts by activity and by SDG (Sustainable Development Goal)
- Plain-English accordion explanations of each metric
- Save to history and get activity suggestions

**Additional pages**:
- `/history` — progress tracker showing impact over time, with employer match overlay (matched £ per record + lifetime matched stat)
- `/suggestions` — personalised activity ideas to boost impact
- `/recap` — Spotify-Wrapped-style annual recap (year-in-review). Authenticated. Optional `?year=YYYY` query param. 6–8 step tap-to-advance experience with PNG share card export (portrait + landscape). Backed by `GET /api/impact/recap/{year}` which aggregates totals, top SDG, top activity, biggest session, and journal highlight. Discovery banners shown on home (`Intro`) and `/profile` during the Nov 15 – Jan 31 window; dismissable per year via localStorage; always re-openable from `/settings`. Respects a per-user £/hours toggle (`mi-recap-show-money` localStorage key).
- `/org-portal` — org manager dashboard (analytics, PDF report, **Match programme**: set £/hour and donation multipliers, monthly cap per member, total commitment, CSV export)

### Calculation logic (`artifacts/api-server/src/lib/impactData.ts`)

- **Impact value**: activity quantity × Social Value Engine proxy value per unit
- **Contribution value**: total hours × £12.21 (National Living Wage)
- **Donations value**: direct monetary amount
- **Personal Development value**: based on hours²  × rate (skill gain formula)

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/         # Express API server
│   │   └── src/
│   │       ├── lib/impactData.ts    # SVE proxy library + calculation engine
│   │       └── routes/impact.ts    # Impact API routes
│   └── my-impact/          # React + Vite frontend
│       └── src/
│           ├── pages/
│           │   ├── Intro.tsx
│           │   ├── Results.tsx
│           │   ├── History.tsx
│           │   ├── Suggestions.tsx
│           │   └── wizard/
│           │       ├── ActionsStep.tsx
│           │       ├── ActivitiesStep.tsx
│           │       └── ContributionsStep.tsx
│           ├── components/
│           │   ├── layout/Navbar.tsx
│           │   └── wizard/StepProgress.tsx
│           └── lib/wizard-context.tsx  # Shared wizard state
├── lib/
│   ├── api-spec/openapi.yaml    # API contract
│   ├── api-client-react/        # Generated React Query hooks
│   ├── api-zod/                 # Generated Zod schemas
│   └── db/
│       └── src/schema/impact.ts  # impact_records table
└── scripts/
```

## Authentication

Magic link authentication via Resend (no passwords):

- **Flow**: User enters email → receives magic link → clicks link → lands on confirm page → clicks button → session issued
- **Two-step token design**: Token is validated on page load (`/api/auth/verify`) but only consumed on button click (`/api/auth/confirm`), preventing email pre-fetcher bots from burning the token
- **Session**: JWT stored in an `httpOnly` cookie (`mi_session`), 30-day expiry
- **DB tables**: `users` (id, email, created_at), `magic_tokens` (token, user_id, expires_at, used_at, confirmed), `user_profiles` (includes `email_opt_in` flag controlling onboarding + monthly digest), `onboarding_email_sends` (idempotency log for the Day 1 / 7 / 30 nurture sequence)
- **Protected routes** (frontend): `/history`, `/journal`, `/badges`, `/org` — unauthenticated users redirected to `/login`
- **Protected routes** (backend): `POST /api/impact/save`, `GET /api/impact/history` — require valid session cookie, use `req.user.id` as userId
- **Auth context** (`lib/auth-context.tsx`): calls `/api/auth/me` on load to restore session; provides `isLoggedIn`, `user`, `isLoading`, `requestMagicLink()`, `logout()`
- **Frontend pages**: `/login` (email form), `/auth/confirm?token=...` (confirm button)
- **Resend integration**: connected via Replit connector; client created fresh per request via `getUncachableResendClient()`

## API Endpoints

- `GET /api/auth/me` — returns current user from JWT cookie (or `{user: null}`)
- `POST /api/auth/request` — send magic link email to given address
- `GET /api/auth/verify?token=...` — validate token (does not consume it)
- `POST /api/auth/confirm` — consume token, issue session cookie
- `POST /api/auth/logout` — clear session cookie
- `GET /api/profile` / `PUT /api/profile` — situation, interests, postcode, and `emailOptIn`
- `PATCH /api/profile/email-opt-in` — flip the single opt-in flag that controls onboarding + monthly digest
- `GET /api/impact/activities` — list of 20+ SVE activities with proxy metadata
- `POST /api/impact/calculate` — calculate social value from activities + donations
- `POST /api/impact/suggestions` — get recommended activities based on current activities
- `POST /api/impact/save` — save impact record to database (requires auth)
- `GET /api/impact/history` — retrieve historical records for authenticated user
- `GET /api/impact/org-stats` — aggregate stats for org portal
- `POST /api/sidekick/chat` — streaming AI chat endpoint (SSE), uses OpenAI via Replit AI Integrations

## Sidekick AI

A collapsible right-side panel (SVE-style) providing contextual AI assistance:
- Powered by OpenAI via Replit AI Integrations (`lib/integrations-openai-ai-server`)
- Collapses to 48px strip with vertical "SIDEKICK" label; expands to 380px chat panel
- Context-aware: passes user's current impact score, activities, and SDGs to the AI
- System prompt: social value expert, warm/encouraging tone for 14-25 age group
- Component: `artifacts/my-impact/src/components/Sidekick.tsx`
- Route: `artifacts/api-server/src/routes/sidekick.ts`

## TypeScript & Composite Projects

- **Always typecheck from the root** — run `pnpm run typecheck`
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array

## Public Profile Feature

Users can publish a shareable public profile at `/profile/:slug`:

- **DB table**: `public_profiles` (userId PK, slug unique, isEnabled, customMessage, showHours, showSroi, showCategories, showJournalHighlights, slugCustomised)
- **Migration**: `lib/db/migrations/0004_public_profile.sql`
- **API routes** (`artifacts/api-server/src/routes/public-profile.ts`):
  - `GET /api/public-profile/me` — fetch own settings (auth required)
  - `POST /api/public-profile/enable` — enable and auto-generate slug (auth required)
  - `PUT /api/public-profile` — update settings/disable/re-enable (auth required)
  - `GET /api/public-profile/check-slug/:slug` — slug availability check (auth required)
  - `GET /api/public-profile/:slug` — public page data (no auth, rate-limited 30 req/min/IP)
- **Settings UI**: `PublicProfileSettings.tsx` embedded in `/settings` page
- **Public page**: `PublicProfile.tsx` at `/profile/:slug` (no auth required)
- **GDPR**: users must acknowledge publishing implications before enabling
- **Disabling**: profile immediately returns 404 (no caching lag)
- **Account deletion**: ON DELETE CASCADE removes public profile
- **Slug rules**: 3-30 chars, lowercase alphanumeric + hyphens, no reserved words, customisable once
- **Rate limiting**: in-memory per-IP rate limit (30 req/60s) on public endpoint

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API client from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push schema changes to database

## Database Backups

The DB is dumped via `pg_dump` and uploaded to App Storage under `backups/` with
a timestamped filename (`myimpact-db-backup-YYYY-MM-DDThhmm.sql`).

Scripts (in `artifacts/api-server/src/scripts/backup-db.ts`):

- `pnpm --filter @workspace/api-server run backup:db` — one-off manual backup.
  Optional flags: `--gzip` (also write a local `.gz` copy), `--prune --keep N`
  (delete older snapshots, keeping the latest N), `--notify --notify-email <addr>`
  (email a summary via Resend; falls back to `BACKUP_NOTIFY_EMAIL`).
- `pnpm --filter @workspace/api-server run backup:scheduled` — used by the
  weekly scheduled deployment. Equivalent to
  `backup:db --prune --keep 12 --notify` and reads the recipient address from
  the `BACKUP_NOTIFY_EMAIL` environment variable.
- `pnpm --filter @workspace/api-server run backup:fetch [filename]` — list
  backups in App Storage and download the latest (or a specific one) to
  `/tmp/myimpact-backups/`.

### Scheduled weekly backup (production)

The api-server is published as an `autoscale` deployment, so the weekly backup
runs as a **separate Scheduled Deployment** in the same project:

1. In the Publishing tool, create a new deployment and choose
   **Scheduled** as the deployment type.
2. **Schedule:** weekly, e.g. `0 2 * * 0` (Sundays at 02:00 UTC).
3. **Build command:** `pnpm install --frozen-lockfile`
4. **Run command:** `pnpm --filter @workspace/api-server run backup:scheduled`
5. **Environment variables** (set on the scheduled deployment):
   - `DATABASE_URL` — production database URL (same as the autoscale deployment)
   - `PRIVATE_OBJECT_DIR` — production App Storage dir (same as autoscale)
   - `RESEND_API_KEY` — for email notifications (same as autoscale)
   - `BACKUP_NOTIFY_EMAIL` — recipient address for the success/failure summary

Behaviour each run:

- A new timestamped snapshot is uploaded to `backups/` in App Storage.
- Older snapshots are pruned so only the **latest 12 weeks** are retained.
  Adjust by editing the `--keep` value in the `backup:scheduled` script.
- An email is sent to `BACKUP_NOTIFY_EMAIL` with the object key, size, table
  count, and total rows (or a failure email with the error if `pg_dump` /
  upload fails).

## Monthly Email Digest

Personalised monthly recap email sent via Resend on the 1st of each month
to opted-in users. Covers the previous calendar month: total social value,
hours, top activity, top SDG, donations, all-time totals, any new
milestones earned, and the most recent journal highlight, with a "Log
this month" CTA back to the wizard and one-click unsubscribe.

Schema (in `users` table):

- `email_digest_opt_in` (boolean, default `true`) — new users auto opt-in.
- `unsubscribe_token` (text, unique, lazily generated on first send).
- `last_digest_sent_at` (timestamp) — used by `--skip-recently-sent` to
  dedupe within the same calendar month.

User opt-out paths:

- One-click unsubscribe link in the email footer →
  `GET /api/auth/unsubscribe?token=...` flips opt-in to false and shows a
  branded confirmation page (no session required, idempotent).
- Settings page (`/settings` → "Email" section) toggle, backed by
  `PATCH /api/auth/me { emailDigestOptIn: boolean }`.

Files:

- `artifacts/api-server/src/lib/digestData.ts` — payload builder
  (`buildMonthlyDigest`, `previousMonthRange`).
- `artifacts/api-server/src/lib/digestEmail.ts` — HTML + plain-text
  templates (brand colour `#F06127`).
- `artifacts/api-server/src/lib/badges.ts` — server-side mirror of the
  frontend badge engine, used to diff "newly earned this month".
- `artifacts/api-server/src/scripts/send-monthly-digest.ts` — dispatcher.
- Frontend toggle: `artifacts/my-impact/src/pages/Settings.tsx` (Email
  section).

Dispatcher scripts:

- `pnpm --filter @workspace/api-server run digest:send` — manual run.
  Optional flags: `--dry-run`, `--user-email <addr>` (target a single
  user), `--batch-size <n>` (default 25), `--batch-delay-ms <n>`
  (default 1000), `--notify --notify-email <addr>` (operator summary
  via Resend, falls back to `BACKUP_NOTIFY_EMAIL`).
- `pnpm --filter @workspace/api-server run digest:scheduled` — used by
  the monthly scheduled deployment. Equivalent to
  `digest:send --skip-recently-sent --notify`.

Behaviour each run:

- Loads users where `email_digest_opt_in = true` AND who have at least
  one `impact_records` row (so brand-new accounts don't get an empty
  recap until they've logged something).
- Skips users with no activity in the target month (the "first digest
  only after first session" rule).
- Sends in batches with one automatic retry per email on transient
  Resend errors, then updates `last_digest_sent_at`.
- Logs `sent / skipped / failed` summary; with `--notify`, emails the
  same summary (plus first 25 failures) to the operator.

### Scheduled monthly digest (production)

Published as a **separate Scheduled Deployment** in the same project
(alongside the weekly backup):

1. In the Publishing tool, create a Scheduled Deployment.
2. **Schedule:** monthly on the 1st, e.g. `0 8 1 * *` (08:00 UTC).
3. **Build command:** `pnpm install --frozen-lockfile`
4. **Run command:** `pnpm --filter @workspace/api-server run digest:scheduled`
5. **Environment variables** (must mirror the autoscale deployment):
   - `DATABASE_URL`, `RESEND_API_KEY`, `SESSION_SECRET`, `APP_URL`
     (used to build the CTA + unsubscribe links — required), and
     `BACKUP_NOTIFY_EMAIL` for the operator summary.

## Onboarding Email Sequence

Three transactional emails sent on Day 1, Day 7 and Day 30 after a magic-link
sign-up. Lives in `artifacts/api-server/src/lib/onboardingEmails.ts` (templates)
and `artifacts/api-server/src/scripts/onboarding-emails.ts` (dispatcher).

- **Eligibility**: user signed up via magic link (has a `confirmed = true` row
  in `magic_tokens`), `user_profiles.email_opt_in = true`, not a demo persona
  (`demo@demo.org`, `volunteer@volunteer.org`, etc.), and no existing row in
  `onboarding_email_sends` for the same step.
- **Idempotency**: a unique index on `(user_id, step)` plus a claim-then-send
  pattern means re-running the dispatcher in the same day cannot double-send.
- **Personalisation**: Day 7 splits into "look what you've already done" if
  the user has at least one impact record, otherwise a gentle "still here when
  you're ready". Day 30 surfaces total hours, total social value, record count
  and top category from `impact_records`.
- **Opt-out**: the "Onboarding emails" toggle in `/settings` flips
  `user_profiles.email_opt_in`. The Monthly Email Digest above has its own
  separate toggle (`users.email_digest_opt_in`) — they are independent so
  users can keep one and drop the other.
- **Run**: `pnpm --filter @workspace/api-server run onboarding:emails`. Intended
  to be wired up as a daily Scheduled Deployment (same setup as the weekly
  backup, but cron `0 9 * * *`).
