import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * Walk the wizard from start to /results, taking the simplest possible path:
 *   - Step 1 (actions): set a postcode so canProceed flips true.
 *   - Step 2 (activities): click the "Skip" button (no activities selected).
 *   - Step 3 (contributions): enter donation + extra hours, click reveal.
 *
 * This avoids relying on the activities catalogue or AI describe endpoint,
 * both of which are slow / require additional configuration in CI.
 */
export async function completeWizardWithExtraHours(
  page: Page,
  opts: {
    postcode?: string;
    donationsGBP?: number;
    hours?: number;
    /** When false, skip the post-results "Save record" step. Default true. */
    save?: boolean;
  } = {},
): Promise<void> {
  const postcode = opts.postcode ?? "M1";
  const donations = opts.donationsGBP ?? 50;
  const hours = opts.hours ?? 5;

  await page.goto("/wizard/actions");
  // Some users are auto-redirected to /profile/setup first; if so, walk
  // that briefly. The setup page has its own selectors but we keep it
  // resilient: only run if we landed there.
  if (page.url().includes("/profile/setup")) {
    await skipProfileSetup(page);
    await page.goto("/wizard/actions");
  }

  // Step 1: postcode is enough to satisfy canProceed. The page seeds
  // fields from /api/profile shortly after mount, which can race a fill
  // issued too early — so re-fill until the Next button actually enables.
  const postcodeInput = page.getByPlaceholder(/manchester|postcode|m1/i).first();
  const nextButton = page.getByRole("button", { name: /next:\s*add activities/i });
  await postcodeInput.waitFor({ state: "visible" });
  await expect(async () => {
    await postcodeInput.fill(postcode);
    await expect(nextButton).toBeEnabled({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await nextButton.click();

  // Step 2: skip activity selection entirely.
  await page.waitForURL(/\/wizard\/activities/);
  // Default mode is "pick"; selecting nothing makes the button read "Skip".
  await page.getByRole("button", { name: /^skip$/i }).click();

  // Step 3: contributions.
  await page.waitForURL(/\/wizard\/contributions/);
  // The donations input is the first number input on the page.
  const numberInputs = page.locator('input[type="number"]');
  await numberInputs.first().fill(String(donations));
  await numberInputs.nth(1).fill(String(hours));
  await page.getByRole("button", { name: /reveal my impact/i }).click();

  // Land on /results. The hero renders the total as a large currency
  // heading; the exact headline copy varies by user situation, so assert
  // on the stable pieces: the £-value h1 and the "Save progress" CTA.
  await page.waitForURL(/\/results/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { level: 1 }).filter({ hasText: "£" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^save progress$|^saved!$/i })).toBeVisible();

  // Persist the calculated impact to the user's history. The Results page
  // does NOT auto-save: it shows a "Save progress" CTA which opens a
  // period-picker dialog before POSTing /api/impact/save. Drive both.
  if (opts.save !== false) {
    await page.getByRole("button", { name: /^save progress$/i }).click();
    // Pick the first preset chip in the dialog (e.g. "2026").
    const dialog = page.getByText(/what period does this cover\?/i);
    await dialog.waitFor({ state: "visible" });
    await page.getByRole("button", { name: /^save record$/i }).click();
    // After save the primary CTA flips to "Saved!".
    await expect(page.getByRole("button", { name: /^saved!$/i })).toBeVisible({
      timeout: 15_000,
    });
  }
}

/**
 * The profile-setup page is shown right after first sign-in. We don't care
 * about it for most tests, so just bail past it by clicking the skip link
 * if present.
 */
async function skipProfileSetup(page: Page): Promise<void> {
  const skipLink = page.getByRole("link", { name: /skip|maybe later|do this later/i });
  if (await skipLink.count()) {
    await skipLink.first().click();
    return;
  }
  const skipButton = page.getByRole("button", { name: /skip|maybe later|do this later/i });
  if (await skipButton.count()) {
    await skipButton.first().click();
  }
}
