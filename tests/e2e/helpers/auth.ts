import type { Page, BrowserContext } from "@playwright/test";
import { expect } from "@playwright/test";
import { TestApi } from "./api";

/**
 * Drive the real magic-link sign-in flow end-to-end:
 *   1. Visit /login.
 *   2. Submit the email form.
 *   3. Fetch the latest magic-link token from the test-only API endpoint.
 *   4. Visit /auth/confirm?token=... to consume it.
 *   5. Click "Sign me in" on the confirmation page.
 *
 * Returns once the session cookie is set and the user lands on a logged-in
 * page (either /history or /profile/setup for first-time users).
 */
export async function signInWithMagicLink(
  page: Page,
  api: TestApi,
  email: string,
): Promise<void> {
  await page.goto("/login");

  // Fill the email and submit the request-link form. (No birth date here —
  // the age gate now runs after the magic link is confirmed.)
  const emailInput = page.locator("#email");
  await emailInput.waitFor({ state: "visible" });
  await emailInput.fill(email);

  await page.getByRole("button", { name: /send sign-in link|sign in/i }).first().click();

  // Wait for the "we've sent a sign-in link" confirmation copy. We assert
  // this so a 500 from /api/auth/request fails the test loudly here.
  await expect(page.getByText(/we['']ve sent a sign-in link/i)).toBeVisible({ timeout: 15_000 });

  const token = await api.getLatestMagicToken(email);

  // Drive the confirm page rather than calling the API directly so that we
  // exercise the same redirect logic real users hit.
  await page.goto(`/auth/confirm?token=${encodeURIComponent(token)}`);

  await page.getByRole("button", { name: /^confirm sign in$/i }).click();

  // First-ever sign-in: the age gate asks for a date of birth right after
  // confirmation. Fill an adult date when the step appears; returning users
  // skip straight to the redirect.
  const birthMonth = page.getByTestId("select-birth-month");
  const sawBirthStep = await birthMonth
    .waitFor({ state: "visible", timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  if (sawBirthStep) {
    await birthMonth.selectOption("1");
    await page.getByTestId("select-birth-year").selectOption(String(new Date().getFullYear() - 30));
    await page.getByTestId("button-save-birth-date").click();
  }

  // After confirm, the app navigates to either /profile/setup (new user) or
  // /history (returning user). Wait for one of the two so subsequent
  // assertions can rely on a stable URL.
  await page.waitForURL(/\/(history|profile\/setup|wizard)/, { timeout: 15_000 });
}

/**
 * Issue a session via the persona shortcut (no email round-trip).
 * Useful when a test cares about post-login behaviour, not auth itself.
 *
 * Note: persona accounts share state across tests, so use this only when
 * the persona's state doesn't matter (or you're going to reset it).
 */
export async function signInAsPersona(
  context: BrowserContext,
  page: Page,
  email: string,
): Promise<void> {
  const res = await context.request.post("/api/auth/request", {
    data: { email },
  });
  if (!res.ok()) {
    throw new Error(`Persona login failed (${res.status()}): ${await res.text()}`);
  }
  const body = (await res.json()) as { instantLogin?: boolean };
  if (!body.instantLogin) {
    throw new Error(`Email "${email}" is not a persona account`);
  }
  // Reload so the React auth context picks up the new mi_session cookie.
  await page.goto("/history");
}
