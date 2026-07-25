---
name: Production seeding constraints
description: Why one-off data seeding cannot run against the production DB from dev, and the pattern used instead
---

Production DB access from the dev environment is READ-ONLY (executeSql environment:"production" allows SELECT only) and the production DATABASE_URL is never exposed to dev. Task agents also cannot publish.

**Why:** Attempting to "run a seed script against production" from dev is impossible; the deployed app is the only thing with prod write access.

**How to apply:** Any production data seeding/backfill must run inside the deployed app itself — e.g. fold it into an existing startup background job (the premapped-charities refresh sweep now inserts SEED_AUTHORITIES and generates any area with NULL/stale lastGeneratedAt, throttled + resumable). It then takes effect on the next publish. Autoscale may interrupt long background sweeps; design them resumable (skip fresh rows, re-run daily/on boot).
