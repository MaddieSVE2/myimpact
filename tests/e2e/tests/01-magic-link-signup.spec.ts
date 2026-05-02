import { test, expect } from "@playwright/test";
import { TestApi, uniqueEmail } from "../helpers/api";
import { signInWithMagicLink } from "../helpers/auth";
import { completeWizardWithExtraHours } from "../helpers/wizard";

test.describe("Spec 1 — magic-link sign-up + first wizard completion", () => {
  let api: TestApi;
  const email = uniqueEmail("signup");

  test.beforeAll(async ({ baseURL }) => {
    api = await TestApi.create({ baseURL: baseURL! });
    await api.resetUser(email);
  });

  test.afterAll(async () => {
    await api.resetUser(email);
    await api.dispose();
  });

  test("new user signs up via magic link and completes the wizard", async ({ page }) => {
    await signInWithMagicLink(page, api, email);

    // After confirm, first-time users land on profile setup OR history.
    // Either way, we can navigate straight to the wizard.
    await completeWizardWithExtraHours(page, { donationsGBP: 100, hours: 10 });

    // Results page must show the user's total impact and their hours.
    await expect(page.getByText(/total verified social impact/i)).toBeVisible();

    // The history page should now contain the just-saved record. We verify
    // via the API rather than by selector hunting because the page renders
    // a rich timeline whose visual layout is incidental to the test.
    await page.goto("/history");
    const historyRes = await page.request.get("/api/impact/history");
    expect(historyRes.ok()).toBe(true);
    const body = (await historyRes.json()) as { records: Array<{ id: string }> };
    expect(body.records.length).toBeGreaterThanOrEqual(1);
  });
});
