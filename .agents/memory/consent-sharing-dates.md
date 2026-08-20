---
name: Consent sharing dates
description: Calendar-day handling for consented organisation activity and challenge progress.
---

For organisations using consented logging, interpret the timestamp at which a member grants consent as the start of that UTC calendar day when comparing it with date-only activity. Activity from earlier calendar days remains private.

**Why:** Activities are stored by date while consent is timestamped. Comparing them exactly excluded activity logged later on the day that the member granted consent.

**How to apply:** Reuse the shared-records rule for consented organisation views, exports, and challenge progress. Keep explicit-submission organisations on their submission-only path: consented visibility must never make an unsubmitted personal activity count for them.