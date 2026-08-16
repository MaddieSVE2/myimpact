import { test, expect } from "@playwright/test";
import { TestApi, uniqueEmail } from "../helpers/api";
import { signInWithMagicLink } from "../helpers/auth";

/**
 * Spec 21 — History twin-dedupe + "Shared with X" badge.
 *
 * When a user submits a quick-log activity to their org with
 * saveToPersonal=true, the API creates two records:
 *   • A personal "user" record whose resultJson.orgRecordId points to the
 *     member-submitted twin.
 *   • A "member-submitted" twin owned by the org.
 *
 * The /history endpoint must collapse the pair into a single row and attach
 * sharedWith metadata so the UI can render the "Shared with <org>" badge.
 *
 * This spec is the regression guard for that behaviour:
 *   1. Exactly one history card appears (twin is not duplicated).
 *   2. The "Shared with <org>" badge is visible on that card.
 */
test.describe("Spec 21 — History twin-dedupe and Shared-with badge", () => {
  let api: TestApi;
  const memberEmail = uniqueEmail("twin-dedupe");
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

  test("only one history row appears and the Shared-with badge is visible", async ({
    browser,
  }) => {
    test.setTimeout(90_000);

    const created = await api.createOrg(
      `E2E Twin Dedupe Org ${Date.now()}`,
      "charity",
    );
    orgId = created.orgId;

    const ctx = await browser.newContext();
    try {
      const page = await ctx.newPage();

      // ── 1. Sign in and join the org ──────────────────────────────────────
      await signInWithMagicLink(page, api, memberEmail);

      const joinRes = await page.request.post("/api/org/join", {
        data: { inviteCode: created.inviteCode, orgId },
      });
      expect(
        joinRes.ok(),
        `join failed: ${await joinRes.text()}`,
      ).toBe(true);

      // ── 2. Submit a quick-log activity to the org with saveToPersonal ────
      // This creates the twin pair: a member-submitted org record (id=N) and
      // a personal user record whose resultJson.orgRecordId = N.
      const submitRes = await page.request.post("/api/org/member-submit", {
        data: {
          name: "Litter pick",
          activityDate: "2026-06-15",
          activities: [
            { activityId: "litter_picking", quantity: 2, hoursPerYear: 2 },
          ],
          saveToPersonal: true,
        },
      });
      expect(
        submitRes.ok(),
        `member-submit failed: ${await submitRes.text()}`,
      ).toBe(true);

      // ── 3. Server-side: history must collapse the pair to one record ─────
      const historyApiRes = await page.request.get("/api/impact/history");
      expect(historyApiRes.ok()).toBe(true);
      const historyJson = (await historyApiRes.json()) as {
        records: Array<{
          id: number;
          sharedWith: { orgId: string; orgName: string } | null;
        }>;
      };

      // Exactly one record visible to the user (twin suppressed).
      expect(
        historyJson.records.length,
        `expected 1 history record after twin-dedupe, got ${historyJson.records.length}: ${JSON.stringify(historyJson.records.map((r) => ({ id: r.id, sharedWith: r.sharedWith })))}`,
      ).toBe(1);

      // The single record carries sharedWith metadata.
      const record = historyJson.records[0];
      expect(
        record.sharedWith,
        "sharedWith must not be null on the deduped record",
      ).not.toBeNull();
      expect(record.sharedWith?.orgId).toBe(orgId);

      // ── 4. UI: the badge renders and only one card exists in History ─────
      await page.goto("/history");

      // Wait for at least one history card to load.
      await expect(
        page.locator('[data-testid^="card-record-"]').first(),
      ).toBeVisible({ timeout: 20_000 });

      // The "Shared with …" badge for the personal record must be present.
      await expect(
        page.getByTestId(`badge-shared-with-${record.id}`),
      ).toBeVisible({ timeout: 10_000 });

      // The badge text must name the org.
      await expect(
        page.getByTestId(`badge-shared-with-${record.id}`),
      ).toContainText(created.orgName);

      // Only one card is shown — the twin (member-submitted record) is hidden.
      const allCards = page.locator('[data-testid^="card-record-"]');
      await expect(allCards).toHaveCount(1);
    } finally {
      await ctx.close();
    }
  });
});
