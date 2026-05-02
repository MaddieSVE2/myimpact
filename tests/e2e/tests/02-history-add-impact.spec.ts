import { test, expect } from "@playwright/test";
import { TestApi, uniqueEmail } from "../helpers/api";
import { signInWithMagicLink } from "../helpers/auth";
import { completeWizardWithExtraHours } from "../helpers/wizard";

test.describe("Spec 2 — logged-in user logs additional impact from History", () => {
  let api: TestApi;
  const email = uniqueEmail("history");

  test.beforeAll(async ({ baseURL }) => {
    api = await TestApi.create({ baseURL: baseURL! });
    await api.resetUser(email);
  });

  test.afterAll(async () => {
    await api.resetUser(email);
    await api.dispose();
  });

  test("user logs a second impact record from /history", async ({ page }) => {
    // Sign up + first wizard run so /history isn't empty.
    await signInWithMagicLink(page, api, email);
    await completeWizardWithExtraHours(page, { donationsGBP: 25, hours: 5 });

    // Navigate to history and start the second wizard run from the CTA.
    await page.goto("/history");
    await page.getByRole("link", { name: /calculate my impact/i }).first().click();
    await page.waitForURL(/\/wizard\/actions/);

    await completeWizardWithExtraHours(page, { donationsGBP: 75, hours: 12 });

    // Verify a second record now exists by querying the API directly.
    // The history list UI has rich layout — a JSON check is the most
    // reliable assertion that a row was actually saved.
    const recordsRes = await page.request.get("/api/impact/history");
    expect(recordsRes.ok()).toBe(true);
    const body = (await recordsRes.json()) as { records: Array<{ id: string }> };
    expect(body.records.length).toBeGreaterThanOrEqual(2);
  });
});
