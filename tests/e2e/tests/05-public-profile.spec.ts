import { test, expect } from "@playwright/test";
import { TestApi, uniqueEmail } from "../helpers/api";
import { signInWithMagicLink } from "../helpers/auth";
import { completeWizardWithExtraHours } from "../helpers/wizard";

test.describe("Spec 5 — public profile enable, privacy toggles, anonymous view, disable", () => {
  let api: TestApi;
  const email = uniqueEmail("profile");

  test.beforeAll(async ({ baseURL }) => {
    api = await TestApi.create({ baseURL: baseURL! });
    await api.resetUser(email);
  });

  test.afterAll(async () => {
    await api.resetUser(email);
    await api.dispose();
  });

  test("enable, toggle privacy, view anonymously, then disable", async ({ page, browser }) => {
    await signInWithMagicLink(page, api, email);

    // Seed some impact data so the public page has totals to show.
    await completeWizardWithExtraHours(page, { donationsGBP: 200, hours: 20 });

    // Enable the public profile via the settings UI.
    await page.goto("/settings");

    // Tick the GDPR acknowledgement checkbox first (the enable button is
    // disabled until this is checked).
    const gdprCheckbox = page.getByLabel(/i understand what publishing my profile means/i);
    await gdprCheckbox.waitFor({ state: "visible" });
    await gdprCheckbox.check();

    await page.getByRole("button", { name: /^enable public profile$/i }).click();

    // The profile is now live; the URL is rendered as a monospaced span.
    await expect(page.getByText(/your public url/i)).toBeVisible({ timeout: 15_000 });

    // Pull the actual slug from the API so we can navigate to the public URL.
    const meRes = await page.request.get("/api/public-profile/me");
    expect(meRes.ok()).toBe(true);
    const me = (await meRes.json()) as { profile: { slug: string; isEnabled: boolean } | null };
    const slug = me.profile?.slug;
    expect(slug).toBeTruthy();
    expect(me.profile?.isEnabled).toBe(true);

    // ── Anonymous view: open in a fresh context (no cookies) ──────────────
    const anonCtx = await browser.newContext();
    const anonPage = await anonCtx.newPage();
    await anonPage.goto(`/profile/${slug}`);
    // Any of the user's data should be visible — hours is the easiest tell.
    await expect(anonPage.getByText(/hours|volunteering|impact/i).first()).toBeVisible({
      timeout: 15_000,
    });

    // Hit the public JSON endpoint to assert that hours are exposed.
    let publicRes = await anonPage.request.get(`/api/public-profile/${slug}`);
    expect(publicRes.ok()).toBe(true);
    let publicBody = (await publicRes.json()) as {
      profile: { showHours: boolean };
      stats: { totalHours: number | null };
    };
    expect(publicBody.profile.showHours).toBe(true);
    expect(publicBody.stats.totalHours).toBeGreaterThan(0);

    // ── Toggle "show hours" off via the API and re-check anonymously ──────
    const updateRes = await page.request.put("/api/public-profile", {
      data: { showHours: false },
    });
    expect(updateRes.ok()).toBe(true);

    publicRes = await anonPage.request.get(`/api/public-profile/${slug}`);
    publicBody = (await publicRes.json()) as {
      profile: { showHours: boolean };
      stats: { totalHours: number | null };
    };
    expect(publicBody.profile.showHours).toBe(false);
    expect(publicBody.stats.totalHours).toBeNull();

    // ── Disable the profile entirely; anonymous view returns 404 ──────────
    const disableRes = await page.request.put("/api/public-profile", {
      data: { isEnabled: false },
    });
    expect(disableRes.ok()).toBe(true);

    publicRes = await anonPage.request.get(`/api/public-profile/${slug}`);
    expect(publicRes.status()).toBe(404);

    await anonCtx.close();
  });
});
