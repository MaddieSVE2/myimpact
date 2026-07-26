---
name: Orphaned API server process after workflow restart
description: Workflow restart can leave an old tsx process holding the API port, silently serving stale code
---

Restarting the API Server workflow can leave the previous tsx process alive and still bound to port 8080. The new process starts, runs boot-time side effects (e.g. demo seeding) against the DB, but fails to serve — so curl hits OLD code while the DB reflects NEW code.

**Why:** Observed July 2026: after editing auth personas and restarting, demo-login kept 403ing for a newly added persona even though the file clearly contained it, while seed data from the new code appeared in the DB. `ps aux | grep index.ts` showed two tsx process pairs with different start times.

**How to apply:** If the running API server behaves like pre-edit code after a restart (especially auth/route changes), run `ps aux | grep index.ts` and look for duplicate processes with older start times. Kill the old PIDs, then restart the workflow again.
- If ALL workflow restarts fail with platform-side "timed out waiting for run environment to rebuild" (river TIMED_OUT), check `timeout 20 ls -f /nix/store | head` — a hung /nix/store enumeration (virtiofs stall, e.g. after a parallel-validation resource storm) blocks every env rebuild. If restarts still fail after the stall clears, the pid2 supervisor itself is wedged: `kill -TERM <main pid2 PID>` — pid1 respawns it and workflows recover (this also auto-restarts everything, including validation workflows, so expect a brief contention burst).
