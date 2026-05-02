import { test, expect } from "@playwright/test";
import { completeGoogleSignIn } from "../lib/idp";
import {
  readMembership,
  readSsoConfig,
  seedOrgWithSso,
  tearDownSsoSeed,
  type SsoSeed,
} from "../lib/seed";

/**
 * Real Google Workspace SSO sign-in.
 *
 * Drives the full handshake:
 *   /login → "Continue with Google" → accounts.google.com →
 *   /api/auth/sso/google/callback → auto-join → / (or returnTo)
 *
 * Skips with a clear reason when any of the required secrets are
 * missing, so the suite stays green in environments that haven't
 * provisioned IdP credentials yet (the contract tests still cover
 * the routes themselves).
 */

const REQUIRED_VARS = [
  "GOOGLE_OIDC_CLIENT_ID",
  "GOOGLE_OIDC_CLIENT_SECRET",
  "SSO_TEST_GOOGLE_EMAIL",
  "SSO_TEST_GOOGLE_PASSWORD",
  "SSO_TEST_GOOGLE_DOMAIN",
  "SSO_TEST_BASE_URL",
  "DATABASE_URL",
] as const;

const missing = REQUIRED_VARS.filter((k) => !process.env[k]);

test.describe("Google Workspace SSO — real sign-in", () => {
  test.skip(
    missing.length > 0,
    `Skipped — missing required env vars: ${missing.join(", ")}. ` +
      `See tests/sso-e2e/README.md for the full provisioning checklist.`,
  );

  let seed: SsoSeed;

  test.beforeAll(async () => {
    seed = await seedOrgWithSso({
      provider: "google",
      domain: process.env.SSO_TEST_GOOGLE_DOMAIN!.toLowerCase(),
      testEmail: process.env.SSO_TEST_GOOGLE_EMAIL!.toLowerCase(),
    });
  });

  test.afterAll(async () => {
    if (seed) await tearDownSsoSeed(seed);
  });

  test("user enters work email, clicks Continue with Google, completes IdP, lands signed in and is auto-joined", async ({ page, baseURL }) => {
    const email = process.env.SSO_TEST_GOOGLE_EMAIL!.toLowerCase();
    const password = process.env.SSO_TEST_GOOGLE_PASSWORD!;

    // 1. Navigate to /login with returnTo=/org so the post-callback
    //    landing is deterministic for the assertion below.
    await page.goto(`${baseURL}/login?next=${encodeURIComponent("/org")}`);

    // 2. Type the work email — the lookup endpoint should resolve to
    //    the seeded SSO config and reveal the "Continue with Google" CTA.
    await page.getByLabel(/email address/i).fill(email);
    const ssoButton = page.getByRole("button", { name: /continue with google/i });
    await expect(ssoButton).toBeVisible({ timeout: 10_000 });

    // 3. Click → /api/auth/sso/google/start → 302 to Google's IdP
    await ssoButton.click();

    // 4. Drive Google's IdP screens
    await completeGoogleSignIn(page, { email, password });

    // 5. The callback renders an HTML success page that auto-redirects
    //    to /org. Wait for either the success page or the final landing.
    await page.waitForURL((url) => /\/org(\b|\/)/.test(url.pathname) || /signed in/i.test(""), {
      timeout: 30_000,
    });

    // 6. The org portal should show the seeded org name (the user is now a
    //    member of it).
    await expect(page.locator("body")).toContainText(seed.orgName, { timeout: 15_000 });

    // 7. DB-side: membership exists and the SSO config flipped to verified.
    const membership = await readMembership(seed);
    expect(membership, "Auto-join should have created an org_members row").not.toBeNull();
    expect(membership!.role).toBe("member");

    const cfg = await readSsoConfig(seed);
    expect(cfg?.status).toBe("verified");
  });
});
