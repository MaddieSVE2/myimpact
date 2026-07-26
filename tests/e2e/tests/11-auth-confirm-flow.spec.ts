import { test, expect } from "@playwright/test";
import { TestApi, uniqueEmail } from "../helpers/api";

/**
 * Spec 11 — Magic-link sign-in flow (end-to-end)
 *
 * Covers the full journey a real user takes:
 *   /login → submit email → "check inbox" screen →
 *   /auth/confirm?token=… → "Confirm sign in" button →
 *   session cookie set → redirect to /history or /profile/setup
 *
 * Also covers the two main error cases so regressions are caught:
 *   - invalid / garbage token → "Link not valid"
 *   - token used a second time → "Link not valid" (already-confirmed guard)
 */

test.describe("Spec 11 — auth confirm flow", () => {
  let api: TestApi;

  test.beforeAll(async ({ baseURL }) => {
    api = await TestApi.create({ baseURL: baseURL! });
  });

  test.afterAll(async () => {
    await api.resetAllTestUsers();
    await api.dispose();
  });

  test("happy path: full magic-link sign-in lands on /history or /profile/setup", async ({
    page,
    context,
  }) => {
    const email = uniqueEmail("authconfirm");
    await api.resetUser(email);

    // Step 1: Go to /login and submit the email.
    await page.goto("/login");
    const emailInput = page.locator("#email");
    await emailInput.waitFor({ state: "visible" });
    await emailInput.fill(email);
    await page.getByRole("button", { name: /send sign-in link|sign in/i }).first().click();

    // Step 2: The "check your inbox" screen must appear (proves /api/auth/request worked).
    await expect(
      page.getByText(/we['']ve sent a sign-in link/i),
    ).toBeVisible({ timeout: 15_000 });

    // Step 3: Retrieve the token from the test-only endpoint (simulates clicking the email link).
    const token = await api.getLatestMagicToken(email);
    expect(token).toBeTruthy();

    // Step 4: Navigate to the confirm page.
    await page.goto(`/auth/confirm?token=${encodeURIComponent(token)}`);

    // Step 5: The confirm page must show the user's email and the confirm button.
    await expect(page.getByRole("heading", { name: /confirm sign in/i })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(email)).toBeVisible();

    // Step 6: Click the button to complete sign-in.
    await page.getByRole("button", { name: /^confirm sign in$/i }).click();

    // Step 6b: New account — the age gate asks for a date of birth here.
    await expect(page.getByTestId("select-birth-month")).toBeVisible({ timeout: 10_000 });
    await page.getByTestId("select-birth-month").selectOption("1");
    await page.getByTestId("select-birth-year").selectOption(String(new Date().getFullYear() - 30));
    await page.getByTestId("button-save-birth-date").click();

    // Step 7: The app redirects to /history or /profile/setup (new user) or /wizard.
    await page.waitForURL(/\/(history|profile\/setup|wizard)/, { timeout: 15_000 });

    // Step 8: The session cookie must be set — proves issueSession() ran.
    const cookies = await context.cookies();
    const sessionCookie = cookies.find((c) => c.name === "mi_session");
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie!.httpOnly).toBe(true);

    // Step 9: /api/auth/me must return the signed-in user.
    const meRes = await page.request.get("/api/auth/me");
    expect(meRes.ok()).toBe(true);
    const meBody = (await meRes.json()) as { user: { email: string } | null };
    expect(meBody.user).not.toBeNull();
    expect(meBody.user!.email).toBe(email);
  });

  test("invalid token shows 'Link not valid' error page", async ({ page }) => {
    await page.goto("/auth/confirm?token=totally-bogus-token");

    await expect(
      page.getByRole("heading", { name: /link not valid/i }),
    ).toBeVisible({ timeout: 10_000 });

    // The page must offer a way back to /login.
    await expect(page.getByRole("link", { name: /request a new link/i })).toBeVisible();
  });

  test("already-used token shows 'Link not valid' error page", async ({ page }) => {
    const email = uniqueEmail("authconfirm-reuse");
    await api.resetUser(email);

    // Request a magic link.
    await page.goto("/login");
    const emailInput = page.locator("#email");
    await emailInput.waitFor({ state: "visible" });
    await emailInput.fill(email);
    await page.getByRole("button", { name: /send sign-in link|sign in/i }).first().click();
    await expect(
      page.getByText(/we['']ve sent a sign-in link/i),
    ).toBeVisible({ timeout: 15_000 });

    const token = await api.getLatestMagicToken(email);

    // Confirm once (succeeds) — includes the new-account birth-date step.
    await page.goto(`/auth/confirm?token=${encodeURIComponent(token)}`);
    await page.getByRole("button", { name: /^confirm sign in$/i }).click();
    await expect(page.getByTestId("select-birth-month")).toBeVisible({ timeout: 10_000 });
    await page.getByTestId("select-birth-month").selectOption("1");
    await page.getByTestId("select-birth-year").selectOption(String(new Date().getFullYear() - 30));
    await page.getByTestId("button-save-birth-date").click();
    await page.waitForURL(/\/(history|profile\/setup|wizard)/, { timeout: 15_000 });

    // Navigate back to the same confirm URL in a new page context.
    // The token is now marked confirmed, so this should error.
    await page.goto(`/auth/confirm?token=${encodeURIComponent(token)}`);
    await expect(
      page.getByRole("heading", { name: /link not valid/i }),
    ).toBeVisible({ timeout: 10_000 });
  });
});
