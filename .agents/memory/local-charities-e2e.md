---
name: Local charities e2e seeding
description: How to test the pre-mapped local charity suggestions flow deterministically without AI or postcodes.io calls
---

- Geocoding stub: when E2E_TEST_MODE=1, the postcode helper returns canned lookups for reserved ZZ postcodes — "ZZ1 1ZZ" → Testford (England), "ZZ2 2ZZ" → Pendington (England). ZZ area is never allocated by Royal Mail so no collision with real lookups.
- Pending-state trick: seed a local_charity_areas row with status "ready" and ZERO suggestion rows. The /premapped API then reports "pending" (categories empty) but ensureAuthority does NOT queue background AI generation (it only re-queues "failed"/"pending" rows). Seeding status "pending" directly would fire real gpt-5-mini calls.
- Test-only endpoints /api/test/seed-local-charities and /api/test/reset-local-charities (TestApi.seedLocalCharities / resetLocalCharities) handle area + per-category places.
- **Why:** the premapped pipeline calls OpenAI + charity registers in the background on first sight of an authority; tests must never trigger that.
- **How to apply:** any spec touching /suggestions local results should use the ZZ postcodes and these seeds; magic-link sign-in rate-limits per email, so use one unique email per test.
