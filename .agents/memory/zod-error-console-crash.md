---
name: Masked api-server 500s (inspector crash in error log)
description: Diagnosing 500s whose only log line is a node util.inspect TypeError
---

**Rule:** if an api-server 500's log shows only a `node:internal/util/inspect` TypeError from the fallback `console.error`, the real error is masked — some error shapes (notably Zod validation errors under console instrumentation) crash node's inspector while being formatted.

**Why:** the fallback handler logs the raw error object; when formatting fails, the log shows the inspector crash instead of the cause, sending debugging down the wrong path.

**How to apply:** don't chase the inspect stack. Reproduce the request and validate the payload against the generated request schemas first — a missing required nested field is the usual culprit, and optional nested objects are all-or-nothing (omit rather than send partial).
