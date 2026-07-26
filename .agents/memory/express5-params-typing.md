---
name: Express 5 req.params typing
description: Why req.params values type as string | string[] and how the api-server handles it
---
@types/express-serve-static-core v5.1+ types `req.params` values as `string | string[]` (to cover Express 5 wildcard/splat params). This app only uses named params, which are always strings at runtime.

**Why:** Direct use of `req.params.x` in drizzle `eq()` or `.trim()` fails typecheck with TS2769/TS2339 overload errors.

**How to apply:** Normalize at the top of the handler with `const id = String(req.params.id);` (existing codebase convention). Don't pin/override the types package.
