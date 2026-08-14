---
name: Org verification states
description: three-state verification model for org records and the compatibility rules around it
---
Org-facing records have three verification states: submitted (self-reported), approved (manager decision or auto-verify org), verified (pre-attested via org API). The legacy `verified` boolean (= approved OR attested) and legacy webhook fields are kept for consumer compatibility — the three-state field rides alongside, never replaces them.

**Why:** the old UI auto-labelled all member submissions "Verified", misrepresenting pending records; existing webhook/CSV consumers may depend on the legacy fields.

**How to apply:** never label a member submission "verified" unless it is org-API pre-attested. Webhook emissions from personal saves must follow the same visibility predicate as dashboards (consented orgs: active consent + shareFrom window; revoked orgs: nothing). Twin records were assessed and deliberately kept — don't canonicalise them; see docs/org-visibility-and-verification.md before touching sharing/visibility.
