import { test, expect } from "@playwright/test";
import { TestApi, uniqueEmail } from "../helpers/api";
import { signInWithMagicLink } from "../helpers/auth";

/**
 * Spec 38 — Reopening a saved entry's full report from History.
 *
 * Every entry offers it, including one made only of activities the person
 * described in their own words. The report shows the entry as already saved:
 * no second save, and the year total counts it once.
 */
test.describe("Spec 38 — reopen full report", () => {
  let api: TestApi;
  const email = uniqueEmail("rep38");

  test.beforeAll(async ({ baseURL }) => {
    api = await TestApi.create({ baseURL: baseURL! });
  });

  test.afterAll(async () => {
    await api.resetUser(email);
    await api.dispose();
  });

  test("an own-words entry reopens as a saved report", async ({ page }) => {
    await signInWithMagicLink(page, api, email);
    const res = await page.request.post("/api/impact/save", {
      data: {
        userId: "",
        name: "My Impact Record",
        activities: [],
        customActivities: [
          {
            activityId: "custom_e2e_38",
            name: "Set up gym equipment for the local school",
            quantity: 1,
            hoursPerYear: 1,
            valuePerUnit: 16.93,
            unit: "hour",
            proxy: "Test proxy",
            proxyYear: "2024",
            sdg: "Good Health and Well-being",
            sdgColor: "#4C9F38",
          },
        ],
        donationsGBP: 0,
        additionalVolunteerHours: 0,
      },
    });
    expect(res.ok(), await res.text()).toBeTruthy();
    const recordId = String(((await res.json()) as { id: number | string }).id);

    await page.goto("/history");
    await page.getByRole("button", { name: /^expand$/i }).first().click();
    await page.getByRole("button", { name: "View full report" }).click();

    await expect(page).toHaveURL(new RegExp(`/results\\?record=${recordId}$`));
    await expect(page.getByText("Set up gym equipment for the local school").first()).toBeVisible();
    const save = page.getByTestId("results-save-button");
    await expect(save).toHaveText(/Saved/);
    await expect(save).toBeDisabled();
    await expect(page.getByTestId("results-period-line")).toHaveCount(0);

    // Its only entry this year, so the year total is the entry's value.
    const entry = (await page.getByTestId("results-entry-value").textContent())?.replace(/^.*:\s*/, "");
    await expect(page.getByTestId("results-hero-value")).toHaveText(entry!);
  });
});
