---
name: Admin endpoint testing
description: How to test admin-gated API routes in dev without a real admin login
---
Admin routes are gated by an email allowlist (lib/adminEmails.ts); demo personas are never admins, so demo-login can't reach them.
**How to apply:** insert a temporary user row with an allowlisted email, sign a JWT `{id, email}` with `process.env.SESSION_SECRET` (jsonwebtoken, from artifacts/api-server so the dep resolves), and curl with `Cookie: mi_session=<token>`. Delete the test user and any rows the test created afterwards.
**Why:** avoids weakening the allowlist or adding test-only backdoors just to verify admin behavior.
