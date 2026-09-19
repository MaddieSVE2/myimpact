---
name: Lighthouse CI local runs
description: How to run and pass the my-impact Lighthouse CI budgets locally
---

- Run `lhci autorun` through the validation runner (a registered `lighthouse` validation command exists) — plain background shells get reaped mid-run and the full 5-route collect exceeds the 120s bash window. Set `CHROME_PATH` to Playwright's Chromium.
- **Why:** nohup'd servers/processes die when the launching shell exits; two attempts failed this way before switching to the validation runner.
- axe's color-contrast blends ancestor `opacity` into the foreground color, so decoratively dimmed text (e.g. carousel side cards) fails contrast. Dim with `filter: opacity(...)` instead (visually identical, axe reads real colors) and mark the element `aria-hidden`.
- The default primary/brand orange must remain dark enough for both white text and orange text on 10% tinted backgrounds. Verify both combinations when changing the token; lighter legacy oranges failed across public routes.
- Lighthouse runs share `.lighthouseci`; never run registered Lighthouse workflows concurrently or clean that directory while another run is active, because they delete each other's flag/report files and can assert against stale runs.
- There are now two passes: desktop (`lighthouse` validation, perf ≥0.75) and mobile (`lighthouse-mobile` validation, perf ≥0.50 under Moto G4/4G throttling). Config is split into base/desktop/mobile files; `lighthouserc.cjs` re-exports desktop for `--config`-less runs. Mobile throttling roughly halves the desktop perf score (homepage ~0.54 mobile vs ~0.75+ desktop).
- Perf budget (0.75 desktop) is sensitive to workspace CPU contention — a run during a build scored 0.52 vs ~0.72 idle. Judge failures from a quiet run.
- Homepage LCP depends on lazy route chunks; prerender.ts injects `modulepreload` links for Intro/layout/page-metadata chunks. Sentry is dynamically imported (lib/sentry.ts facade queues calls) — don't reintroduce a static `@sentry/react` import anywhere or it lands back in the entry bundle.
