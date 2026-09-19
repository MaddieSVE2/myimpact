# Overview

The My Impact web application is a pnpm workspace monorepo designed to help users aged 16-35 quantify and understand their social value. By leveraging Social Value Engine proxy data, the platform allows individuals to track activities, calculate their societal contributions in monetary terms, analyze historical impact, and receive personalized suggestions for increasing their positive influence. Key features include a 3-step social value calculation wizard, impact breakdowns, SDG visualizations, calendar synchronization, public profiles, and an organizational portal for managers. The project aims to empower users to recognize and enhance their social contributions, fostering a greater sense of purpose and engagement.

# User Preferences

I prefer iterative development and welcome early feedback. Please use clear and concise language in your explanations. For significant changes or architectural decisions, please ask for approval before proceeding. Ensure all code is well-documented and follows best practices for maintainability and readability. Do not make changes to the `lib/api-spec/openapi.yaml` file.

**Code safety:** The user lost significant work in May 2026 when code was overwritten. GitHub (MaddieSVE2/myimpact, `main` branch) is the off-site backup; `main` has branch protection (no force pushes, no deletions). Push to GitHub after significant milestones, and never rewrite git history.

**Copy style:** No em dashes (`—`) in any user-facing copy (UI strings, locale catalogues, emails, modals, tooltips). Use commas, full stops, or parentheses instead. Em dashes are fine in code comments and internal docs. Member-facing copy should be plain English: state what is being submitted, when it goes, who sees it, and what value it has.

**Public-page maintenance:** Keep copy concise and remove generic introductory or filler sentences. When adding, renaming, or removing a public page, review the shared footer links and update them in the same change.

# System Architecture

The project is structured as a pnpm monorepo using TypeScript (v5.9). The backend is an Express 5 API server, utilizing PostgreSQL with Drizzle ORM for data persistence and Zod for validation. API client code is generated from an OpenAPI spec using Orval. The frontend is built with React, Vite, Tailwind CSS, framer-motion, and recharts, featuring a 3-step wizard UI.

**Core Architectural Decisions & Features:**

