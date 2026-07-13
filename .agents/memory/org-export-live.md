---
name: Org export shared pipeline
description: How /org/export serves both the demo org and real orgs, and the hooks/caching rules that keep it safe.
---

Real (non-demo) org managers use the same export pipeline as the demo org: live rows from `/api/org/activities` are mapped into the `DemoActivity` shape so aggregates, CSV and PDF code stay shared. Member names/emails come from an optional `MemberDirectory` passed to `memberLabel`/`activityExportRows`.

**Why:** duplicating the CSV/PDF pipeline for live data would drift; mapping at the edge keeps one code path.
**How to apply:** when adding export fields, extend `DemoActivity` and the live mapping together.

Rules learned the hard way:
- Pages in this app must keep ALL hooks above any conditional early return. OrgExport crashed with a hooks-order error the moment a live query resolved because preview hooks sat below loading returns.
- React Query cache is cleared on login and logout in auth-context, and org-scoped queries include the org id in their key. **Why:** cached member PII from one manager account briefly rendered for the next account otherwise.
- `/api/org/activities` marks member-submitted lines verified when the record has an approved org verification, not just `attestedAt`.
