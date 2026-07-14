---
name: Parallel validation contention
description: Why full-validation Playwright suites fail together but pass individually
---
The validation runner launches all Playwright suites (e2e, smoke, e2e-edit-record, subnav-alignment) in parallel. They all share `tests/e2e/test-results/`, so concurrent runs clobber each other's trace artifacts (ENOENT `.network`/`.trace` copyfile errors) and starve each other into page.goto timeouts.

**Why:** Observed repeatedly — each suite passes when run alone via its workflow (smoke, e2e-edit-record, subnav-alignment workflows), but rotating subsets fail whenever all run concurrently.

**How to apply:** When validation fails with ENOENT trace-artifact errors or /login navigation timeouts across multiple suites, re-run the failing suite's individual workflow in isolation before assuming a code regression. Also: a direct `playwright test` from the shell gets reaped — use the workflows.