*   **Impact Calculation:** Uses `artifacts/api-server/src/lib/impactData.ts` to calculate social value based on activity quantity (Social Value Engine proxy), total hours (£12.21/hour), direct donations, and a skill gain formula for personal development value.
*   **Authentication:** Magic-link authentication uses Resend, and optional consumer Google sign-in uses the existing `GOOGLE_OIDC_CLIENT_ID` and `GOOGLE_OIDC_CLIENT_SECRET` environment variables. Register `https://<production-app-domain>/api/auth/sso/google/callback` as an authorised Google OAuth redirect URI (and the equivalent development URL when testing locally). The Google option stays hidden when either credential is absent. Consumer Google login starts at `/api/auth/sso/consumer/google/start` and is separate from organisation SSO: it matches a verified email to an existing account or applies the age gate before creating one, without requiring an organisation or work domain. Sessions use JWTs in `httpOnly` cookies. **Enterprise SSO (OIDC):** Org managers can configure Google Workspace or Microsoft Entra SSO per email domain from the Org Portal. Routes live under `/api/auth/sso/*` and `/api/org/sso/config`. When `enforceSSO=true`, magic-link sign-in is blocked for that domain. Organisation SSO retains domain, membership, and verification rules. Tokens are verified against provider JWKS but not stored. Microsoft requires `MICROSOFT_OIDC_CLIENT_ID/SECRET`.
*   **Calendar Sync:** Integration with Google Calendar and Microsoft Outlook (via Replit Connectors) allows users to sync events, which are then upserted into `calendar_events`. Tokens are obtained on demand and not stored. A scheduled worker syncs events and prunes old data. A home page widget displays upcoming events, and an in-app prompt encourages logging matched events.
*   **Public Profile:** Users can create shareable public profiles at `/profile/:slug`. Settings are managed through `public_profiles` table, with API routes for managing visibility and content. Slug generation adheres to specific rules, and the public endpoint is rate-limited.
*   **Sidekick AI:** A collapsible, context-aware AI assistant, powered by OpenAI via Replit AI Integrations. It provides guidance with a warm, encouraging tone, leveraging user impact data. **Voice Mode:** Supports microphone input (transcribed via OpenAI speech-to-text) and spoken assistant replies (via OpenAI TTS). Voice settings (`voice_enabled`, `voice_persona`) are persisted on the `users` table.
*   **Email Systems:** Includes a monthly digest for opted-in users and a three-email onboarding sequence (Day 1, 7, 30) after sign-up, both managed via Resend.
*   **Email Deliverability:** A Resend webhook at `POST /api/email/resend-webhook` (registered before `express.json()` for raw-body Svix signature verification, secret in `RESEND_WEBHOOK_SECRET`) records `email.bounced` / `email.complained` / `email.failed` / `email.suppressed` events into `email_suppressions`. Magic-link requests to a suppressed address return 422 with `emailUndeliverable: true` and the login page shows a dedicated "couldn't deliver" message. The `/admin` panel lists suppressed addresses and can clear one (calls `DELETE https://api.resend.com/suppressions/:email`, then removes the local row; a Resend 404 counts as success). **Webhook registration (one-off, manual):** in the Resend dashboard → Webhooks, add endpoint `https://myimpact.uk/api/email/resend-webhook` subscribed to the bounced/complained/failed/suppressed events, then store the signing secret (starts `whsec_`) as the `RESEND_WEBHOOK_SECRET` secret. Without the secret the endpoint rejects all requests with 503.
*   **Data Structure:** Monorepo organization with `artifacts/api-server` for the backend, `artifacts/my-impact` for the frontend, and `lib/` for shared components like API specifications, generated clients, and database schemas.
*   **Deployment:** Utilizes Replit Scheduled Deployments for recurring tasks like weekly database backups and monthly email digests.
*   **Challenges Feature:** Supports creation of personal or organizational challenges with invite codes and leaderboards, tracking impact records within a defined period.
*   **Funnel Analytics:** Internal, privacy-first analytics layer (no third-party SaaS, no PII) recording named events to the `analytics_events` table with separate `member` and `org` surfaces. Powers admin-only funnel dashboards (signup→first log, wizard completion, D1/D7/D30 retention) at `/admin`. See `artifacts/api-server/src/lib/ANALYTICS.md` for the event catalogue and how to add new events.
*   **Additional Pages:** The application includes dedicated pages for history tracking, personalized activity suggestions, and an annual recap (Spotify-Wrapped style).
*   **Performance Budgets (Lighthouse CI):** Every PR runs `@lhci/cli` against a built preview of `artifacts/my-impact` (`.github/workflows/lighthouse.yml`) in a two-entry matrix: **desktop** and **mobile** (Lighthouse's default Moto G4-class emulation with 4x CPU slowdown and slow-4G throttling). Five routes are audited in both passes — `/`, `/wizard/actions`, `/results`, `/history`, `/profile/demo`. Desktop budgets: performance ≥0.75, accessibility ≥0.95, best-practices ≥0.85, SEO ≥0.85. Mobile budgets: performance ≥0.50 (throttling roughly halves desktop scores; homepage measured ~0.54 in July 2026), other categories same as desktop. Failing budgets block merge and reports are uploaded as separate build artifacts (`lighthouse-reports-desktop-<run-id>` / `lighthouse-reports-mobile-<run-id>`) and to LHCI's temporary public storage. Run locally with `pnpm lhci` (desktop) or `pnpm lhci:mobile` (mobile); `pnpm lhci:open` views the latest HTML reports. Config lives in `lighthouserc.base.cjs` (shared collect/upload) plus `lighthouserc.desktop.cjs` / `lighthouserc.mobile.cjs` (budgets); `lighthouserc.cjs` re-exports the desktop config for tools that don't pass `--config`. Tighten budgets after a deliberate optimisation lands and document any loosening in the PR description. PWA scoring is omitted because Lighthouse 12 dropped the category. The local sandbox has no Chrome installed — local runs require a system Chrome/Chromium.
*   **WCAG AA gate:** Run `pnpm a11y` whenever publishing new or changed public content and pages. It audits every route in `public-routes.json`, the shared source for `PRERENDER_PAGES`, with Lighthouse's automated accessibility checks and requires a 1.0 score. Automated checks supplement, not replace, keyboard, focus, zoom, screen-reader, alt-text, heading-order, and plain-language review.
*   **Bundle Size Budgets:** Every PR also runs a gzip bundle-size check for `artifacts/my-impact` (`.github/workflows/bundle-size.yml`), which builds the app and runs `scripts/check-bundle-size.mjs` against the budgets in `artifacts/my-impact/bundle-budgets.json` (per-chunk caps matched by chunk-name pattern — main entry, PDF worker, org export, recharts, leaflet, etc., a 32 KiB default for route-level lazy chunks, and a total-JS cap). A failing budget blocks merge; the offending chunks and their budgets are printed to the job log and the GitHub step summary. Run locally with `pnpm size` (builds + checks) or `pnpm size:check` (checks the existing `dist`). Tighten budgets after deliberate optimisations; if a budget must be raised, do it in `bundle-budgets.json` and explain why in the PR description.
*   **Push Notifications (PWA):** Web Push (VAPID) is wired end-to-end. Backend lives in `artifacts/api-server/src/lib/push.ts` (`sendPushSafely`, preference + pause checks, auto-prune of 410/404 endpoints) and `src/routes/push.ts` (public-key, subscribe/unsubscribe, preferences GET/PATCH, test). Subscriptions and per-user preferences (master enabled flag, per-trigger toggles for `recurringDue`, `streakAtRisk`, `monthlyDigest`, `challengeEnd`, and `pausedUntil`) are persisted in `push_subscriptions` and `push_preferences`. Frontend uses `src/lib/push-client.ts` and a Settings "Reminders" section (toggles, pause menu, test send). Service worker (`public/service-worker.js`, CACHE v2) handles `push` + `notificationclick` deep-linking. Triggers are dispatched from the monthly digest script and `src/scripts/send-push-reminders.ts` (daily streak-at-risk + recurring-due). VAPID env vars: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. A mobile-first `/quick-log` route uses `getUserMedia` with a file-input fallback for two-tap photo logging.

# Error Monitoring (Sentry)

Sentry is wired into both the frontend (`my-impact`) and backend (`api-server`). The integration gracefully no-ops when env vars are absent so local dev keeps working without any Sentry account.

**Frontend** (`artifacts/my-impact/src/lib/sentry.ts`)
- `initSentry()` runs from `main.tsx` before App renders. Skips init when `VITE_SENTRY_DSN` is not set.
- `setSentryUser({id})` is wired through `auth-context` so the authenticated user id (no email/PII) is attached to all events.
- `captureException(err, ctx)` is called from the App `ErrorBoundary` so React render errors reach Sentry.
- `beforeSend` filters known-benign noise (AbortError, chunk-load errors, ResizeObserver loops, etc.).
- Source maps are uploaded via `@sentry/vite-plugin` only when `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` are set; the plugin is skipped otherwise. Build emits `sourcemap: "hidden"` in that mode and the plugin deletes the `.map` files after upload so they never ship to clients.

**Backend** (`artifacts/api-server/src/lib/sentry.ts`)
- `initSentry()` is the very first import in `src/index.ts` so OpenTelemetry instrumentation hooks Express before it loads.
- `Sentry.setupExpressErrorHandler(app)` is registered after routes (in `app.ts`) followed by a final JSON 500 fallback handler.
- `authenticate` and `attachUserIfPresent` middleware tag the Sentry scope with `{id}` for the request.
- `beforeSend` drops common 4xx (400/401/403/404/409/422/429) and benign network errors (ECONNRESET, EPIPE, AbortError, etc.) and scrubs cookies / Authorization headers from the request snapshot.

**Required env vars** (all optional — Sentry no-ops if missing)
- Frontend: `VITE_SENTRY_DSN`, `VITE_SENTRY_ENVIRONMENT`, `VITE_SENTRY_TRACES_SAMPLE_RATE` (default `0.1`)
- Backend: `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`, `SENTRY_TRACES_SAMPLE_RATE` (default `0.1`)
- Source map upload (build-time only): `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`
- **Release tag**: set `SENTRY_RELEASE` once (e.g. to the git SHA / `$REPLIT_DEPLOYMENT_ID`). The Vite config automatically mirrors it into `VITE_SENTRY_RELEASE` at build time so the runtime event tag and the uploaded source-map release always match. `VITE_SENTRY_RELEASE` only needs to be set explicitly if you want to override on the frontend.

**Operational notes**
- Set `SENTRY_ENVIRONMENT=production` for the deployed app and `preview` for the dev environment.
- Recommended release scheme: tag with the deploy git SHA, e.g. `SENTRY_RELEASE=$REPLIT_DEPLOYMENT_ID` so frontend and backend are tagged consistently.
- Alert routing (new issue + regression → single team inbox) is configured in the Sentry UI per-project; this is a one-time manual step after the DSN is provisioned.

# External Dependencies

*   **Monorepo Tool:** pnpm workspaces
*   **Database:** PostgreSQL
*   **ORM:** Drizzle ORM
*   **Validation:** Zod
*   **API Codegen:** Orval
*   **Email Service:** Resend (via Replit Connector)
*   **Calendar Integration:** Google Calendar (via Replit Connector), Microsoft Outlook (via Replit Connector)
*   **AI Integration:** OpenAI (via Replit AI Integrations)

## Sidekick AI usage controls

The Sidekick chat route (`/api/sidekick/chat`) and meter endpoint
(`/api/sidekick/quota`) are gated by tiered burst → quota → budget
controls (see `artifacts/api-server/src/lib/aiUsage.ts` and
`lib/aiSpendAlert.ts`). All limits are env-var configurable; defaults
are in `aiUsage.ts`.

Per-caller limits (anonymous callers tracked by IP / session cookie):
- `AI_DAILY_LIMIT_ANON` (default `10`) — questions/day for anonymous
- `AI_DAILY_LIMIT_USER` (default `50`) — questions/day for signed-in
- `AI_MONTHLY_TOKEN_LIMIT_ANON` (default `200000`)
- `AI_MONTHLY_TOKEN_LIMIT_USER` (default `1500000`)
- `AI_INFLIGHT_AVG_TOKENS` (default `8000`) — reservation size used to
  close the parallel-burst race window
- `AI_BURST_PER_IP_PER_MIN` (default `10`)
- `AI_BURST_PER_USER_PER_MIN` (default `30`)

Spend alerting (daily cron, 24h cooldown persisted in
`ai_alert_state`):
- `AI_BUDGET_ALERT_USD` (default `50`) — month-to-date estimate that
  triggers the alert email
- `AI_GPT5_MINI_INPUT_PRICE_PER_1K` (default `0.00025`)
- `AI_GPT5_MINI_OUTPUT_PRICE_PER_1K` (default `0.002`)
- `ADMIN_EMAILS` — comma-separated list of admin email recipients;
  merged on top of the hard-coded admin allowlist in
  `routes/admin.ts` (used by both budget alerts and the
  `GET /api/admin/ai-usage` report)

Token usage is captured from OpenAI's `stream_options.include_usage`
final chunk and persisted in the `ai_usage` table grouped by
`(user_key, date, model)`. No prompt or tool-input contents are ever
logged.
*   **Social Value Data:** Social Value Engine proxy library
*   **Web Push:** `web-push` library with VAPID keys (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`)
