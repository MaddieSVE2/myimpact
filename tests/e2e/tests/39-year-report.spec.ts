import { test, expect } from "@playwright/test";
import { TestApi, uniqueEmail } from "../helpers/api";
import { signInWithMagicLink } from "../helpers/auth";

/**
 * Spec 39 — My impact shows the full report for the year so far.
 *
 * The charts, value tiles, skills and evidence text cover every entry this
 * year, worded for the situation on the person's profile, with the list of
 * entries underneath.
 */
test.describe("Spec 39 — year report on My impact", () => {
  let api: TestApi;
  const email = uniqueEmail("yr39");

  test.beforeAll(async ({ baseURL }) => {
    api = await TestApi.create({ baseURL: baseURL! });
  });

  test.afterAll(async () => {
    await api.resetUser(email);
    await api.dispose();
  });

  test("the year's entries make one report", async ({ page }) => {
    await signInWithMagicLink(page, api, email);
    const profile = await page.request.put("/api/profile", { data: { situation: ["career_break"], interests: [] } });
    expect(profile.ok(), await profile.text()).toBeTruthy();

    const save = (data: Record<string, unknown>) =>
      page.request.post("/api/impact/save", {
        data: { userId: "", name: "My Impact Record", donationsGBP: 0, additionalVolunteerHours: 0, force: true, ...data },
      });
    expect((await save({ activities: [{ activityId: "recycling", quantity: 26, hoursPerYear: 12 }] })).ok()).toBeTruthy();
    expect((await save({
      activities: [],
      customActivities: [{
        activityId: "custom_e2e_39",
        name: "Coached the under-12s",
        quantity: 3,
        hoursPerYear: 3,
        valuePerUnit: 16.93,
        unit: "hour",
        proxy: "Test proxy",
        proxyYear: "2024",
        sdg: "Good Health and Well-being",
        sdgColor: "#4C9F38",
      }],
    })).ok()).toBeTruthy();

    const year = new Date().getFullYear();
    const yearResult = await page.request.get(`/api/impact/year-result/${year}`);
    const { result } = (await yearResult.json()) as { result: { totalValue: number; totalHours: number } };

    await page.goto("/impact");
    const report = page.getByTestId("impact-year-report");
    await expect(report).toBeVisible();
    const hero = (await page.getByTestId("results-hero-value").textContent())!;

    // Both entries, in one report.
    await expect(report.getByText("By activity")).toBeVisible();
    await expect(report.getByText("Coached the under-12s").first()).toBeVisible();
    await expect(report.getByText(/recycling/i).first()).toBeVisible();
    await expect(report.getByText("UN Sustainable Development Goals (SDGs)")).toBeVisible();
    await expect(report.getByText(`Value of ${Math.round(result.totalHours)} hours contributed`)).toBeVisible();

    // Worded for the profile's career break, with the year's hours and total.
    await expect(report.getByText("Skills from your career break")).toBeVisible();
    const evidence = report.getByText(/^During my career break/);
    await expect(evidence).toContainText(`${Math.round(result.totalHours)} hours`);
    await expect(evidence).toContainText(hero);

    // The tiles explain themselves.
    await report.getByRole("button", { name: "What's this?" }).first().click();
    await expect(report.getByText(/direct social value created by your activities/)).toBeVisible();

    // The entries are still listed underneath.
    await expect(page.getByTestId("impact-running-record")).toContainText("2 activity entries");
  });
});
