---
name: Resend webhook signing secrets
description: Each Resend webhook endpoint has its own whsec_ signing secret; secrets are not interchangeable between endpoints/apps.
---

Each webhook endpoint created in the Resend dashboard has its own Svix signing secret (`whsec_...`). A secret copied from one endpoint (e.g. the sve-mailer app's webhook) will NOT validate events delivered to a different endpoint URL.

**Why:** The owner initially pasted the sve-mailer endpoint's secret for the my-impact bounce webhook; signature verification would have rejected every real event.

**How to apply:** When wiring a Resend webhook for this app, always register a NEW endpoint (URL `https://myimpact.uk/api/email/resend-webhook`) and use that endpoint's own secret in `RESEND_WEBHOOK_SECRET`. Verification is manual HMAC-SHA256 base64 over `${svix-id}.${svix-timestamp}.${rawBody}` with the base64-decoded secret (route mounted before express.json with a raw parser). When the secret is unset the route returns 503; e2e suites are unaffected.
