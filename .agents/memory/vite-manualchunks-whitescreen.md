---
name: Vite manualChunks white screen
description: Prod-only startup crash caused by manual vendor chunk splitting of React.
---
Rule: do not use rollupOptions.output.manualChunks to split React (or react-dependent node_modules) into separate vendor chunks in the web app build.
**Why:** splitting react/react-dom into "vendor-react" while other react-dependent packages landed in "vendor" created a chunk-initialisation cycle. Production crashed at startup with "Cannot set properties of undefined (setting 'Children')" — a full white screen at myimpact.uk. Dev mode was unaffected, so the bug only appeared after publishing.
**How to apply:** rely on Rollup's default chunking. If manual chunking is ever revisited for performance, verify the built bundle in a real headless browser first (serve dist + Playwright probe, fail on any pageerror). Prod symptoms of this class: HTML and CSS load fine, JS assets return 200, but the page body stays empty.
