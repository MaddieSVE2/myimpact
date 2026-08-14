import { test, expect } from "@playwright/test";
import { TestApi, uniqueEmail } from "../helpers/api";
import { signInWithMagicLink } from "../helpers/auth";

/**
 * Spec 20 — deferred "Review & share" of a saved Full Impact Report.
 *
 * A member of an explicit-submission org who skipped the post-save prompt
 * must still be able to share a saved report later: History shows a
 * "Review & share" entry point on qualifying reports, leading to the
 * pre-populated checklist (no re-entry) and a period-level submission.
 */
test.describe("Spec 20 — share a saved report from History", () => {
  let api: TestApi;
  const memberEmail = uniqueEmail("share-history");
  let orgId: string | undefined;

  test.beforeAll(async ({ baseURL }) => {
    api = await TestApi.create({ baseURL: baseURL! });
    await api.resetUser(memberEmail);
  });

  test.afterAll(async () => {
    await api.resetUser(memberEmail);
    if (orgId) await api.deleteOrg(orgId);
    await api.dispose();
  });

  test("History shows Review & share for a saved report and the flow submits without re-entry", async ({ browser }) => {
    const created = await api.createOrg(`E2E Share History Org ${Date.now()}`, "charity");
    orgId = created.orgId;

    const ctx = await browser.newContext();
    try {
      const page = await ctx.newPage();
      await signInWithMagicLink(page, api, memberEmail);

      const join = await page.request.post("/api/org/join", {
        data: { inviteCode: created.inviteCode, orgId },
      });
      expect(join.ok()).toBe(true);

      // Save a Full Impact Report via the API (same contract as the wizard).
      const saveRes = await page.request.post("/api/impact/save", {
        data: {
          userId: "",
          name: "My Yearly Report",
          period: "2026",
          kind: "annual_estimate",
          activities: [{ activityId: "recycling", quantity: 12, hoursPerYear: 12 }],
          reportPeriod: { type: "calendar", startDate: "2026-01-01", endDate: "2026-12-31" },
          donationsGBP: 0,
          additionalVolunteerHours: 0,
        },
      });
      expect(saveRes.ok(), `report save failed: ${await saveRes.text()}`).toBe(true);
      const saved = await saveRes.json();
      const reportId = String(saved.id);

      // History exposes the deferred entry point on the qualifying report.
      await page.goto("/history");
      const shareLink = page.getByTestId(`link-share-report-${reportId}`);
      await expect(shareLink).toBeVisible({ timeout: 15_000 });
      await shareLink.click();

      // Review & share: pre-populated checklist, nothing re-entered.
      await expect(page.getByTestId("share-report-root")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId("share-report-checklist")).toBeVisible();
      await expect(page.getByTestId("share-report-line-recycling")).toBeVisible();
      await expect(page.getByTestId("share-report-period")).toBeVisible();

      await page.getByTestId("share-report-submit").click();
      await expect(page.getByTestId("share-report-done")).toBeVisible({ timeout: 15_000 });

      // Server-side: the submission is period-level and linked to the report.
      const subs = await page.request.get("/api/org/my-submissions");
      expect(subs.ok()).toBe(true);
      const subsJson = await subs.json();
      const share = (subsJson.submissions ?? subsJson.records ?? []).find(
        (s: { sourceReportId?: number | null }) => String(s.sourceReportId ?? "") === reportId,
      );
      expect(share, `no share linked to report ${reportId}: ${JSON.stringify(subsJson).slice(0, 400)}`).toBeTruthy();
    } finally {
      await ctx.close();
    }
  });
});
