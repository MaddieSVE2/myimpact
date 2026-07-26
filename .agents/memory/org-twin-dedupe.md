---
name: Org twin dedupe
description: How duplicated member-submit personal copies are excluded from org-facing views
---
Member-submit with "save to personal" creates two impact records: the org submission (source='member-submitted') and a personal copy (source='user'). The personal copy carries the org record's id in `resultJson.orgRecordId`.

**Rule:** org-facing views/aggregates must never count both. The exclusion lives centrally inside `sharedRecordsCondition` (orgSharing helper) as a NOT EXISTS twin match — explicit `orgRecordId` link first, legacy fallback = same user + same entry_date + identical activities_json against a member-submitted record for the same org. Applied in BOTH sharing modes (explicit mode aggregates also double-counted).

**Why:** observed in production — the same activity appeared twice in the org activities feed for consenting members.

**How to apply:** any new org-facing consumer of member data should go through `sharedRecordsCondition` (it gets dedupe for free); if querying consented/member personal records directly, reuse `notOrgTwinCondition(orgId)`.
