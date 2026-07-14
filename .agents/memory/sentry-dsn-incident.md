---
name: Sentry DSN token exposure
description: Leaked GitHub token in Sentry DSN env var — revoked; republish needed; DSN inits now validate format.
---

# Sentry DSN token exposure (July 2026)

A GitHub PAT was accidentally set as the my-impact `VITE_SENTRY_DSN`, baked into the deployed bundle, and echoed in the browser console by Sentry's "Invalid Sentry Dsn" error.

- The exposed token was revoked (GitHub returns 401 for it; also submitted to `POST https://api.github.com/credentials/revoke`). It was NOT the same value as the `GITHUB_PERSONAL_ACCESS_TOKEN` secret.
- Production `VITE_SENTRY_DSN` now holds a real, verified DSN (`o4511322265092096.ingest.de.sentry.io`).
- Both Sentry init helpers (web + api-server) now validate DSN format and refuse to init (or print the value) on malformed input.

**Why:** `VITE_*` env vars are baked into the bundle at build time — fixing the env var alone does not fix the live site; a republish is required. Until republished, the old bundle still contains the dead token string.

**How to apply:** if a secret ever leaks into a `VITE_*` var, treat it as published: revoke it, fix the var, then republish. GitHub's `POST /credentials/revoke` endpoint revokes ghp_ tokens without needing auth.
