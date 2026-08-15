import { test, expect } from "@playwright/test";
import { TestApi, uniqueEmail } from "../helpers/api";
import { signInWithMagicLink } from "../helpers/auth";

/**
 * Spec 17 — editing a cross-year report keeps Results' annual hero and the
 * History year total on the SAME calendar year.
 *
 * A Full Impact Report can cover an academic year spanning two calendar
 * years (e.g. Sep 2025 – Aug 2026) while being bucketed — by its persisted
 * entryDate — into the earlier year. Editing such a report while "today" is
 * in the later year must:
 *   - show the bucketed year (2025) in the Results hero, not today's year,
 *   - keep showing it AFTER the edit-save completes (post-save render),
 *   - keep the hero total equal to the reconciled recap total for that year
 *     (the same figure History's "{year} total" card uses).
 */
test.describe("Spec 17 — cross-year report edit keeps annual totals aligned", () => {
  let api: TestApi;
  const email = uniqueEmail("crossyear");

  // The report's academic period straddles two calendar years; the entry
  // date homes the record in the EARLIER year.
  const PERIOD_START = "2025-09-01";
  const PERIOD_END = "2026-08-31";
  const ENTRY_DATE = "2025-10-01";
  const BUCKET_YEAR = 2025;

  test.beforeAll(async ({ baseURL }) => {
    api = await TestApi.create({ baseURL: baseURL! });
    await api.resetUser(email);
  });

  test.afterAll(async () => {
    await api.resetUser(email);
    await api.dispose();
  });

  test("Results hero uses the record's bucketed year before and after an edit-save", async ({ page }) => {
    await signInWithMagicLink(page, api, email);

    // Seed a cross-year academic report through the real save endpoint.
    const calcRes = await page.request.post("/api/impact/calculate", {
      data: { description: "", activities: [], donationsGBP: 40, additionalVolunteerHours: 6 },
    });
    expect(calcRes.ok()).toBe(true);
    const impactResult = await calcRes.json();

    const meRes = await page.request.get("/api/auth/me");
    expect(meRes.ok()).toBe(true);
    const me = (await meRes.json()) as { user?: { id?: string }; id?: string };
    const userId = me.user?.id ?? me.id ?? "";

    const saveRes = await page.request.post("/api/impact/save", {
      data: {
        userId,
        name: "My Impact Record",
        entryDate: ENTRY_DATE,
        reportPeriod: { type: "academic", startDate: PERIOD_START, endDate: PERIOD_END },
        impactResult,
        activities: [],
        donationsGBP: 40,
        additionalVolunteerHours: 6,
        kind: "annual_estimate",
      },
    });
    expect(saveRes.ok()).toBe(true);
    const savedRecord = (await saveRes.json()) as { id: number | string; entryDate: string };
    // Server must keep the explicit in-period entry date → bucketed in 2025.
    expect(String(savedRecord.entryDate).slice(0, 4)).toBe(String(BUCKET_YEAR));

    // Open the record for editing via the History deep link. History's list
    // is year-filtered, so pin the year picker to the bucketed year first.
    await page.addInitScript((year) => {
      window.localStorage.setItem("mi_history_year", String(year));
      // Suppress the year-rollover modal — it overlays the wizard and would
      // intercept clicks; it's irrelevant to this regression.
      window.sessionStorage.setItem("mi_year_rollover_dismissed_at", new Date().toISOString());
    }, BUCKET_YEAR);
    await page.goto(`/history?edit=${savedRecord.id}`);

    // The deep link drops us into the wizard edit flow.
    await page.waitForURL(/\/wizard\/activities/, { timeout: 20_000 });
    // The step animates in; allow extra time for the button to settle.
    await page.getByRole("button", { name: /^skip$/i }).click({ timeout: 30_000 });
    await page.waitForURL(/\/wizard\/contributions/);
    // Contribution inputs are prefilled from the record; tweak the extra
    // hours so this is a genuine edit that changes the value.
    const numberInputs = page.locator('input[type="number"]');
    await numberInputs.first().fill("40");
    await numberInputs.nth(1).fill("8");
    await page.getByRole("button", { name: /reveal my impact/i }).click();
    await page.waitForURL(/\/results/, { timeout: 30_000 });

    // BEFORE save: hero must show the bucketed year, not today's year.
    const heroHeadline = page.getByText(new RegExp(`Your ${BUCKET_YEAR} social value`, "i"));
    await expect(heroHeadline).toBeVisible({ timeout: 20_000 });

    // Save the edit and check the POST-SAVE render keeps the bucketed year.
    await page.getByRole("button", { name: /^update entry$/i }).click();
    await expect(page.getByRole("button", { name: /^updated!$/i })).toBeVisible({ timeout: 15_000 });
    await expect(heroHeadline).toBeVisible();

    // The hero total must equal the reconciled recap total for the bucketed
    // year — the exact figure History's "{year} total" card shows.
    const recapRes = await page.request.get(`/api/impact/recap/${BUCKET_YEAR}`);
    expect(recapRes.ok()).toBe(true);
    const recap = (await recapRes.json()) as { totalValue: number };
    const formatted = new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
      maximumFractionDigits: 0,
    }).format(recap.totalValue);
    await expect(
      page.getByRole("heading", { level: 1 }).filter({ hasText: formatted }),
    ).toBeVisible({ timeout: 15_000 });

    // History's "{year} total" card must display the SAME reconciled figure.
    // (This user has no org matching, so nothing is added on top; matched
    // funding is a deliberate History-only addition per product spec.)
    await page.goto("/history");
    await expect(page.getByTestId("select-history-year")).toHaveValue(String(BUCKET_YEAR));
    await expect(page.getByTestId("text-history-year-total")).toHaveText(formatted, { timeout: 15_000 });

    // And the record must NOT have leaked into today's calendar year.
    const recapNowRes = await page.request.get(`/api/impact/recap/${new Date().getFullYear()}`);
    expect(recapNowRes.ok()).toBe(true);
    const recapNow = (await recapNowRes.json()) as { totalValue: number };
    expect(recapNow.totalValue).toBe(0);
  });
});
