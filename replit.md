# Overview

The My Impact web application is a pnpm workspace monorepo designed to help users aged 16-35 quantify and understand their social value. By leveraging Social Value Engine proxy data, the platform allows individuals to track activities, calculate their societal contributions in monetary terms, analyze historical impact, and receive personalized suggestions for increasing their positive influence. Key features include a 3-step social value calculation wizard, impact breakdowns, SDG visualizations, calendar synchronization, public profiles, and an organizational portal for managers. The project aims to empower users to recognize and enhance their social contributions, fostering a greater sense of purpose and engagement.

# User Preferences

I prefer iterative development and welcome early feedback. Please use clear and concise language in your explanations. For significant changes or architectural decisions, please ask for approval before proceeding. Ensure all code is well-documented and follows best practices for maintainability and readability. Do not make changes to the `lib/api-spec/openapi.yaml` file.

# System Architecture

The project is structured as a pnpm monorepo, utilizing TypeScript (v5.9). The backend is an Express 5 API server, using PostgreSQL with Drizzle ORM for data persistence and Zod for validation. API client code is generated from an OpenAPI spec using Orval. The frontend is built with React, Vite, Tailwind CSS, framer-motion, and recharts, featuring a 3-step wizard UI.

**Core Architectural Decisions & Features:**

*   **Impact Calculation:** Social value is calculated based on activity quantity (Social Value Engine proxy), total hours (£12.21/hour), direct donations, and a skill gain formula for personal development value.
*   **Authentication:** Implemented via magic link authentication using Resend. Sessions are managed with JWTs in `httpOnly` cookies. Enterprise SSO (OIDC) via Google Workspace or Microsoft Entra is available for organizations, configured per email domain.
*   **Calendar Sync:** Integration with Google Calendar and Microsoft Outlook allows users to sync events, which are then upserted into `calendar_events`.
*   **Public Profile:** Users can create shareable public profiles at `/profile/:slug`, with settings for visibility and content managed through the `public_profiles` table.
*   **Sidekick AI:** A collapsible, context-aware AI assistant, powered by OpenAI, provides guidance with a warm, encouraging tone, leveraging user impact data.
*   **Email Systems:** Includes a monthly digest for opted-in users and a three-email onboarding sequence (Day 1, 7, 30) after sign-up, both managed via Resend.
*   **Data Structure:** Monorepo organization with `artifacts/api-server` for the backend, `artifacts/my-impact` for the frontend, and `lib/` for shared components.
*   **Deployment:** Utilizes Replit Scheduled Deployments for recurring tasks like weekly database backups and monthly email digests.
*   **Challenges Feature:** Supports creation of personal or organizational challenges with invite codes and leaderboards, tracking impact records within a defined period.
*   **Funnel Analytics:** Internal, privacy-first analytics layer (no third-party SaaS, no PII) recording named events to the `analytics_events` table with separate `member` and `org` surfaces. Powers admin-only funnel dashboards (signup→first log, wizard completion, D1/D7/D30 retention) at `/admin`. See `artifacts/api-server/src/lib/ANALYTICS.md` for the event catalogue and how to add new events.

# External Dependencies

**Additional pages**:
- `/history` — progress tracker showing impact over time, with employer match overlay (matched £ per record + lifetime matched stat)
- `/suggestions` — personalised activity ideas to boost impact
- `/recap` — Spotify-Wrapped-style annual recap (year-in-review). Authenticated. Optional `?year=YYYY` query param. 6–8 step tap-to-advance experience with PNG share card export (portrait + landscape). Backed by `GET /api/impact/recap/{year}` which aggregates totals, top SDG, top activity, biggest session, and journal highlight. Discovery banners shown on home (`Intro`) and `/profile` during the Nov 15 – Jan 31 window; dismissable per year via localStorage; always re-openable from `/settings`. Respects a per-user £/hours toggle (`mi-recap-show-money` localStorage key).
- `/org-portal` — org manager dashboard (analytics, PDF report, **Match programme**: set £/hour and donation multipliers, monthly cap per member, total commitment, CSV export, **Enterprise SSO**: configure Google Workspace / Microsoft Entra per-domain with optional enforcement)

Magic link authentication via Resend (no passwords):

- **Flow**: User enters email → receives magic link → clicks link → lands on confirm page → clicks button → session issued
- **Two-step token design**: Token is validated on page load (`/api/auth/verify`) but only consumed on button click (`/api/auth/confirm`), preventing email pre-fetcher bots from burning the token
- **Session**: JWT stored in an `httpOnly` cookie (`mi_session`), 30-day expiry
- **DB tables**: `users` (id, email, created_at), `magic_tokens` (token, user_id, expires_at, used_at, confirmed), `user_profiles` (includes `email_opt_in` flag controlling onboarding + monthly digest), `onboarding_email_sends` (idempotency log for the Day 1 / 7 / 30 nurture sequence), `org_sso_configs` (per-org/per-domain SSO provider configuration)
- **Protected routes** (frontend): `/history`, `/journal`, `/badges`, `/org` — unauthenticated users redirected to `/login`
- **Protected routes** (backend): `POST /api/impact/save`, `GET /api/impact/history` — require valid session cookie, use `req.user.id` as userId
- **Auth context** (`lib/auth-context.tsx`): calls `/api/auth/me` on load to restore session; provides `isLoggedIn`, `user`, `isLoading`, `requestMagicLink()`, `logout()`
- **Frontend pages**: `/login` (email form, with debounced SSO lookup that surfaces the Continue-with-Google / Microsoft button or an "SSO required" notice as appropriate), `/auth/confirm?token=...` (confirm button)
- **Resend integration**: connected via Replit connector; client created fresh per request via `getUncachableResendClient()`

