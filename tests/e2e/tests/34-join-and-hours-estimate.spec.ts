import { test, expect } from "@playwright/test";
import { TestApi, uniqueEmail } from "../helpers/api";
import { signInWithMagicLink } from "../helpers/auth";

test.describe("Spec 34 — organisation sign-up feedback", () => {
  let api: TestApi;
  const managerEmail = uniqueEmail("mgr34");
  const memberEmail = uniqueEmail("mem34");
  const hoursEmail = uniqueEmail("hrs34");
  const shortPeriodEmail = uniqueEmail("sht34");
  let orgId: string | undefined;

  test.beforeAll(async ({ baseURL }) => {
    api = await TestApi.create({ baseURL: baseURL! });
  });

  test.afterAll(async () => {
    if (orgId) await api.deleteOrg(orgId);
    for (const email of [managerEmail, memberEmail, hoursEmail, shortPeriodEmail]) await api.resetUser(email);
    await api.dispose();
  });

  test("a manager turns on auto-approval and a new member is in straight away", async ({ browser }) => {
    const org = await api.createOrg("Spec 34 Volleyball", "charity", managerEmail);
    orgId = org.orgId;

    const managerContext = await browser.newContext();
    const managerPage = await managerContext.newPage();
    await signInWithMagicLink(managerPage, api, managerEmail);
    const managerJoin = await managerPage.request.post("/api/org/join", {
      data: { inviteCode: org.inviteCode, orgId: org.orgId },
    });
    expect(managerJoin.ok()).toBeTruthy();

    await managerPage.goto("/org/settings?tab=approvals");
    await expect(managerPage.getByTestId("member-approval-manual").locator("input")).toBeChecked();
    await managerPage.getByTestId("member-approval-auto").click();
    await expect(managerPage.getByTestId("approvals-saved")).toBeVisible();
    await managerContext.close();

    const memberContext = await browser.newContext();
    const memberPage = await memberContext.newPage();
    await signInWithMagicLink(memberPage, api, memberEmail);
    await memberPage.goto(`/org?invite=${org.inviteCode}`);
    await memberPage.getByTestId("button-confirm-join").click();
    await expect(memberPage.getByTestId("org-member-jobs")).toBeVisible();
    await expect(memberPage.getByTestId("panel-membership-pending")).toHaveCount(0);

    const my = await (await memberPage.request.get("/api/org/my")).json();
    expect(my.org.membershipStatus).toBe("active");
    expect((await memberPage.request.get("/api/org/my/groups")).ok()).toBeTruthy();
    await memberContext.close();
  });

  test("hours given by the week or month become a yearly figure", async ({ page }) => {
    await signInWithMagicLink(page, api, hoursEmail);

    await page.goto("/wizard/actions");
    const postcodeInput = page.getByPlaceholder(/manchester|postcode|m1/i).first();
    const nextButton = page.getByRole("button", { name: /next:\s*add activities/i });
    await postcodeInput.waitFor({ state: "visible" });
    await expect(async () => {
      await postcodeInput.fill("M1");
      await expect(nextButton).toBeEnabled({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
    await nextButton.click();

    await page.waitForURL(/\/wizard\/activities/);
    await page.getByPlaceholder("Search activities…").fill("officiating");
    await page.getByRole("button", { name: /officiating/i }).first().click();
    await page.getByRole("button", { name: /^next: 1 selected/i }).click();

    await expect(page.getByText(/how many hours did you spend officiating.*\?$/i)).not.toContainText("this year");

    const estimator = page.getByTestId("activity-hours");
    await page.getByTestId("activity-hours-amount").fill("2");
    await expect(page.getByTestId("activity-hours-total")).toHaveText("About 80 hours a year");

    await page.getByTestId("activity-hours-share-part").click();
    await expect(page.getByTestId("activity-hours-total")).toHaveText("About 52 hours a year");

    await page.getByTestId("activity-hours-period-month").click();
    await expect(page.getByTestId("activity-hours-total")).toHaveText("About 52 hours a year");
    await page.getByTestId("activity-hours-amount").fill("10");
    await expect(page.getByTestId("activity-hours-total")).toHaveText("About 60 hours a year");

    await page.getByTestId("activity-hours-share-custom").click();
    await page.getByTestId("activity-hours-custom-count").fill("8");
    await expect(page.getByTestId("activity-hours-total")).toHaveText("About 80 hours a year");

    await expect(estimator).toBeVisible();
    await page.getByRole("button", { name: /^done/i }).click();

    await page.waitForURL(/\/wizard\/contributions/);
    await page.getByTestId("general-hours-amount").fill("1");
    await page.getByTestId("general-hours-share-nearly_all").click();
    await expect(page.getByTestId("general-hours-total")).toHaveText("About 46 hours a year");

    const calculate = page.waitForRequest(r => r.url().includes("/api/impact/calculate") && r.method() === "POST");
    await page.getByRole("button", { name: /reveal my impact/i }).click();
    const body = (await calculate).postDataJSON();
    expect(body.activities).toHaveLength(1);
    expect(body.activities[0].hoursPerYear).toBe(80);
    expect(body.additionalVolunteerHours).toBe(46);
    await page.waitForURL(/\/results/, { timeout: 30_000 });
  });

  test("a report for part of a year counts hours for that period", async ({ page }) => {
    await signInWithMagicLink(page, api, shortPeriodEmail);

    await page.goto("/wizard/actions");
    await page.getByTestId("report-period-custom").click();
    const year = new Date().getFullYear() - 1;
    await page.getByTestId("report-period-custom-start").fill(`${year}-04-01`);
    await page.getByTestId("report-period-custom-end").fill(`${year}-06-30`);

    const postcodeInput = page.getByPlaceholder(/manchester|postcode|m1/i).first();
    const nextButton = page.getByRole("button", { name: /next:\s*add activities/i });
    await postcodeInput.waitFor({ state: "visible" });
    await expect(async () => {
      await postcodeInput.fill("M1");
      await expect(nextButton).toBeEnabled({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
    await nextButton.click();

    await page.waitForURL(/\/wizard\/activities/);
    await page.getByPlaceholder("Search activities…").fill("officiating");
    await page.getByRole("button", { name: /officiating/i }).first().click();
    await page.getByRole("button", { name: /^next: 1 selected/i }).click();

    await page.getByTestId("activity-hours-amount").fill("2");
    await expect(page.getByTestId("activity-hours-total")).toHaveText("About 26 hours in this period");
    await expect(page.getByTestId("activity-hours-share-most")).toHaveCount(0);
    await expect(page.getByTestId("activity-hours-period-year")).toHaveText("in total");
  });
});
