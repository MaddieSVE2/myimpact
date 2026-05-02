import { type Page, expect } from "@playwright/test";

/**
 * Helpers that drive the real Google and Microsoft sign-in screens.
 *
 * These are deliberately defensive: both Google's and Microsoft's
 * sign-in HTML is updated regularly and may A/B between layouts. Each
 * step waits for any of a small set of acceptable selectors so a small
 * cosmetic IdP change doesn't immediately break the suite. If the
 * IdP gate is genuinely different (challenge, captcha, MFA prompt)
 * we fail with a clear message so the on-call can update the test
 * account configuration rather than chasing flaky errors.
 */

export interface GoogleCredentials {
  email: string;
  password: string;
}

export interface MicrosoftCredentials {
  email: string;
  password: string;
}

export async function completeGoogleSignIn(
  page: Page,
  creds: GoogleCredentials,
): Promise<void> {
  // Email step
  await page.waitForURL(/accounts\.google\.com/, { timeout: 30_000 });
  const emailInput = page.locator('input[type="email"]');
  await expect(emailInput).toBeVisible({ timeout: 15_000 });
  await emailInput.fill(creds.email);
  await page.locator("#identifierNext button, #identifierNext").first().click();

  // Password step
  const passwordInput = page.locator('input[type="password"]');
  await expect(passwordInput).toBeVisible({ timeout: 20_000 });
  await passwordInput.fill(creds.password);
  await page.locator("#passwordNext button, #passwordNext").first().click();

  await assertNoIdpChallenge(page, "google");
}

export async function completeMicrosoftSignIn(
  page: Page,
  creds: MicrosoftCredentials,
): Promise<void> {
  // Email step (the Entra page uses input[name="loginfmt"]).
  await page.waitForURL(/login\.microsoftonline\.com|login\.live\.com/, {
    timeout: 30_000,
  });
  const emailInput = page.locator('input[name="loginfmt"], input[type="email"]').first();
  await expect(emailInput).toBeVisible({ timeout: 15_000 });
  await emailInput.fill(creds.email);
  await page.locator('input[type="submit"], #idSIButton9').first().click();

  // Password step
  const passwordInput = page.locator('input[name="passwd"], input[type="password"]').first();
  await expect(passwordInput).toBeVisible({ timeout: 20_000 });
  await passwordInput.fill(creds.password);
  await page.locator('input[type="submit"], #idSIButton9').first().click();

  // "Stay signed in?" prompt — answer "No" so we don't pollute the test
  // account's session state.
  const staySignedInNo = page.locator('input[id="idBtn_Back"], button:has-text("No")');
  if (await staySignedInNo.first().isVisible({ timeout: 8_000 }).catch(() => false)) {
    await staySignedInNo.first().click();
  }

  await assertNoIdpChallenge(page, "microsoft");
}

/**
 * Detect MFA / device-trust / consent gates that we cannot drive from
 * an automated test, and fail loudly so the operator updates the test
 * account configuration instead of seeing a confusing timeout later.
 */
async function assertNoIdpChallenge(page: Page, provider: "google" | "microsoft"): Promise<void> {
  const url = page.url();
  const challengeMarkers = [
    /challenge/i,
    /verify/i,
    /2sv/i,
    /signin\/v2\/challenge/i,
    /\/kmsi/i,
    /\/consent/i,
  ];
  if (challengeMarkers.some((re) => re.test(url))) {
    throw new Error(
      `${provider} presented an interactive challenge (${url}). The dedicated test account must have MFA disabled and have already granted consent to the My Impact OAuth client.`,
    );
  }
}
