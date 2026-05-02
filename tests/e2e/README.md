# My Impact — End-to-end test suite

Playwright-driven UI tests that exercise the five highest-value flows in
the My Impact stack.

## Specs

| File | Flow under test |
|------|-----------------|
| `01-magic-link-signup.spec.ts` | New user signs up via magic link and completes the impact wizard. |
| `02-history-add-impact.spec.ts` | Logged-in user logs a second impact record from `/history`. |
| `03-journal-crud.spec.ts` | Create, verify, and delete a journal entry. |
| `04-org-admin.spec.ts` | Manager registers an org, a member joins, member's hours appear in the dashboard. |
| `05-public-profile.spec.ts` | Enable public profile, flip a privacy toggle, view anonymously, disable. |

## How auth works in tests

The api-server understands `E2E_TEST_MODE=1`. With it set:

- `POST /api/auth/request` still records the magic-link token in the
  database, but **does not** call Resend (so no real email is sent and no
  Resend API key is required).
- A small `routes/test-only.ts` router exposes endpoints under `/api/test/*`
  that let tests:
  - Reset a user (`POST /api/test/reset-user`)
  - Bulk-reset every test user (`POST /api/test/reset-emails`, restricted
    to `%@e2etest.local`)
  - Fetch the latest unconfirmed magic token (`GET /api/test/latest-token`)
  - Approve an org registration and create the org
    (`POST /api/test/approve-org-registration`)
  - Direct-create / delete an org (`POST /api/test/create-org`,
    `POST /api/test/delete-org`)

Without `E2E_TEST_MODE=1`, every test endpoint returns 404 — so this is
safe to leave compiled into production builds.

## Test data isolation

Each test generates a unique email of the form
`<prefix>-<timestamp>-<rand>@e2etest.local`. `beforeAll` and `afterAll`
hooks call `resetUser(email)` so a re-run starts from a clean state.

The `@e2etest.local` suffix is the only domain accepted by the bulk reset
helper, so `api.resetAllTestUsers()` (used by `pnpm test:e2e:clean`) can
never accidentally wipe a real account.

## Running locally

```bash
# 1. Make sure DATABASE_URL and SESSION_SECRET are exported and migrations
#    have been applied:
pnpm --filter @workspace/db run migrate

# 2. Install Playwright browsers (first run only):
pnpm --filter @workspace/e2e run install-browsers

# 3a. Run against an already-running stack (faster while iterating).
#     Start the api-server with E2E_TEST_MODE=1 and the my-impact dev server
#     in two separate terminals first, then:
pnpm --filter @workspace/e2e test

# 3b. Or let Playwright spawn both servers for you:
E2E_MANAGED_SERVERS=1 pnpm test:e2e
```

The default base URL is `http://localhost:24656` (the my-impact dev port).
Override with `E2E_BASE_URL` if you're proxying through a different host.

## CI

`.github/workflows/e2e.yml` runs the suite on every pull request:

1. Boots a Postgres 16 service container.
2. Installs deps with `pnpm install --frozen-lockfile`.
3. Runs migrations (`pnpm --filter @workspace/db run migrate`).
4. Sets `E2E_MANAGED_SERVERS=1` so Playwright starts the api-server and
   Vite itself.
5. Uploads the HTML report and any traces on failure.

## Quarantine policy

Per the project policy, **flaky tests are quarantined, not retried.**
`playwright.config.ts` has `retries: 0`. If a test starts to flake:

1. Add a `test.fixme(...)` block with a comment explaining the symptom.
2. Open a follow-up to investigate — never lower the bar by raising
   `retries`.
