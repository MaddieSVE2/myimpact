---
name: Revoked-org purge
description: 180-day retention purge of revoked organisations — ownership boundary and archive-first rule
---

**Rules:**
- Archive-first: the purge must snapshot everything into `org_purge_archives` in the SAME transaction as the deletes — never delete org data without archiving.
- Ownership boundary: org twin records (`source='member-submitted'` + `submitted_to_org_id`) and their evidence attachments are org data (purged); members' personal source records, journals and templates are user data (never touched — deleting the twin makes the personal copy visible again per the twin model). Attested (`org_api`) records live on member accounts and are kept.
- Storage objects are deleted best-effort after commit; the attachment GC sweep is the durable backstop once rows are gone.

**Why:** the revocation email promises 180-day retention; several org child tables have no cascade to organisations, and attachments have no FK to impact records — both silently outlive the org unless deleted explicitly.

**How to apply:** any new org-keyed table (or org-linked file storage) must be added to the purge's collect+archive+delete path, or revoked-org data outlives the retention promise.
