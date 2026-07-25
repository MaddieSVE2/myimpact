---
name: ffmpeg/ffprobe in production
description: How audio transcoding binaries are provided so they survive deployment
---
System ffmpeg/ffprobe exist only in the dev Nix environment — production deployments lack them (`spawn ffmpeg ENOENT`).

**Rule:** audio code must resolve binaries via `ffmpeg-static` / `ffprobe-static` npm packages (with fallback to PATH), never spawn bare `"ffmpeg"`/`"ffprobe"`.

**Why:** the deployment image only ships node_modules; Nix runtime binaries are dev-only.

**How to apply:**
- `ffmpeg-static` needs its download postinstall approved in `pnpm-workspace.yaml` `onlyBuiltDependencies`, otherwise the binary is silently missing.
- Any package spawning these must list them in the api-server's own `package.json` deps too: the esbuild server bundle externalizes only deps listed there, and bundling ffmpeg-static breaks its `__dirname`-based binary lookup.
- Fix reaches production only after republishing.
