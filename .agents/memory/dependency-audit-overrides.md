---
name: Clearing pnpm audit advisories in this workspace
description: How security advisories are patched here — root overrides vs the workspace catalog
---

# Clearing pnpm audit advisories

- Transitive advisories are fixed via `pnpm.overrides` in root `package.json`, using version-scoped keys (`form-data@2`, `js-yaml@4`) when multiple majors coexist, so unrelated majors aren't force-bumped.
- **Vite (and other catalog deps) must be bumped in the `catalog:` section of `pnpm-workspace.yaml`** — a root override on `vite@7` did not change the installed version while the catalog pinned an older range; updating the catalog entry fixed it immediately.
- **Why:** artifacts declare `"vite": "catalog:"`, and the catalog resolution won over the override in practice. The catalog entry is the control point — no root override needed once bumped.
- **How to apply:** after any audit fix, run both `pnpm audit --prod` and plain `pnpm audit` (done criteria may include dev-only paths), then re-verify with the `build` + `smoke` validation runs. Note `minimumReleaseAge: 1440` in pnpm-workspace.yaml delays very fresh releases.
- Known-clean baseline checks: root typecheck (`pnpm run build`) fails on pre-existing api-server TS errors unrelated to deps — use `pnpm -r --if-present run build` to verify actual builds.
