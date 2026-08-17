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

  test("History withdraw button removes the badge and restores Review & share", async ({ browser }) => {
    // Create a fresh org + member and share a report, then withdraw it from History.
    const withdrawEmail = uniqueEmail("withdraw-history");
    const created2 = await api.createOrg(`E2E Withdraw History Org ${Date.now()}`, "charity");
    const withdrawOrgId = created2.orgId;

    const ctx = await browser.newContext();
    try {
      const page = await ctx.newPage();
      await api.resetUser(withdrawEmail);
      await signInWithMagicLink(page, api, withdrawEmail);

      const join = await page.request.post("/api/org/join", {
        data: { inviteCode: created2.inviteCode, orgId: withdrawOrgId },
      });
      expect(join.ok()).toBe(true);

      // Save a Full Impact Report.
      const saveRes = await page.request.post("/api/impact/save", {
        data: {
          userId: "",
          name: "Withdraw Test Report",
          period: "2026",
          kind: "annual_estimate",
          activities: [{ activityId: "recycling", quantity: 6, hoursPerYear: 6 }],
          reportPeriod: { type: "calendar", startDate: "2026-01-01", endDate: "2026-12-31" },
          donationsGBP: 0,
          additionalVolunteerHours: 0,
        },
      });
      expect(saveRes.ok(), `report save failed: ${await saveRes.text()}`).toBe(true);
      const saved = await saveRes.json();
      const reportId = String(saved.id);

      // Share it via the member-submit endpoint — same payload the share-report
      // UI sends: sourceReportId selects the report; activities lists which
      // activities to include (quantities are copied server-side from the report).
      const shareRes = await page.request.post("/api/org/member-submit", {
        data: {
          sourceReportId: Number(reportId),
          activities: [{ activityId: "recycling" }],
        },
      });
      expect(shareRes.ok(), `member-submit failed: ${await shareRes.text()}`).toBe(true);
      const shareJson = await shareRes.json();
      const twinId: number = shareJson.record?.id;
      expect(twinId, "twinId should be a number from record.id").toBeTruthy();

      // History: "Shared with" badge must be visible; "Review & share" must be hidden.
      await page.goto("/history");
      const badge = page.getByTestId(`badge-shared-with-${reportId}`);
      await expect(badge).toBeVisible({ timeout: 15_000 });
      const shareLink = page.getByTestId(`link-share-report-${reportId}`);
      await expect(shareLink).not.toBeVisible();

      // Withdraw — click the × button on the badge, then confirm.
      await page.getByTestId(`button-withdraw-share-${reportId}`).click();
      const confirmBtn = page.getByTestId(`button-confirm-withdraw-${reportId}`);
      await expect(confirmBtn).toBeVisible({ timeout: 5_000 });
      await confirmBtn.click();

      // Badge disappears; "Review & share" reappears.
      await expect(badge).not.toBeVisible({ timeout: 10_000 });
      await expect(shareLink).toBeVisible({ timeout: 10_000 });

      // Server-side: the twin should be gone.
      const subsAfter = await page.request.get("/api/org/my-submissions");
      expect(subsAfter.ok()).toBe(true);
      const subsAfterJson = await subsAfter.json();
      const remaining = (subsAfterJson.submissions ?? subsAfterJson.records ?? []).find(
        (s: { sourceReportId?: number | null }) => String(s.sourceReportId ?? "") === reportId,
      );
      expect(remaining, "twin should be gone after withdrawal").toBeFalsy();
    } finally {
      await ctx.close();
      await api.resetUser(withdrawEmail);
      await api.deleteOrg(withdrawOrgId);
    }
  });
});
