---
name: Persona instant login for testing
description: How to authenticate quickly in dev/e2e without magic-link emails
---
POST `/api/auth/demo-login` with `{"email":"volunteer@volunteer.org"}` (or demo@, student@, carer@, veteran@, apprentice@, jobseeker@, organisation@, university@ — each `x@x.org`) issues a session cookie instantly in non-production. The same emails instant-login through the normal sign-in UI form (no magic link), which is the easiest path for Playwright/testing-subagent flows and avoids the per-email magic-link rate limit.

**Why:** magic-link auth rate-limits per email and needs mailbox polling; personas bypass both.
**How to apply:** for curl, save cookies with `-c` and reuse with `-b`; org personas (demo@, organisation@, university@) redirect to the org dashboard after login.
