import { test, expect, type Browser, type Page } from "@playwright/test";
import { TestApi, uniqueEmail } from "../helpers/api";
import { signInWithMagicLink } from "../helpers/auth";

/**
 * Spec 36 — Hours a manager approved can't be changed, and an organisation can
 * accept members from several email domains.
 */
test.describe("Spec 36 — approved hours and email domains", () => {
  let api: TestApi;
  const emails: string[] = [];
  const orgIds: string[] = [];

  test.beforeAll(async ({ baseURL }) => {
    api = await TestApi.create({ baseURL: baseURL! });
  });

  test.afterAll(async () => {
    for (const id of orgIds) await api.deleteOrg(id);
    for (const email of emails) await api.resetUser(email);
    await api.dispose();
  });

  async function signedIn(browser: Browser, prefix: string): Promise<Page> {
    const email = uniqueEmail(prefix);
    emails.push(email);
    const context = await browser.newContext({ locale: "en-GB" });
    const page = await context.newPage();
    await signInWithMagicLink(page, api, email);
    return page;
  }

  async function logHours(page: Page, hours: number, targetRecordId?: number) {
    return page.request.post("/api/impact/save", {
      data: {
        userId: "",
        name: "My Impact Record",
        activities: [{ activityId: "recycling", quantity: 26, hoursPerYear: hours }],
        donationsGBP: 0,
        additionalVolunteerHours: 0,
        force: true,
        ...(targetRecordId ? { targetRecordId: String(targetRecordId) } : {}),
      },
    });
  }

  test("hours a manager approved are locked, and automatic approvals stay editable", async ({ browser }) => {
    const manager = await signedIn(browser, "mgr36");
    const org = await api.createOrg("Spec 36 Netball", "charity", emails[emails.length - 1]);
    orgIds.push(org.orgId);
    const invite = { inviteCode: org.inviteCode, orgId: org.orgId };
    expect((await manager.request.post("/api/org/join", { data: invite })).ok()).toBeTruthy();
    await manager.request.patch("/api/org/my/settings", { data: { autoApproveMembers: true } });

    const member = await signedIn(browser, "mem36");
    expect((await member.request.post("/api/org/join", { data: invite })).ok()).toBeTruthy();
    const saved = await logHours(member, 12);
    expect(saved.ok(), await saved.text()).toBeTruthy();
    const recordId = Number(((await saved.json()) as { id: string | number }).id);
    expect((await manager.request.post("/api/org/verifications/decide", { data: { recordId, decision: "approve" } })).ok()).toBeTruthy();

    // ---- The server refuses changes to hours and date ----------------------
    const edit = await logHours(member, 500, recordId);
    expect(edit.status()).toBe(409);
    const body = (await edit.json()) as { code: string; error: string };
    expect(body.code).toBe("approved_hours_locked");
    expect(body.error).toBe("Spec 36 Netball approved these hours, so they can't be changed. To correct them, delete this entry and log it again.");
    expect((await member.request.patch(`/api/impact/${recordId}`, { data: { entryDate: "2024-01-15" } })).status()).toBe(409);
    expect((await member.request.patch(`/api/impact/${recordId}`, { data: { periodLabel: "Club season" } })).ok()).toBeTruthy();

    // ---- History says why, and offers no way to change them ----------------
    await member.goto("/history");
    await member.getByRole("button", { name: /^expand$/i }).first().click();
    await expect(member.getByTestId(`text-hours-locked-${recordId}`)).toContainText("Spec 36 Netball approved these hours");
    await expect(member.getByTestId(`button-edit-activities-${recordId}`)).toHaveCount(0);
    await member.getByTestId(`button-edit-record-${recordId}`).click();
    await expect(member.getByTestId(`input-edit-entry-date-${recordId}`)).toHaveCount(0);

    // ---- Deleting stays possible --------------------------------------------
    expect((await member.request.delete(`/api/impact/${recordId}`)).ok()).toBeTruthy();

    // ---- An organisation that approves automatically leaves them editable ---
    await api.setOrgSettings(org.orgId, { autoVerifyActivities: true });
    const auto = await logHours(member, 5);
    const autoId = Number(((await auto.json()) as { id: string | number }).id);
    const autoEdit = await logHours(member, 6, autoId);
    expect(autoEdit.ok(), await autoEdit.text()).toBeTruthy();
  });

  test("an organisation can accept members from several email domains", async ({ browser }) => {
    const manager = await signedIn(browser, "dmg36");
    const org = await api.createOrg("Spec 36 College", "charity", emails[emails.length - 1]);
    orgIds.push(org.orgId);
    const invite = { inviteCode: org.inviteCode, orgId: org.orgId };
    expect((await manager.request.post("/api/org/join", { data: invite })).ok()).toBeTruthy();

    // Typed the way Loughborough College did, with a semicolon.
    await manager.goto("/org/settings");
    const field = manager.getByTestId("input-allowed-domain");
    await field.fill("student.example.org; @Partner.org");
    await manager.getByTestId("button-save-allowed-domain").click();
    await expect(field).toHaveValue("student.example.org, partner.org");

    await field.fill("student.example.org, partner");
    await manager.getByTestId("button-save-allowed-domain").click();
    await expect(manager.getByText(`"partner" isn't a valid domain. Enter domains like organisation.org, separated by commas.`)).toBeVisible();

    // Someone at neither domain is told which ones are accepted.
    const outsider = await signedIn(browser, "out36");
    await outsider.goto(`/org?invite=${org.inviteCode}`);
    await expect(outsider.getByTestId("notice-domain-mismatch")).toContainText("@student.example.org or @partner.org");
    const refused = await outsider.request.post("/api/org/join", { data: invite });
    expect(refused.status()).toBe(403);
    expect(((await refused.json()) as { error: string }).error).toBe(
      "This organisation only accepts members with an @student.example.org or @partner.org email address.",
    );

    // Adding the test domain as a second one lets them in.
    expect((await manager.request.patch("/api/org/my/settings", { data: { allowedDomain: "student.example.org, e2etest.local" } })).ok()).toBeTruthy();
    expect((await outsider.request.post("/api/org/join", { data: invite })).ok()).toBeTruthy();
  });
});
