# Overview

The My Impact web application is a pnpm workspace monorepo designed to help users aged 16-35 quantify and understand their social value. By leveraging Social Value Engine proxy data, the platform allows individuals to track activities, calculate their societal contributions in monetary terms, analyze historical impact, and receive personalized suggestions for increasing their positive influence. Key features include a 3-step social value calculation wizard, impact breakdowns, SDG visualizations, calendar synchronization, public profiles, and an organizational portal for managers. The project aims to empower users to recognize and enhance their social contributions, fostering a greater sense of purpose and engagement.

# User Preferences

I prefer iterative development and welcome early feedback. Please use clear and concise language in your explanations. For significant changes or architectural decisions, please ask for approval before proceeding. Ensure all code is well-documented and follows best practices for maintainability and readability. Do not make changes to the `lib/api-spec/openapi.yaml` file.

# System Architecture

The project is structured as a pnpm monorepo using TypeScript (v5.9). The backend is an Express 5 API server, utilizing PostgreSQL with Drizzle ORM for data persistence and Zod for validation. API client code is generated from an OpenAPI spec using Orval. The frontend is built with React, Vite, Tailwind CSS, framer-motion, and recharts, featuring a 3-step wizard UI.

**Core Architectural Decisions & Features:**

*   **Impact Calculation:** Uses `artifacts/api-server/src/lib/impactData.ts` to calculate social value based on activity quantity (Social Value Engine proxy), total hours (£12.21/hour), direct donations, and a skill gain formula for personal development value.
*   **Authentication:** Implemented via magic link authentication using Resend. A two-step token design prevents bot-burning, and sessions are managed with JWTs stored in `httpOnly` cookies. User data and token states are stored in `users`, `magic_tokens`, and `user_profiles` tables. Protected routes exist on both frontend and backend. **Enterprise SSO (OIDC):** Org managers can additionally configure Google Workspace or Microsoft Entra SSO per email domain from the Org Portal. Routes live under `/api/auth/sso/*` (start, callback, lookup, providers, test/start) and `/api/org/sso/config` (manager-only CRUD). When `enforceSSO=true`, magic-link sign-in is blocked for that domain. Tokens are verified against provider JWKS but not stored. Requires platform env vars `GOOGLE_OIDC_CLIENT_ID/SECRET` and `MICROSOFT_OIDC_CLIENT_ID/SECRET`; the UI gracefully degrades when these are missing. Schema lives in `org_sso_configs`.
*   **Calendar Sync:** Integration with Google Calendar and Microsoft Outlook (via Replit Connectors) allows users to sync events, which are then upserted into `calendar_events`. Tokens are obtained on demand and not stored. A scheduled worker syncs events and prunes old data. A home page widget displays upcoming events, and an in-app prompt encourages logging matched events.
*   **Public Profile:** Users can create shareable public profiles at `/profile/:slug`. Settings are managed through `public_profiles` table, with API routes for managing visibility and content. Slug generation adheres to specific rules, and the public endpoint is rate-limited.
*   **Sidekick AI:** A collapsible, context-aware AI assistant, powered by OpenAI via Replit AI Integrations. It provides guidance with a warm, encouraging tone, leveraging user impact data. **Voice Mode:** Supports microphone input (transcribed via OpenAI speech-to-text) and spoken assistant replies (via OpenAI TTS). Voice settings (`voice_enabled`, `voice_persona`) are persisted on the `users` table.
*   **Email Systems:** Includes a monthly digest for opted-in users and a three-email onboarding sequence (Day 1, 7, 30) after sign-up, both managed via Resend.
*   **Data Structure:** Monorepo organization with `artifacts/api-server` for the backend, `artifacts/my-impact` for the frontend, and `lib/` for shared components like API specifications, generated clients, and database schemas.
*   **Deployment:** Utilizes Replit Scheduled Deployments for recurring tasks like weekly database backups and monthly email digests.
*   **Challenges Feature:** Supports creation of personal or organizational challenges with invite codes and leaderboards, tracking impact records within a defined period.
*   **Funnel Analytics:** Internal, privacy-first analytics layer (no third-party SaaS, no PII) recording named events to the `analytics_events` table with separate `member` and `org` surfaces. Powers admin-only funnel dashboards (signup→first log, wizard completion, D1/D7/D30 retention) at `/admin`. See `artifacts/api-server/src/lib/ANALYTICS.md` for the event catalogue and how to add new events.
*   **Additional Pages:** The application includes dedicated pages for history tracking, personalized activity suggestions, and an annual recap (Spotify-Wrapped style).
*   **Performance Budgets (Lighthouse CI):** Every PR runs `@lhci/cli` against a built preview of `artifacts/my-impact` (`.github/workflows/lighthouse.yml`). Five routes are audited — `/`, `/wizard/actions`, `/results`, `/history`, `/profile/demo` — with desktop budgets enforced for performance (≥0.75), accessibility (≥0.95), best-practices (≥0.85) and SEO (≥0.85). Failing budgets block merge and reports are uploaded as a build artifact (`lighthouse-reports-<run-id>`) and to LHCI's temporary public storage. Run locally with `pnpm lhci` (builds + audits) or `pnpm lhci:open` to view the latest HTML reports. Budgets live in `lighthouserc.cjs`; tighten them after a deliberate optimisation lands and document any loosening in the PR description. PWA scoring is omitted because Lighthouse 12 dropped the category. The local sandbox has no Chrome installed — local runs require a system Chrome/Chromium.

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
*   **Social Value Data:** Social Value Engine proxy library