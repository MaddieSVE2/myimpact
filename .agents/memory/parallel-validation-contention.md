---
name: Parallel validation contention
description: Why full-validation Playwright suites fail together but pass individually
---
The validation runner launches all Playwright suites in parallel. The Playwright config now isolates artifacts per run (`outputDir`/HTML report keyed on `E2E_API_PORT`), which fixed the historical ENOENT trace-clobbering; remaining parallel failures are CPU/browser resource starvation (SIGABRT workers, page.goto timeouts, Lighthouse PAGE_HUNG).

**Why:** Observed repeatedly — each suite passes when run alone via its workflow, but rotating subsets fail whenever all run concurrently.

**How to apply:** When validation fails with worker SIGABRT or navigation/PAGE_HUNG timeouts across multiple suites, re-run the failing suite's individual workflow in isolation before assuming a code regression. Same for the lighthouse mobile homepage perf assertion (min 0.45): it drops as low as 0.2 under contention but passes standalone — if it's the only failure and the lighthouse workflow passes in isolation, it's contention, not a regression. A direct `playwright test` from the shell gets reaped — use the workflows.

Also: a process with `E2E_API_PORT=5000` in its environ during a validation run is the suite's *own* managed server, not an orphan — killing it fails the whole run with ECONNREFUSED. Only kill such processes when no validation suite is actively running.
