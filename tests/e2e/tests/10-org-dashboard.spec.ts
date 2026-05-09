import { test, expect } from "@playwright/test";
import { signInAsPersona } from "../helpers/auth";

const DEMO_MANAGER_EMAIL = "organisation@organisation.org";

test.describe("Spec 10 — demo org dashboard renders all key sections", () => {
  test("manager sees SROI, monthly trend, pulse summary, categories, and can expand a category", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    await signInAsPersona(ctx, page, DEMO_MANAGER_EMAIL);
    await page.goto("/org/dashboard");

    await expect(page.getByTestId("org-dashboard-root")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("section-sroi-explainer")).toBeVisible();
    await expect(page.getByTestId("section-monthly-trend")).toBeVisible();
    await expect(page.getByTestId("section-pulse-summary")).toBeVisible();
    await expect(page.getByTestId("pulse-summary-trend-chart")).toBeVisible();

    const categoryRows = page.locator('[data-testid^="category-rank-"]');
    await expect(categoryRows.first()).toBeVisible();
    expect(await categoryRows.count()).toBeGreaterThanOrEqual(6);

    const toggle = page.locator('[data-testid^="category-toggle-"]').first();
    await expect(toggle).toBeVisible();
    const testId = await toggle.getAttribute("data-testid");
    const category = testId!.replace(/^category-toggle-/, "");
    const card = page.getByTestId(`category-rank-${category}`);

    const beforeCount = await card.locator("ul li").count();
    expect(beforeCount).toBeGreaterThan(0);

    await toggle.click();

    await expect.poll(async () => card.locator("ul li").count(), { timeout: 5_000 })
      .toBeGreaterThan(beforeCount);

    await ctx.close();
  });
});
