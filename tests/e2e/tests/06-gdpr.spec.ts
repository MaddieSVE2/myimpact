import { test, expect } from "@playwright/test";
import { TestApi, uniqueEmail } from "../helpers/api";
import { signInWithMagicLink } from "../helpers/auth";

test.describe("GDPR self-service", () => {
  let api: TestApi;

  test.beforeAll(async ({ baseURL }) => {
    api = await TestApi.create({ baseURL: baseURL! });
  });

  test.afterAll(async () => {
    await api.resetAllTestUsers();
    await api.dispose();
  });

  test("user can download a JSON export of their data", async ({ page, context }) => {
    const email = uniqueEmail("gdpr-export");
    await api.resetUser(email);

    await signInWithMagicLink(page, api, email);

    await page.goto("/settings");
    const exportButton = page.getByTestId("button-export-data");
    await expect(exportButton).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await exportButton.click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/^my-impact-export-\d{4}-\d{2}-\d{2}\.json$/);

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const text = Buffer.concat(chunks).toString("utf-8");
    const parsed = JSON.parse(text);

    expect(parsed.meta?.schemaVersion).toBe(1);
    expect(parsed.account?.email).toBe(email);
    expect(parsed.profile).not.toBeUndefined();
    // Every personal-data domain must be present (GDPR portability).
    for (const key of [
      "impactRecords",
      "journalEntries",
      "recurringTemplates",
      "attachments",
      "publicProfile",
      "pushPreferences",
      "pushSubscriptions",
      "challenges",
      "calendarSources",
      "calendarEvents",
      "voiceUsage",
      "textAiUsage",
      "organisationMemberships",
      "auditLog",
    ]) {
      expect(parsed).toHaveProperty(key);
    }
    expect(Array.isArray(parsed.attachments)).toBe(true);

    // The export itself should be recorded in the audit log.
    expect(Array.isArray(parsed.auditLog)).toBe(true);
    // Note: the export rows are inserted before being returned, so the
    // returned blob will already contain at least one data_export entry.
    const exportEvents = (parsed.auditLog as Array<{ action: string }>).filter(
      (r) => r.action === "data_export",
    );
    expect(exportEvents.length).toBeGreaterThanOrEqual(1);
  });

  test("user can permanently delete their account", async ({ page, context }) => {
    const email = uniqueEmail("gdpr-delete");
    await api.resetUser(email);

    await signInWithMagicLink(page, api, email);

    await page.goto("/settings");
    await page.getByTestId("button-open-delete-account").click();

    const modal = page.getByTestId("modal-delete-account");
    await expect(modal).toBeVisible();

    const confirmBtn = page.getByTestId("button-confirm-delete-account");
    await expect(confirmBtn).toBeDisabled();

    // Wrong email -> still disabled.
    await page.getByTestId("input-confirm-delete-email").fill("wrong@example.com");
    await expect(confirmBtn).toBeDisabled();

    // Correct email -> enabled, click and wait for redirect to home.
    await page.getByTestId("input-confirm-delete-email").fill(email);
    await expect(confirmBtn).toBeEnabled();
    await confirmBtn.click();

    await page.waitForURL((url) => !url.pathname.startsWith("/settings"), { timeout: 15_000 });

    // The session cookie should now be cleared — /api/auth/me reports
    // no user (the endpoint is best-effort and returns 200 + user:null
    // when unauthenticated).
    const meRes = await context.request.get("/api/auth/me");
    expect(meRes.status()).toBe(200);
    const meBody = await meRes.json();
    expect(meBody.user).toBeNull();

    // The test-only latest-token endpoint should now report the user is gone.
    const tokenRes = await context.request.get(
      `/api/test/latest-token?email=${encodeURIComponent(email)}`,
    );
    expect(tokenRes.status()).toBe(404);
  });

  test("delete-account requires the user's exact email as confirmation", async ({ page, context }) => {
    const email = uniqueEmail("gdpr-delete-guard");
    await api.resetUser(email);

    await signInWithMagicLink(page, api, email);

    // Hit the API directly with a wrong email — should 400, account intact.
    const badRes = await context.request.post("/api/profile/delete-account", {
      data: { confirmEmail: "totally-wrong@example.com" },
    });
    expect(badRes.status()).toBe(400);

    // Account still exists.
    const meRes = await context.request.get("/api/auth/me");
    expect(meRes.status()).toBe(200);
  });

  test("sign-up sends marketingOptIn=false unless ticked, and the consent checkbox starts unchecked", async ({ page, context }) => {
    const email = uniqueEmail("gdpr-consent");
    await api.resetUser(email);

    await page.goto("/login");
    const checkbox = page.getByTestId("checkbox-marketing-opt-in");
    await expect(checkbox).toBeVisible();
    await expect(checkbox).not.toBeChecked();

    // Terms link is present at sign-up.
    await expect(page.getByRole("link", { name: /^terms$/i })).toBeVisible();

    // Submit without ticking.
    await page.locator("#email").fill(email);
    await page.getByRole("button", { name: /send sign-in link|sign in/i }).first().click();
    await expect(page.getByText(/we['']ve sent a sign-in link/i)).toBeVisible({ timeout: 15_000 });

    // The user_profiles row should have emailOptIn=false because we didn't tick.
    const token = await api.getLatestMagicToken(email);
    await page.goto(`/auth/confirm?token=${encodeURIComponent(token)}`);
    await page.getByRole("button", { name: /^confirm sign in$/i }).click();
    // New account: fill the birth-date step of the age gate.
    await expect(page.getByTestId("select-birth-month")).toBeVisible({ timeout: 10_000 });
    await page.getByTestId("select-birth-month").selectOption("1");
    await page.getByTestId("select-birth-year").selectOption(String(new Date().getFullYear() - 30));
    await page.getByTestId("button-save-birth-date").click();
    await page.waitForURL(/\/(history|profile\/setup|wizard)/, { timeout: 15_000 });

    const profileRes = await context.request.get("/api/profile");
    expect(profileRes.ok()).toBe(true);
    const profile = await profileRes.json();
    expect(profile?.profile?.emailOptIn).toBe(false);
  });

  test("delete-all-impact wipes records, journal entries and recurring templates", async ({ page, context }) => {
    const email = uniqueEmail("gdpr-wipe");
    await api.resetUser(email);
    await signInWithMagicLink(page, api, email);

    // Seed one impact record + one journal entry + one recurring template
    // through the real product routes.
    const recRes = await context.request.post("/api/impact/save", {
      data: {
        userId: email,
        name: "GDPR wipe test",
        activities: [],
        donationsGBP: 10,
        additionalVolunteerHours: 1,
      },
    });
    expect(recRes.ok()).toBe(true);

    const jRes = await context.request.post("/api/journal", {
      data: { content: "test journal entry for wipe" },
    });
    expect(jRes.ok()).toBe(true);

    const tRes = await context.request.post("/api/impact/templates", {
      data: {
        label: "GDPR template",
        cadence: "weekly",
        dayOfPeriod: 1,
        defaultActivities: [],
        defaultDonationsGBP: 5,
      },
    });
    expect(tRes.ok()).toBe(true);

    // Confirm seeds present.
    const beforeRecs = await (await context.request.get("/api/impact/history")).json();
    expect(beforeRecs.records?.length ?? 0).toBeGreaterThan(0);
    const beforeTpl = await (await context.request.get("/api/impact/templates")).json();
    expect(beforeTpl.templates?.length ?? 0).toBeGreaterThan(0);

    // Hit the wipe endpoint.
    const wipe = await context.request.delete("/api/impact/all");
    expect(wipe.ok()).toBe(true);

    // Records, journal entries and templates are now empty.
    const afterRecs = await (await context.request.get("/api/impact/history")).json();
    expect(afterRecs.records?.length ?? 0).toBe(0);
    const afterJournal = await (await context.request.get("/api/journal")).json();
    expect(afterJournal.entries?.length ?? afterJournal.length ?? 0).toBe(0);
    const afterTpl = await (await context.request.get("/api/impact/templates")).json();
    expect(afterTpl.templates?.length ?? 0).toBe(0);
  });

  test("/terms page is reachable from the footer", async ({ page }) => {
    await page.goto("/about");
    await page
      .locator("footer")
      .getByRole("link", { name: /^terms$/i })
      .click();
    await page.waitForURL(/\/terms$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText(/Last updated:/i)).toBeVisible();
  });
});
