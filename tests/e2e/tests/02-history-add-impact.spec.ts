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
    const body = (await recordsRes.json()) as {
      records: Array<{ id: string; entryDate: string; impactResult: { totalValue: number } }>;
    };
    expect(body.records.length).toBeGreaterThanOrEqual(2);

    // My Impact is a current-year running record, not a latest-entry report.
    // Navigate there in the same signed-in session and verify every saved row
    // appears in the API's newest-first order beneath the annual total.
    await page.goto("/impact");
    await expect(page.getByText(new RegExp(`Your ${new Date().getFullYear()} running record`, "i"))).toBeVisible();
    await expect(page.getByText(/reconciled running total/i)).toBeVisible();
    await expect(page.getByText(/latest entry/i)).toHaveCount(0);

    const runningRecord = page.getByTestId("impact-running-record");
    const recordCards = runningRecord.locator('[data-testid^="impact-record-"]');
    await expect(recordCards).toHaveCount(body.records.length);
    const expectedOrder = [...body.records].sort((a, b) => b.entryDate.localeCompare(a.entryDate));
    await expect
      .poll(() => recordCards.evaluateAll(cards => cards.map(card => card.getAttribute("data-entry-date"))))
      .toEqual(expectedOrder.map(record => record.entryDate));
    for (const record of body.records) {
      await expect(page.getByTestId(`impact-record-${record.id}`)).toContainText(
        new Intl.NumberFormat("en-GB", {
          style: "currency",
          currency: "GBP",
          maximumFractionDigits: 0,
        }).format(record.impactResult.totalValue),
      );
    }

    // Regression guard: the attachment counts lookup must return 200 with
    // empty maps when the user has records but no uploaded photos.
    // A type/cast mismatch on the nullable record_id column would cause a
    // 500 error here instead of a clean empty response.
    const recordIds = body.records.map((r) => r.id).join(",");
    const countsRes = await page.request.get(`/api/attachments/counts?recordIds=${encodeURIComponent(recordIds)}`);
    expect(countsRes.ok()).toBe(true);
    const counts = (await countsRes.json()) as { records: Record<string, number>; journals: Record<string, number> };
    expect(counts.records).toBeDefined();
    // No attachments uploaded → every count should be 0 (keys absent from map).
    expect(Object.values(counts.records).every((n) => n === 0)).toBe(true);

    // A failed recap request must never be presented as an authoritative £0
    // while the user's non-zero records have loaded successfully.
    await page.route("**/api/impact/recap/*", route =>
      route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Unavailable" }) }),
    );
    await page.reload();
    await expect(page.getByText(/couldn’t load your yearly total/i)).toBeVisible();
    await expect(page.getByText(/reconciled running total/i)).toHaveCount(0);
    await expect(page.getByTestId("results-hero-value")).toHaveCount(0);
  });
});
