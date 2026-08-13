import { test, expect } from "@playwright/test";
import { TestApi, uniqueEmail } from "../helpers/api";
import { signInWithMagicLink } from "../helpers/auth";

/**
 * Spec 19 — Quick Log occurrence-first flow.
 *
 * Covers the rebuilt /log page:
 *   1. Happy path: pick an activity, enter a per-occurrence quantity, keep
 *      today's date, choose "Online / remote", save, and see the
 *      "Added to My Impact <year>" confirmation.
 *   2. Log again: after the first save the activity appears under "Recent
 *      activities"; tapping it pre-fills the usual amount and location.
 *   3. Duplicate prompt: saving the same activity on the same date surfaces
 *      "This activity may already have been logged" with view/edit vs
 *      "Log anyway" — logging anyway succeeds (no silent merge).
 *   4. Location text entry: a typed town label is accepted and shown, and
 *      History shows the entry with its "Logged activity" badge.
 */
test.describe("Spec 19 — Quick Log occurrence-first UX", () => {
  let api: TestApi;
  const email = uniqueEmail("quick-log-occurrence");

  test.beforeAll(async ({ baseURL }) => {
    api = await TestApi.create({ baseURL: baseURL! });
    await api.resetUser(email);
  });

  test.afterAll(async () => {
    await api.resetUser(email);
    await api.dispose();
  });

  test("happy path, log again, duplicate prompt and typed location", async ({ page }) => {
    test.setTimeout(120_000);
    await signInWithMagicLink(page, api, email);

    // ---- 1. Happy path -------------------------------------------------
    await page.goto("/log");
    await expect(page.getByTestId("quick-log-activity-page")).toBeVisible();

    // No month/term substitutes: date defaults to Today with a Change-date
    // affordance.
    await expect(page.getByTestId("quick-log-date-display")).toContainText(/Today/i);
    await expect(page.getByTestId("quick-log-change-date")).toBeVisible();

    await page.getByTestId("quick-log-pick-search").fill("recycl");
    await page.getByTestId("quick-log-activity-option-recycling").click();

    // Quantity is asked in the activity's natural unit.
    const qty = page.getByTestId("quick-log-quantity");
    await expect(qty).toBeVisible();
    await qty.fill("2");

    // Location: one-tap "Online / remote".
    await page.getByTestId("quick-log-location-online").click();
    await expect(page.getByTestId("quick-log-location-selected")).toContainText(/online/i);

    await page.getByTestId("quick-log-submit").click();
    const confirmation = page.getByTestId("quick-log-saved-confirmation");
    await expect(confirmation).toBeVisible({ timeout: 20_000 });
    await expect(confirmation).toContainText(/Added to My Impact \d{4}/);

    // ---- 2. Log again pre-fills ----------------------------------------
    await page.getByTestId("quick-log-saved-log-another").click();
    const recent = page.getByTestId("quick-log-recent-recycling");
    await expect(recent).toBeVisible({ timeout: 15_000 });
    await expect(recent).toContainText(/log again/i);
    await recent.click();

    // Pre-filled usual amount and previous location; date is today.
    await expect(page.getByTestId("quick-log-quantity")).toHaveValue("2");
    await expect(page.getByTestId("quick-log-location-selected")).toContainText(/online/i);
    await expect(page.getByTestId("quick-log-date-display")).toContainText(/Today/i);

    // ---- 3. Duplicate prompt -------------------------------------------
    await page.getByTestId("quick-log-submit").click();
    const dupPrompt = page.getByTestId("quick-log-duplicate-prompt");
    await expect(dupPrompt).toBeVisible({ timeout: 20_000 });
    await expect(dupPrompt).toContainText(/may already have been logged/i);
    await expect(page.getByTestId("quick-log-duplicate-view")).toBeVisible();

    await page.getByTestId("quick-log-duplicate-log-anyway").click();
    await expect(page.getByTestId("quick-log-saved-confirmation")).toBeVisible({ timeout: 20_000 });

    // ---- 4. Typed location on a different activity ---------------------
    await page.getByTestId("quick-log-saved-log-another").click();
    await page.getByTestId("quick-log-pick-search").fill("food bank");
    await page
      .locator('[data-testid^="quick-log-activity-option-"]')
      .first()
      .click();
    await page.getByTestId("quick-log-quantity").fill("3");
    await page.getByTestId("quick-log-location-input").fill("Cardiff");
    await page.getByTestId("quick-log-location-set").click();
    await expect(page.getByTestId("quick-log-location-selected")).toContainText("Cardiff");
    await page.getByTestId("quick-log-submit").click();
    await expect(page.getByTestId("quick-log-saved-confirmation")).toBeVisible({ timeout: 20_000 });

    // ---- 5. History shows occurrence entries clearly --------------------
    await page.goto("/history");
    await expect(page.locator('[data-testid^="badge-logged-"]').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('[data-testid^="record-location-"]').first()).toBeVisible();

    // Server-side sanity: 3 records, all quick_log, with locations stored.
    const historyRes = await page.request.get("/api/impact/history");
    expect(historyRes.ok()).toBe(true);
    const history = (await historyRes.json()) as {
      records: Array<{ kind?: string; location?: { mode?: string } | null }>;
    };
    expect(history.records.length).toBe(3);
    expect(history.records.every((r) => r.kind === "quick_log")).toBe(true);
    expect(history.records.some((r) => r.location?.mode === "online")).toBe(true);
    expect(history.records.some((r) => r.location?.mode === "in_person")).toBe(true);
  });
});
