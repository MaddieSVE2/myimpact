---
name: Org manager review surfaces
description: Where org managers actually see member-level records, and the demo-org mock-data trap
---

Full-tier orgs (demo org, type=university, full_tier_enabled) are redirected from /org to /org/dashboard, which is anonymised and has NO member-level panels. Their member-level review surface is /org/activities (OrgActivities). Lite orgs stay on /org (OrgPortal), which renders VerificationQueue + MemberSubmissionsPanel.

**Why:** Task work adding manager-facing record features to OrgPortal is invisible to full-tier orgs; it must also land in OrgActivities (data from /api/org/activities).

**How to apply:**
- Any manager-facing per-record feature needs both surfaces: OrgPortal panels AND the OrgActivities table/endpoint.
- Demo org's /org/activities shows DEMO_ACTIVITIES mock data — real submissions never appear there. To UI-test real data as a manager, use the university org (university@university.org manager, student@student.org member). Note student's member-submit defaults to the demo org; repoint impact_records.submitted_to_org_id in dev DB if needed.
- Evidence upload flow for tests: POST /api/attachments/upload-url (purpose=org-evidence) → PUT PNG to signed URL → POST /api/attachments/register → include evidenceAttachmentIds in /api/org/member-submit.