## API Endpoints

- `GET /api/auth/me` — returns current user from JWT cookie (or `{user: null}`)
- `POST /api/auth/request` — send magic link email to given address. Returns `403 { ssoRequired, ssoProvider, ssoAvailable }` when the email's domain has `enforceSSO=true`
- `GET /api/auth/verify?token=...` — validate token (does not consume it)
- `POST /api/auth/confirm` — consume token, issue session cookie
- `POST /api/auth/logout` — clear session cookie
- `GET /api/auth/sso/providers` — list providers with platform credentials configured
- `GET /api/auth/sso/lookup?email=…` — returns `{ sso: { provider, domain, enforce, available } | null }` for an email
- `GET /api/auth/sso/:provider/start` — begin OIDC sign-in flow (sets HMAC-signed state cookie)
- `GET /api/auth/sso/test/start` — manager-only "test sign-in" flow used by the Org Portal to verify a config
- `GET /api/auth/sso/:provider/callback` — exchange code, verify id_token via JWKS, auto-create user, link as org member, issue `mi_session`
- `GET /api/profile` / `PUT /api/profile` — situation, interests, postcode, and `emailOptIn`
- `PATCH /api/profile/email-opt-in` — flip the single opt-in flag that controls onboarding + monthly digest
- `GET /api/impact/activities` — list of 20+ SVE activities with proxy metadata
- `POST /api/impact/calculate` — calculate social value from activities + donations
- `POST /api/impact/suggestions` — get recommended activities based on current activities
- `POST /api/impact/save` — save impact record to database (requires auth)
- `GET /api/impact/history` — retrieve historical records for authenticated user
- `GET /api/impact/org-stats` — aggregate stats for org portal
- `POST /api/sidekick/chat` — streaming AI chat endpoint (SSE), uses OpenAI via Replit AI Integrations
- `POST /api/challenges` — create a group/team challenge (personal or org-scoped)
- `GET /api/challenges/mine` — list challenges the current user owns or participates in
- `GET /api/challenges/by-code/:code` — preview a challenge by invite code
- `GET /api/challenges/:id` — full challenge with progress + leaderboard
- `POST /api/challenges/join` — join via invite code
- `POST /api/challenges/:id/leave` — leave a challenge (owners cannot leave)
- `DELETE /api/challenges/:id` — owner deletes their challenge
- `POST /api/challenges/:id/send-summary` — owner emails end-of-challenge summary
- `GET /api/org/sso/config` — manager-only: list SSO configs for the manager's org
- `POST /api/org/sso/config` — manager-only: upsert an SSO config for a domain (provider, tenant ID, enforce flag)
- `DELETE /api/org/sso/config/:id` — manager-only: remove an SSO config

### Pulse surveys (Task #148)
- Schema: `orgSurveysTable`, `orgSurveyResponsesTable`, `orgSurveyOptOutsTable` in `lib/db/src/schema/org.ts`; migration `lib/db/migrations/0011_org_pulse_surveys.sql`
- Routes: `artifacts/api-server/src/routes/org-surveys.ts` mounted under `/api/org` — manager CRUD + results, member active/respond/opt-out
- Templates: meaningfulness, wellbeing, custom; cadences: one_off / monthly / quarterly (window keys: `once`, `YYYY-MM`, `YYYY-Qn`)
- UI: `PulseSurveysSection` (manager card in OrgPortal between stats and Match), `PulseSurveyCard` (home-page member prompt with localStorage dismiss), opt-out toggle in `Settings` Organisation section
- Privacy: anonymous by default; comments hidden in manager view until a window has 5+ responses

### Challenges feature
- Schema: `challengesTable` + `challengeParticipantsTable` (`lib/db/src/schema/challenges.ts`, migration `0008_challenges.sql`)
- Routes: `/challenges` (list), `/challenges/:id` (detail), `/challenges/join?code=XYZ` (public join page)
- Personal scope: invite-only via 8-char code; org scope: created by managers, all current org members auto-added
- Records contributing to the total are filtered to those created between `startDate` and `endDate`
- End-of-challenge celebration card shows on detail when ended; owner can send a one-time email summary via Resend

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

*   **Monorepo Tool:** pnpm workspaces
*   **API Framework:** Express 5
*   **Database:** PostgreSQL
*   **Email Service:** Resend (via Replit Connector)
*   **Calendar Integration:** Google Calendar (via Replit Connector), Microsoft Outlook (via Replit Connector)
*   **AI Integration:** OpenAI (via Replit AI Integrations)
*   **Social Value Data:** Social Value Engine proxy library