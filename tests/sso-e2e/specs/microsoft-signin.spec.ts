import { test, expect } from "@playwright/test";
import { completeMicrosoftSignIn } from "../lib/idp";
import {
  readMembership,
  readSsoConfig,
  seedOrgWithSso,
  tearDownSsoSeed,
  type SsoSeed,
} from "../lib/seed";

/**
 * Real Microsoft Entra SSO sign-in.
 *
 * Mirror of the Google spec but pinned to the configured tenant id —
 * the SSO config row carries the tenant so the OIDC handshake routes
 * through that tenant's authorize/token endpoints rather than /common.
 */

const REQUIRED_VARS = [
  "MICROSOFT_OIDC_CLIENT_ID",
  "MICROSOFT_OIDC_CLIENT_SECRET",
  "SSO_TEST_MS_EMAIL",
  "SSO_TEST_MS_PASSWORD",
  "SSO_TEST_MS_DOMAIN",
  "SSO_TEST_MS_TENANT_ID",
  "SSO_TEST_BASE_URL",
  "DATABASE_URL",
] as const;

const missing = REQUIRED_VARS.filter((k) => !process.env[k]);

test.describe("Microsoft Entra SSO — real sign-in", () => {
  test.skip(
    missing.length > 0,
    `Skipped — missing required env vars: ${missing.join(", ")}. ` +
      `See tests/sso-e2e/README.md for the full provisioning checklist.`,
  );

  let seed: SsoSeed;

  test.beforeAll(async () => {
    seed = await seedOrgWithSso({
      provider: "microsoft",
      domain: process.env.SSO_TEST_MS_DOMAIN!.toLowerCase(),
      testEmail: process.env.SSO_TEST_MS_EMAIL!.toLowerCase(),
      tenantId: process.env.SSO_TEST_MS_TENANT_ID!,
    });
  });

  test.afterAll(async () => {
    if (seed) await tearDownSsoSeed(seed);
  });

  test("user enters work email, clicks Continue with Microsoft, completes IdP, lands signed in and is auto-joined", async ({ page, baseURL }) => {
    const email = process.env.SSO_TEST_MS_EMAIL!.toLowerCase();
    const password = process.env.SSO_TEST_MS_PASSWORD!;

    await page.goto(`${baseURL}/login?next=${encodeURIComponent("/org")}`);

    await page.getByLabel(/email address/i).fill(email);
    const ssoButton = page.getByRole("button", { name: /continue with microsoft/i });
    await expect(ssoButton).toBeVisible({ timeout: 10_000 });
    await ssoButton.click();

    await completeMicrosoftSignIn(page, { email, password });

    await page.waitForURL((url) => /\/org(\b|\/)/.test(url.pathname), {
      timeout: 30_000,
    });

    await expect(page.locator("body")).toContainText(seed.orgName, { timeout: 15_000 });

    const membership = await readMembership(seed);
    expect(membership, "Auto-join should have created an org_members row").not.toBeNull();
    expect(membership!.role).toBe("member");

    const cfg = await readSsoConfig(seed);
    expect(cfg?.status).toBe("verified");
    // The tenant assertion in the OIDC verify path means the tid claim
    // matched; the row's tenantId is what we seeded.
    expect(cfg?.tenantId?.toLowerCase()).toBe(process.env.SSO_TEST_MS_TENANT_ID!.toLowerCase());
  });
});
