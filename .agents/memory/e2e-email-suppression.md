---
name: E2E email suppression
description: Why test runs no longer send real Resend emails, and the schema-drift trap with ad-hoc dev SQL.
---
Rule: all outbound email goes through the shared Resend helper, which returns a logging no-op stub when E2E_TEST_MODE=1.
**Why:** e2e runs were firing real Resend API sends (e.g. "You're in! ... E2E Org ..." join-approval emails) to fake @e2etest.local addresses, cluttering the Resend dashboard and burning quota, because individual routes forgot per-route guards.
**How to apply:** never construct a Resend client outside the shared helper; new email paths need no extra test-mode guard.

Related trap: a task merge added users.voice_accent via ad-hoc SQL without a migration file, so fresh/e2e DB state drifted and reset-user 500'd. Any schema change must ship a numbered migration in lib/db/migrations.
