---
name: Parallel validation contention
description: Why full-validation Playwright suites fail together but pass individually
---
The validation runner launches all Playwright suites (e2e, smoke, e2e-edit-record, subnav-alignment) in parallel. They all share `tests/e2e/test-results/`, so concurrent runs clobber each other's trace artifacts (ENOENT `.network`/`.trace` copyfile errors) and starve each other into page.goto timeouts.

**Why:** Observed repeatedly — each suite passes when run alone via its workflow (smoke, e2e-edit-record, subnav-alignment workflows), but rotating subsets fail whenever all run concurrently.

**How to apply:** When validation fails with ENOENT trace-artifact errors or /login navigation timeouts across multiple suites, re-run the failing suite's individual workflow in isolation before assuming a code regression. Also: a direct `playwright test` from the shell gets reaped — use the workflows.

Also: a process with `E2E_API_PORT=5000` in its environ during a validation run is the suite's *own* managed server, not an orphan — killing it fails the whole run with ECONNREFUSED. Only kill such processes when no validation suite is actively running.

**Escape hatch:** when all suites pass individually (run each via its workflow, full e2e included) but parallel validation keeps failing with EAGAIN / "Resource temporarily unavailable" / ENOENT trace zips, `markTaskComplete` with `skip_validation_reason` citing the individual passes is the accepted path.
