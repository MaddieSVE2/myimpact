import { test, expect, type Page } from "@playwright/test";
import { TestApi, uniqueEmail } from "../helpers/api";
import { signInWithMagicLink } from "../helpers/auth";

/**
 * Spec 42 — a record saved BEFORE joining an organisation is offered for
 * sharing afterwards, so the member never completes it again.
 *
 * Covers both sharing modes: in an explicit-submission organisation the
 * record has simply not been sent; in a consented-logging organisation it is
 * dated before the member's sharing date, so it is not shared automatically.
 */
test.describe("Spec 42 — share a record made before joining", () => {
  let api: TestApi;
  const orgIds: string[] = [];
  const emails: string[] = [];

  test.beforeAll(async ({ baseURL }) => {
    api = await TestApi.create({ baseURL: baseURL! });
  });

  test.afterAll(async () => {
    for (const email of emails) await api.resetUser(email);
    for (const orgId of orgIds) await api.deleteOrg(orgId);
    await api.dispose();
  });

  async function saveReport(page: Page, year: number): Promise<string> {
    const res = await page.request.post("/api/impact/save", {
      data: {
        userId: "",
        name: `My ${year} Report`,
        period: String(year),
        kind: "annual_estimate",
        activities: [{ activityId: "recycling", quantity: 12, hoursPerYear: 12 }],
        reportPeriod: { type: "calendar", startDate: `${year}-01-01`, endDate: `${year}-12-31` },
        donationsGBP: 0,
        additionalVolunteerHours: 0,
      },
    });
    expect(res.ok(), `report save failed: ${await res.text()}`).toBe(true);
    return String((await res.json()).id);
  }

  async function shareableIds(page: Page): Promise<string[]> {
    const res = await page.request.get("/api/org/my/shareable-records");
    expect(res.ok()).toBe(true);
    return ((await res.json()).records as Array<{ id: number }>).map(r => String(r.id));
  }

  async function shareFromHomeCard(page: Page, reportId: string) {
    await page.goto("/");
    await expect(page.getByTestId("home-share-saved-records")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId(`home-shareable-record-${reportId}`)).toBeVisible();
    await page.getByTestId(`home-link-share-record-${reportId}`).click();

    // Review & share: the saved record's own lines, nothing entered again.
    await expect(page.getByTestId("share-report-root")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("share-report-line-recycling")).toBeVisible();
    await page.getByTestId("share-report-submit").click();
    await expect(page.getByTestId("share-report-done")).toBeVisible({ timeout: 15_000 });

    const subs = await page.request.get("/api/org/my-submissions");
    expect(subs.ok()).toBe(true);
    const share = ((await subs.json()).submissions ?? []).find(
      (s: { sourceReportId?: number | null }) => String(s.sourceReportId ?? "") === reportId,
    );
    expect(share, `no share linked to record ${reportId}`).toBeTruthy();

    // Once shared, it is no longer offered.
    expect(await shareableIds(page)).not.toContain(reportId);
  }

  test("explicit-submission organisation: the earlier record is offered after joining and shares as it is", async ({ browser }) => {
    const email = uniqueEmail("share-before-join");
    emails.push(email);
    await api.resetUser(email);
    const org = await api.createOrg(`E2E Share Before Join ${Date.now()}`, "charity");
    orgIds.push(org.orgId);

    const ctx = await browser.newContext();
    try {
      const page = await ctx.newPage();
      await signInWithMagicLink(page, api, email);

      // The record exists before the member has any organisation.
      const reportId = await saveReport(page, new Date().getUTCFullYear());
      expect(await shareableIds(page)).toEqual([]);

      const join = await page.request.post("/api/org/join", {
        data: { inviteCode: org.inviteCode, orgId: org.orgId },
      });
      expect(join.ok()).toBe(true);

      expect(await shareableIds(page)).toContain(reportId);
      await shareFromHomeCard(page, reportId);
    } finally {
      await ctx.close();
    }
  });

  test("consented-logging organisation: a record dated before the sharing date can be shared, a later one is automatic", async ({ browser }) => {
    const email = uniqueEmail("share-before-consent");
    emails.push(email);
    await api.resetUser(email);
    const org = await api.createOrg(`E2E Share Before Consent ${Date.now()}`, "charity", undefined, "consented_logging");
    orgIds.push(org.orgId);

    const ctx = await browser.newContext();
    try {
      const page = await ctx.newPage();
      await signInWithMagicLink(page, api, email);

      // Last year's report: dated before today, when sharing will start.
      const earlierId = await saveReport(page, new Date().getUTCFullYear() - 1);

      const join = await page.request.post("/api/org/join", {
        data: { inviteCode: org.inviteCode, orgId: org.orgId, consentScope: "from_join" },
      });
      expect(join.ok()).toBe(true);

      // This year's report is dated today, so it is shared automatically
      // and must not be offered (or accepted) for Review & share.
      const currentId = await saveReport(page, new Date().getUTCFullYear());
      const ids = await shareableIds(page);
      expect(ids).toContain(earlierId);
      expect(ids).not.toContain(currentId);
      const refused = await page.request.post("/api/org/member-submit", {
        data: { sourceReportId: Number(currentId), activities: [{ activityId: "recycling" }] },
      });
      expect(refused.status()).toBe(400);
      expect((await refused.json()).code).toBe("already_visible");

      await shareFromHomeCard(page, earlierId);
    } finally {
      await ctx.close();
    }
  });
});
