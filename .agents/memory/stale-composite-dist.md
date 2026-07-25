---
name: Stale composite dist causes phantom tsc errors
description: my-impact typechecks against lib/api-client-react dist .d.ts via project references; stale dist yields errors that look like source bugs.
---
`artifacts/my-impact/tsconfig.json` references `lib/api-client-react` (composite, emitDeclarationOnly → `dist/`). `tsc --noEmit` in my-impact resolves `@workspace/api-client-react` types from the built `dist/*.d.ts`, not `src/`.

**Why:** dist is gitignored and can lag behind `src/generated` after codegen, producing tsc errors (e.g. "property does not exist") that look like app-code bugs but aren't.

**How to apply:** if my-impact tsc errors point at api-client types, first run `npx tsc -b lib/api-client-react` from the repo root, then re-run the typecheck. Only touch app code if errors persist.
