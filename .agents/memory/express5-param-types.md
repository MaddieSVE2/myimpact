---
name: Express 5 param types
description: Why req.params is string | string[] in this repo and how to type handlers.
---
Rule: `@types/express` v5 types `req.params` values as `string | string[]`, which breaks drizzle `eq()` and `.trim()` calls.
**Why:** api-server typecheck baseline had ~40 errors solely from this; fixed by typing `AuthenticatedRequest extends Request<Record<string, string>>` and annotating plain `Request<Record<string, string>>` on unauthenticated handlers.
**How to apply:** New route handlers should use `AuthenticatedRequest` or `Request<Record<string, string>>`. Also: `"error" in result` doesn't narrow unions with optional `error?: never` — use `if (result.error)` with explicit discriminated result types. A `typecheck` validation (builds lib refs then api-server tsc) now guards the green baseline; keep it green.
