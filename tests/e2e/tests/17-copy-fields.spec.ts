import { test, expect, type Page } from "@playwright/test";
import { TestApi, uniqueEmail } from "../helpers/api";
import { signInWithMagicLink } from "../helpers/auth";
import { completeWizardWithExtraHours } from "../helpers/wizard";

/**
 * Spec 17 — every CopyField copy button copies the right value.
 *
 * Four copy boxes were consolidated into the shared CopyField component:
 *   1. Invite-a-friend modal (navbar user menu)
 *   2. Challenge invite link (personal challenge detail page)
 *   3. Organisation invite link (org settings)
 *   4. Results impact-statement / CV text (multiline)
 *
 * For each one we click the Copy button, assert the clipboard now holds the
 * expected value, and assert the button flips to its "Copied" feedback.
 */

async function readClipboard(page: Page): Promise<string> {
  return page.evaluate(() => navigator.clipboard.readText());
}

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

test.describe("Spec 17 — CopyField buttons copy the right thing", () => {
  let api: TestApi;
  const email = uniqueEmail("copyfields");
  let orgId: string | undefined;

  test.beforeAll(async ({ baseURL }) => {
    api = await TestApi.create({ baseURL: baseURL! });
    await api.resetUser(email);
  });

  test.afterAll(async () => {
    await api.resetUser(email);
    if (orgId) await api.deleteOrg(orgId);
    await api.dispose();
  });

  test("all four copy boxes copy their value and show copied feedback", async ({ page, baseURL }) => {
    const origin = new URL(baseURL!).origin;
    await signInWithMagicLink(page, api, email);

    // ── 1. Invite-a-friend modal (navbar user menu) ───────────────────────
    await page.goto("/history");
    await page.getByRole("button", { name: "My account" }).click();
    await page.getByRole("button", { name: "Invite a friend" }).click();

    const inviteInput = page.getByLabel("invite link", { exact: true });
    await expect(inviteInput).toBeVisible();
    const inviteUrl = await inviteInput.inputValue();
    expect(inviteUrl).toMatch(/\?ref=/);

    await page.getByRole("button", { name: "Copy invite link" }).click();
    await expect(page.getByRole("button", { name: "Copy invite link" })).toHaveText(/Copied!/);
    expect(await readClipboard(page)).toBe(inviteUrl);
    await page.getByRole("button", { name: "Close" }).click();

    // ── 2. Results impact statement (multiline CopyField) ─────────────────
    await completeWizardWithExtraHours(page, { hours: 6, save: false });

    const statementField = page.getByLabel("impact statement", { exact: true });
    await statementField.scrollIntoViewIfNeeded();
    await expect(statementField).toBeVisible();
    const statementText = await statementField.inputValue();
    expect(statementText.length).toBeGreaterThan(50);

    const statementButton = page.getByRole("button", { name: "Copy impact statement" });
    await statementButton.click();
    await expect(statementButton).toHaveText(/Copied!/);
    expect(await readClipboard(page)).toBe(statementText);

    // ── 3. Personal challenge invite link ─────────────────────────────────
    const now = Date.now();
    const createRes = await page.request.post("/api/challenges", {
      data: {
        name: `E2E Copy Challenge ${now}`,
        goalType: "hours",
        target: 10,
        startDate: new Date(now - 24 * 3600 * 1000).toISOString(),
        endDate: new Date(now + 7 * 24 * 3600 * 1000).toISOString(),
        scope: "personal",
      },
    });
    expect(createRes.ok()).toBe(true);
    const { challenge } = (await createRes.json()) as {
      challenge: { id: string; inviteCode: string };
    };

    await page.goto(`/challenges/${challenge.id}`);
    const challengeInput = page.getByLabel("challenge invite link", { exact: true });
    await expect(challengeInput).toBeVisible();
    const challengeUrl = await challengeInput.inputValue();
    expect(challengeUrl).toBe(`${origin}/challenges/join?code=${challenge.inviteCode}`);

    await page.getByRole("button", { name: "Copy challenge invite link" }).click();
    await expect(page.getByRole("button", { name: "Copy challenge invite link" })).toHaveText(/Copied/);
    expect(await readClipboard(page)).toBe(challengeUrl);

    // ── 4. Organisation invite link (org settings) ─────────────────────────
    const regRes = await page.request.post("/api/org/register", {
      data: {
        orgName: `E2E CopyField Org ${now}`,
        type: "charity",
        contactName: "E2E Copy Manager",
        contactEmail: email,
        size: "11–50",
        purpose: "CopyField e2e testing",
      },
    });
    expect(regRes.ok()).toBe(true);
    const approval = await api.approveOrgRegistration(email);
    orgId = approval.orgId;
    const joinRes = await page.request.post("/api/org/join", {
      data: { inviteCode: approval.inviteCode, orgId: approval.orgId },
    });
    expect(joinRes.ok()).toBe(true);

    await page.goto("/org/settings");
    const orgLinkInput = page.getByTestId("text-invite-link");
    await expect(orgLinkInput).toBeVisible({ timeout: 15_000 });
    await expect(orgLinkInput).not.toHaveValue(/Loading/);
    const orgLink = await orgLinkInput.inputValue();
    expect(orgLink).toBe(`${origin}/org?invite=${encodeURIComponent(approval.inviteCode)}`);

    await page.getByTestId("button-copy-invite-link").click();
    await expect(page.getByTestId("button-copy-invite-link")).toHaveText(/Copied/);
    expect(await readClipboard(page)).toBe(orgLink);
  });
});
