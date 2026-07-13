---
name: Running the Playwright e2e suite in this workspace
description: Port collisions, process reaping, and the validation-runner workaround for long e2e runs
---

# Running the Playwright e2e suite

- The suite's default ports (API 8080, web 24656) collide with the always-running dev workflows, and localhost probing is unreliable (a catch-all proxy makes many ports look "in use"). Ports 3000/5000 have been reliably free — run with `E2E_MANAGED_SERVERS=1 E2E_TEST_MODE=1 E2E_API_PORT=5000 E2E_WEB_PORT=3000`.
- **Why:** Playwright's managed webServer uses `reuseExistingServer: false` and aborts if the port answers.
- Long-running commands (>2 min) cannot finish inside a single shell call, and background/`nohup`/`setsid` processes are reaped between shell calls when the call exits normally (they survive only when the call is killed — which then leaves orphans holding ports). **Use the validation runner** (`setValidationCommand` + `startValidationRun`) for anything that outlasts the shell cap; it has no such limit.
- Playwright chromium is not preinstalled: `pnpm --filter @workspace/e2e exec playwright install chromium` after dependency reinstalls.
- The magic-link endpoint rate-limits repeat requests per email — tests that sign in more than once must use a unique email per sign-in or they flake with "a sign-in link was just sent".
- **How to apply:** whenever running or registering e2e checks (e.g. the `subnav-alignment` validation), reuse the port overrides and per-sign-in unique emails.
- Several specs assert master-era UI text/routes that don't exist on main (Results hero "total verified social impact", `/api/impact/records`, `/api/recurring-templates`), and the test-only org cleanup hits a `challenges` FK violation — so those wizard/org specs fail on a clean main regardless of code changes. Judge e2e runs by whether *newly touched* areas' specs pass, and cross-check any failing spec's expected text/route against the current tree before assuming a regression.
- Quick authenticated dev verification without test mode: seed a user + magic token directly in the dev DB and drive the auth-confirm page with a one-off Playwright script against the localhost:80 proxy; launch chromium with `executablePath: process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE` (nix-provided). Clean up seeded rows afterwards.
