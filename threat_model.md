# Threat Model

## Project Overview

My Impact is a TypeScript pnpm monorepo that serves a React + Vite web application backed by an Express 5 API and PostgreSQL via Drizzle ORM. Individual users can calculate and store their personal social-impact history, keep journal entries, publish an optional public profile, and interact with an OpenAI-powered assistant. Organisation users can register organisations, join via invite codes, and view aggregated member statistics and PDF reports. Authentication is passwordless magic-link login via Resend, with a JWT session stored in the `mi_session` cookie.

Production scope for this scan is:
- `artifacts/my-impact` frontend
- `artifacts/api-server` backend
- shared libraries under `lib/` that affect production behavior
- PostgreSQL-backed data models and route handlers reachable from the production app

Out of scope for production findings:
- `artifacts/mockup-sandbox`, which is a development-only mockup environment and is assumed never to be deployed
- local build scripts and purely developer tooling unless production reachability is demonstrated

Assumptions:
- Production traffic is terminated over TLS by the platform
- `NODE_ENV` is `production` in production deployments
- Secrets are supplied through environment variables or Replit-managed integrations rather than committed files

## Assets

- **User accounts and sessions**: magic-link tokens, JWT session cookies, user IDs, and profile data. Compromise allows account takeover and access to private history and journal data.
- **Private user contribution data**: saved impact records, journal entries, suggestions context, inferred life situation data, and profile settings. This is sensitive personal data even when not strictly financial.
- **Organisation data**: org registrations, invite codes, memberships, aggregated reports, and region/category breakdowns. Compromise can expose internal programme data and enable unauthorised org access.
- **Public-profile controls**: the decision to publish, the selected slug, and the visibility flags for hours, totals, categories, and journal highlights. These controls must not be bypassed or overridden by other users.
- **Operational channels and secrets**: Resend credentials, OpenAI credentials, Charity Commission and OSCR API keys, push-notification credentials, object-storage access, and any admin-only inbox workflows. Abuse can create direct financial cost, spam, storage exhaustion, outbound request abuse, or service disruption.
- **Admin capabilities**: access to user lists, organisation registrations, approvals, and invite generation. Abuse would expose broad user data and change trust relationships across the application.

## Trust Boundaries

- **Browser to API**: every request from the React app or any third-party site crosses into the Express API. The browser is untrusted, and all authn/authz decisions must be made server-side.
- **Unauthenticated to authenticated user boundary**: public routes such as login, suggestions, contact, public profiles, and some AI-powered flows must not gain access to private data or authenticated actions.
- **Authenticated user to admin boundary**: admin routes under `/api/admin` rely on stronger authorization than ordinary signed-in users.
- **Individual user to organisation boundary**: organisation stats and reports aggregate data from multiple members; membership and invite flows must prevent cross-org access or arbitrary joining.
- **Private data to public-profile boundary**: selected subsets of a user’s data may become public only when the user explicitly enables this and only according to chosen visibility flags.
- **API to database**: route handlers can read and modify all persisted application data. Query scoping and authorization checks here are security-critical.
- **API to third-party services**: the server sends emails through Resend, calls OpenAI-backed integrations, queries charity registries, issues object-storage upload/download URLs, and sends Web Push notifications. Public or authenticated endpoints that cross this boundary create abuse, cost, SSRF-like outbound request, and storage-exhaustion risk.
- **Proxy / deployment boundary**: request metadata such as host, protocol, client IP, and origin may come from proxy headers. Security decisions that depend on these values must assume they are attacker-influenced unless explicitly trusted and normalized.

## Threat Categories

### Spoofing

The application relies on emailed magic links and JWT cookies for identity. The system must only generate sign-in links for trusted application origins, must treat proxy-derived host and protocol metadata as untrusted unless validated, and must ensure no production route bypasses email verification or otherwise issues a session to an arbitrary user. Session cookies must only be accepted when signed with the server secret and must not be exposed to untrusted origins.

### Tampering

Users can create or update impact records, journal entries, profile settings, organisation membership state, and admin-monitored registrations. All write operations must validate user-controlled input server-side, must scope modifications to the authenticated user or authorised role, and must not let the client choose ownership or authorization context.

### Information Disclosure

Private impact history, journal content, organisation membership data, invite codes, admin views, and unpublished public-profile data must never be readable by unauthorised users or third-party origins. Cross-origin access controls, response shaping, slug-based public routes, and admin/organisation queries must ensure that only intentionally public data is exposed. Error handling and email content must not leak secrets or private tokens.

### Denial of Service and Resource Abuse

The application exposes several public or lightly protected endpoints that trigger third-party work such as OpenAI completions, email delivery, and registry lookups. These routes must have effective abuse controls such as authentication, rate limiting, quota checks, bounded prompt sizes, and timeouts so that an attacker cannot drive API cost, spam operational inboxes, or degrade service availability.

### Elevation of Privilege

Ordinary users must not gain admin capabilities, access another user’s saved records, view another organisation’s aggregated data, or use public-profile or invite features to cross trust boundaries. All privileged routes must enforce authorization on the server after authentication, and org membership or admin status must not be inferred from client state alone.

## Required Guarantees

- All cookie-authenticated API endpoints MUST restrict cross-origin access to trusted application origins only.
- Any session-issuing flow MUST derive callback and sign-in URLs from a trusted allowlist, not directly from attacker-controlled request headers.
- All sensitive API routes MUST enforce server-side authentication and route-level authorization.
- Organisation membership and reporting endpoints MUST only expose data for the authenticated user’s authorised organisation scope.
- Public-profile routes MUST expose only data that the profile owner explicitly enabled for public viewing.
- Public or authenticated endpoints that trigger OpenAI, email delivery, push delivery, object-storage allocation, or other paid external operations MUST be rate-limited, quota-enforced, and otherwise abuse-resistant.
- Admin-only operations MUST remain unreachable to non-admin users even if they can access frontend routes directly.
- Dev-only artifacts, including `artifacts/mockup-sandbox`, MUST remain excluded from production security conclusions unless production reachability is proven.

## Scan Anchors

Prioritize repeated scans around these production anchors:
- `artifacts/api-server/src/app.ts`
- `artifacts/api-server/src/middleware/authenticate.ts`
- `artifacts/api-server/src/routes/auth.ts`
- `artifacts/api-server/src/routes/admin.ts`
- `artifacts/api-server/src/routes/org.ts`
- `artifacts/api-server/src/routes/public-profile.ts`
- `artifacts/api-server/src/routes/impact.ts`
- `artifacts/api-server/src/routes/challenges.ts`
- `artifacts/api-server/src/routes/journal.ts`
- `artifacts/api-server/src/routes/profile.ts`
- `artifacts/api-server/src/routes/sidekick.ts`
- `artifacts/api-server/src/routes/attachments.ts`
- `artifacts/api-server/src/routes/push.ts`
- `artifacts/api-server/src/routes/custom-activity.ts`
- `artifacts/api-server/src/routes/local-charities.ts`
- `artifacts/api-server/src/routes/contact.ts`
- `artifacts/api-server/src/routes/feedback.ts`
- `lib/db/src/schema/`
