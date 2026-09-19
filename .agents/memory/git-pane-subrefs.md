---
name: Git pane stale subrepl refs
description: Replit Git pane can fail generically when task-agent remotes and local branches accumulate.
---

Replit’s Git pane may show “Unknown Git Error / UNKNOWN” even when repository integrity, GitHub authentication, fetch, and push all work. Check the counts of both `subrepl-*` remotes and `refs/heads/subrepl-*`; cleaning only the remotes may not fix the pane because stale local branches remain in packed refs.

**Why:** This project accumulated hundreds of task-environment remotes and matching local branches. The command-line repository remained healthy, but the pane continued failing until both collections were addressed.

**How to apply:** Back up all refs with a Git bundle first, preserve normal project and recovery branches, then remove only stale `subrepl-*` remotes and local branch refs. Verify status, fsck, fetch dry-run, and push dry-run afterward.