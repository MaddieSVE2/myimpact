# SSO end-to-end tests (real IdP handshake)

Playwright suite that drives the full Google Workspace and Microsoft Entra
sign-in flows against a running My Impact stack — from clicking
"Continue with Google/Microsoft" on `/login`, through the IdP screens, all
the way to landing on the org portal as an auto-joined member.

This complements the existing route-level / UI-only SSO tests (which cover
contract, enforcement messaging and magic-link block) by catching
regressions that only surface when a real id_token is in flight: token
verification, hosted-domain enforcement, tenant pinning, and the
auto-provisioning happy path.

## When the suite runs

Each spec calls `test.skip()` when its required environment variables are
missing, so the suite is safe to load in any environment. It only **runs**
when:

1. The platform OAuth credentials are wired:
   - `GOOGLE_OIDC_CLIENT_ID`, `GOOGLE_OIDC_CLIENT_SECRET`, **or**
   - `MICROSOFT_OIDC_CLIENT_ID`, `MICROSOFT_OIDC_CLIENT_SECRET`
2. A dedicated test account exists at the IdP and its credentials and
   domain are exposed to the test runner (see secrets matrix below).
3. `SSO_TEST_BASE_URL` points at a **non-production** stack (a staging
   deployment or a seeded preview), so the test data the suite creates
   doesn't pollute prod.
4. `DATABASE_URL` points at the same stack's database (the seed helpers
   write directly to `org_sso_configs`, `organisations`, `org_members`
   and `users` and clean up afterwards).

## Secrets matrix

| Var                          | Required for | Notes                                                                 |
| ---------------------------- | ------------ | --------------------------------------------------------------------- |
| `SSO_TEST_BASE_URL`          | both         | e.g. `https://staging.myimpact.uk`. **Never point at prod.**          |
| `DATABASE_URL`               | both         | Staging DB connection string used by the seed helpers.                |
| `GOOGLE_OIDC_CLIENT_ID`      | Google       | Same secret the API server reads.                                     |
| `GOOGLE_OIDC_CLIENT_SECRET`  | Google       |                                                                       |
| `SSO_TEST_GOOGLE_EMAIL`      | Google       | Workspace test account, e.g. `playwright@sso-test.myimpact.uk`.       |
| `SSO_TEST_GOOGLE_PASSWORD`   | Google       | Plain password — the test account must have MFA disabled.             |
| `SSO_TEST_GOOGLE_DOMAIN`     | Google       | Hosted domain on the Workspace tenant (must match the email's `@…`).  |
| `MICROSOFT_OIDC_CLIENT_ID`   | Microsoft    |                                                                       |
| `MICROSOFT_OIDC_CLIENT_SECRET` | Microsoft  |                                                                       |
| `SSO_TEST_MS_EMAIL`          | Microsoft    | Entra test account, e.g. `playwright@sso-test.onmicrosoft.com`.       |
| `SSO_TEST_MS_PASSWORD`       | Microsoft    | MFA must be disabled on this account.                                 |
| `SSO_TEST_MS_DOMAIN`         | Microsoft    | The verified domain on the Entra tenant.                              |
| `SSO_TEST_MS_TENANT_ID`      | Microsoft    | The Entra tenant id (GUID) the test account belongs to.               |

## One-off provisioning

Before the suite can run end-to-end you need:

1. **A dedicated Google Workspace test account.** Create a Workspace
   subscription on a domain you own (e.g. `sso-test.myimpact.uk`) and
   add a single user. Disable MFA, security keys, and any device-trust
   policy on that account. Pre-grant consent to the My Impact OAuth
   client by signing in once manually so the IdP doesn't show the
   consent screen during the automated run.
2. **A dedicated Microsoft Entra test tenant.** Create a free Entra
   tenant, add a single user, disable MFA and Conditional Access on
   that user. Add the My Impact app registration to the tenant and
   complete admin consent so the consent screen doesn't appear at
   sign-in time.
3. **Add the redirect URI for `SSO_TEST_BASE_URL`** to both OAuth
   clients (`/api/auth/sso/google/callback` and
   `/api/auth/sso/microsoft/callback`).
4. **Provision the secrets** above into the runner that will execute
   the suite.

## Running locally

```bash
pnpm --filter @workspace/sso-e2e exec playwright install chromium
pnpm --filter @workspace/sso-e2e test            # both specs
pnpm --filter @workspace/sso-e2e test:google     # Google only
pnpm --filter @workspace/sso-e2e test:microsoft  # Microsoft only
```

If the matrix above is incomplete, the suite prints `skipped (missing
GOOGLE_OIDC_CLIENT_ID, ...)` and exits 0 — that's the expected state
in environments that haven't been provisioned yet.

## What each spec verifies

For each provider:

- The login page resolves the email's domain to the seeded SSO config
  and surfaces the correct provider button.
- Clicking it redirects through `/api/auth/sso/<provider>/start` to the
  IdP authorize URL.
- The IdP test account completes the handshake and the callback
  exchanges the code for an id_token.
- The OIDC verifier accepts the id_token (issuer, audience, hosted
  domain / tenant id).
- The user is auto-provisioned in `users`, linked to the seeded org as
  a `member` in `org_members`, and the SSO config row flips to
  `status = 'verified'`.
- The browser lands on `/org` with the seeded org name visible.

## Cleanup contract

Each spec creates a throwaway organisation and an `org_sso_configs`
row pinned to the test account's real domain, then in `afterAll`
deletes the org, the config, the membership, and the auto-provisioned
user (only if their email matches the test account's). A failed test
still triggers cleanup. The unique `(domain)` constraint on
`org_sso_configs` is also pre-cleared at seed time so a leftover row
from a previous crashed run can never silently steer the lookup.
