---
name: Resend verified sender
description: Which sender domains the connected Resend account accepts; myimpact.uk is NOT verified.
---
The connected Resend account only has **socialvalueengine.com** verified as a sending domain. Any send from a `@myimpact.uk` address is rejected with a `validation_error` (domain not verified), silently breaking magic-link and all other emails.

**Why:** The user declined verifying myimpact.uk in Resend (may revisit later), so the shared sender must stay on a socialvalueengine.com address (e.g. `My Impact <enquiries@socialvalueengine.com>`, confirmed accepted by Resend).

**How to apply:** All outgoing email goes through the single Resend client helper — the `fromEmail` there is the only sender source. Do not change it to a myimpact.uk address unless the domain has been verified in Resend first (check with a direct test send to `delivered@resend.dev`). Recipient addresses like `hello@myimpact.uk` are fine — only the `from` domain matters.
