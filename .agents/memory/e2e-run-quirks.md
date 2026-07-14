---
name: Running the Playwright e2e suite in this workspace
description: Port collisions, process reaping, and the validation-runner workaround for long e2e runs
---

# Running the Playwright e2e suite

- The suite's default ports (API 8080, web 24656) collide with the always-running dev workflows, and localhost probing is unreliable (a catch-all proxy makes many ports look "in use"). Ports 3000/5000 have been reliably free — run with `E2E_MANAGED_SERVERS=1 E2E_TEST_MODE=1 E2E_API_PORT=5000 E2E_WEB_PORT=3000`.
- **Why:** Playwright's managed webServer uses `reuseExistingServer: false` and aborts if the port answers.
- Long-running commands (>2 min) cannot finish inside a single shell call, and background/`nohup`/`setsid` processes are reaped between shell calls when the call exits normally (they survive only when the call is killed — which then leaves orphans holding ports). **Use the validation runner** (`setValidationCommand` + `startValidationRun`) for anything that outlasts the shell cap; it has no such limit.
- Playwright chromium is not preinstalled: `pnpm --filter @workspace/e2e exec playwright install chromium` after dependency reinstalls.
- The magic-link endpoint rate-limits repeat requests per email — tests that sign in more than once must use a unique email per sign-in or they flake with "a sign-in link was just sent". In test mode (`E2E_TEST_MODE=1`) the API skips the per-email cooldown, but keep unique emails anyway for isolation.
- Only ONE suite instance can run at a time: the registered `e2e` validation also appears as a workflow, and if the platform auto-(re)starts that workflow, its managed servers hold ports 5000/3000 and a concurrent `startValidationRun` fails instantly with "http://localhost:5000 is already in use". Check `ps` for a running `playwright test` process and wait for it to exit before starting a validation run.
- Playwright runs in strict mode — `getByText(orgName)` style locators flake as the app surfaces names in multiple places; scope to a testid container, use `getByRole("heading", ...)`, or use `getByTestId(...).first()`.
- Registered validations run in PARALLEL when triggered together (e.g. by `mark_task_complete`), so each e2e validation needs its own port pair: `e2e` uses 5000/3000, `subnav-alignment` uses 5001/3001. Sharing ports makes one suite die with ERR_CONNECTION_REFUSED mid-run. Keep at most one e2e validation registered, or give each unique ports, or run the targeted suite manually via `startValidationRun({commandIds: [...]})` and skip the completion validation with a reason.
- The API's global per-IP limiter (200 req/min on /api) can 429 mid-suite since all tests share one IP; it's raised to 10k when `E2E_TEST_MODE=1`.
- Specs have drifted from the app before (stale hero text, removed routes like `/api/impact/records`, `/api/recurring-templates`); the whole suite has since been realigned and passes as the `e2e` validation. If a spec fails, cross-check its expected text/route against the current tree before assuming an app regression. Judge e2e runs by whether *newly touched* areas' specs pass.
- **Notable app-flow changes:**
    - Results hero now uses "£ h1 + Save progress button" instead of "total verified social impact".
    - Compact org-prompts strip moved to Results-only (renders null for non-members).
    - Members join as "pending" and need manager approval before they count in org stats.
    - The free-text `period-label` field was replaced by a date input.
    - Teardown requires deleting challenge participants, verifications, audit logs, and share links to avoid FK violations.
- **How to apply:** whenever running or registering e2e checks (e.g. the `subnav-alignment` validation), reuse the port overrides and per-sign-in unique emails.
- Quick authenticated dev verification without test mode: seed a user + magic token directly in the dev DB and drive the auth-confirm page with a one-off Playwright script against the localhost:80 proxy; launch chromium with `executablePath: process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE` (nix-provided). Clean up seeded rows afterwards.
- Even with unique port pairs, running all five validation suites concurrently (mark_task_complete) can crash browsers with "Resource temporarily unavailable" / "Page crashed" — resource exhaustion, not app regressions. If the full `e2e` suite passed in the same run, re-run the crashed suites individually via `startValidationRun` to confirm before treating them as failures.
- Playwright chromium must be reinstalled after environment resets (`pnpm --filter @workspace/e2e exec playwright install chromium`); missing browser shows as "Executable doesn't exist at .cache/ms-playwright/...".
- If validation e2e fails with "Executable doesn't exist at .cache/ms-playwright/...", run `pnpm --filter @workspace/e2e exec playwright install chromium` first — fresh task environments lack browsers.
- If a validation run fails with "http://localhost:500X is already used" or /login navigation timeouts, or if a manually-invoked Playwright run is reaped mid-flight, kill orphaned servers on ports 5000-5003/3000-3003 (`fuser -k <port>/tcp`) — a reaped local playwright run leaves them behind.
- The platform validation runner launches all four Playwright suites (e2e, smoke, subnav-alignment, e2e-edit-record) in parallel; under this contention navigation times out at the login page even though every suite passes when run serially via its workflow. They share the same dev database and magic-link rate limits, so suites can fail with timeouts/rate-limit errors that disappear when run one at a time via their workflows. Verify failures by rerunning the suite in isolation before treating them as regressions.
