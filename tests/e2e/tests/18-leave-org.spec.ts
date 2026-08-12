import { test, expect } from "@playwright/test";
import { TestApi, uniqueEmail } from "../helpers/api";
import { signInWithMagicLink } from "../helpers/auth";

/**
 * Spec 18 — leaving an organisation.
 *
 * Covers the self-service leave flow plus the superadmin removal tool:
 *   1. An active member leaves via Settings (confirmation dialog) and the
 *      app shows the no-org experience afterwards.
 *   2. A sole active manager may leave; the API flags the org as being
 *      left without a manager, and the UI shows the extra warning.
 *   3. A superadmin lists an org's members and removes one directly.
 *   4. A user who left one org can join a different org via the normal
 *      invite flow (the "already in an org" block no longer applies).
 */
test.describe("Spec 18 — leave organisation & superadmin member removal", () => {
  let api: TestApi;
  const adminEmail = "maddie@socialvalueengine.com"; // hard-coded admin allowlist
  const managerEmail = uniqueEmail("leave-mgr");
  const memberEmail = uniqueEmail("leave-member");
  const removedEmail = uniqueEmail("leave-removed");
  let orgId: string | undefined;
  let inviteCode: string;
  let secondOrgId: string | undefined;
  let secondInviteCode: string;

  test.beforeAll(async ({ baseURL }) => {
    api = await TestApi.create({ baseURL: baseURL! });
    for (const e of [adminEmail, managerEmail, memberEmail, removedEmail]) {
      await api.resetUser(e);
    }
  });

  test.afterAll(async () => {
    for (const e of [adminEmail, managerEmail, memberEmail, removedEmail]) {
      await api.resetUser(e);
    }
    if (orgId) await api.deleteOrg(orgId);
    if (secondOrgId) await api.deleteOrg(secondOrgId);
    await api.dispose();
  });

  test("member leave, sole-manager leave, admin removal and rejoin", async ({ browser }) => {
    // ── Admin creates an org whose contact is the manager-to-be ───────────
    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    await signInWithMagicLink(adminPage, api, adminEmail);

    const createRes = await adminPage.request.post("/api/admin/orgs", {
      data: {
        name: `E2E Leave Org ${Date.now()}`,
        type: "charity",
        contactName: "E2E Manager",
        contactEmail: managerEmail,
        dataSharingMode: "explicit_submission",
      },
    });
    expect(createRes.ok()).toBe(true);
    const created = (await createRes.json()) as { org: { id: string; inviteCode: string } };
    orgId = created.org.id;
    inviteCode = created.org.inviteCode;

    // ── Manager joins (auto-promoted via contact email) ────────────────────
    const managerCtx = await browser.newContext();
    const managerPage = await managerCtx.newPage();
    await signInWithMagicLink(managerPage, api, managerEmail);
    const managerJoin = await managerPage.request.post("/api/org/join", {
      data: { inviteCode, orgId },
    });
    expect(managerJoin.ok()).toBe(true);

    // ── Member joins (pending) and is approved by the manager ─────────────
    const memberCtx = await browser.newContext();
    const memberPage = await memberCtx.newPage();
    await signInWithMagicLink(memberPage, api, memberEmail);
    const memberJoin = await memberPage.request.post("/api/org/join", {
      data: { inviteCode, orgId },
    });
    expect(memberJoin.ok()).toBe(true);

    const memberMe = await memberPage.request.get("/api/auth/me");
    const memberId = ((await memberMe.json()) as { user: { id: string } }).user.id;
    const approveRes = await managerPage.request.post(`/api/org/my/members/${memberId}/approve`);
    expect(approveRes.ok()).toBe(true);

    // ── 1. Member leaves via the Settings UI ───────────────────────────────
    await memberPage.goto("/settings");
    await memberPage.getByTestId("button-leave-org").click();
    await expect(memberPage.getByTestId("panel-leave-org-confirm")).toBeVisible();
    // A regular member must NOT see the sole-manager warning.
    await expect(memberPage.getByTestId("text-sole-manager-warning")).toHaveCount(0);
    await memberPage.getByTestId("button-confirm-leave-org").click();
    await expect(memberPage.getByTestId("button-leave-org")).toHaveCount(0, { timeout: 10_000 });

    // After leaving, /api/org/my reports no organisation.
    const memberOrgAfter = await memberPage.request.get("/api/org/my");
    expect(((await memberOrgAfter.json()) as { org: unknown }).org).toBeNull();

    // ── Third user joins so the admin has someone to remove ────────────────
    const removedCtx = await browser.newContext();
    const removedPage = await removedCtx.newPage();
    await signInWithMagicLink(removedPage, api, removedEmail);
    const removedJoin = await removedPage.request.post("/api/org/join", {
      data: { inviteCode, orgId },
    });
    expect(removedJoin.ok()).toBe(true);
    const removedMe = await removedPage.request.get("/api/auth/me");
    const removedId = ((await removedMe.json()) as { user: { id: string } }).user.id;

    // ── 2. Sole manager leaves — warned in UI, flagged in API ──────────────
    // The org settings page shows the extra sole-manager warning.
    await managerPage.goto("/org/settings");
    await managerPage.getByTestId("button-leave-org").click();
    await expect(managerPage.getByTestId("text-sole-manager-warning")).toBeVisible();
    await managerPage.getByTestId("button-cancel-leave-org").click();

    // Leave via the API to assert on the response flag.
    const managerLeave = await managerPage.request.post("/api/org/leave");
    expect(managerLeave.ok()).toBe(true);
    const managerLeaveBody = (await managerLeave.json()) as { ok: boolean; leftWithoutManager: boolean };
    expect(managerLeaveBody.leftWithoutManager).toBe(true);
    const managerOrgAfter = await managerPage.request.get("/api/org/my");
    expect(((await managerOrgAfter.json()) as { org: unknown }).org).toBeNull();

    // ── 3. Superadmin lists members and removes the remaining one ─────────
    const listRes = await adminPage.request.get(`/api/admin/orgs/${orgId}/members`);
    expect(listRes.ok()).toBe(true);
    const listBody = (await listRes.json()) as { members: Array<{ userId: string; email: string }> };
    expect(listBody.members.some(m => m.userId === removedId)).toBe(true);

    const removeRes = await adminPage.request.delete(`/api/admin/orgs/${orgId}/members/${removedId}`);
    expect(removeRes.ok()).toBe(true);
    const listAfter = (await (await adminPage.request.get(`/api/admin/orgs/${orgId}/members`)).json()) as {
      members: Array<{ userId: string }>;
    };
    expect(listAfter.members.some(m => m.userId === removedId)).toBe(false);
    // The removed user now has no org.
    const removedOrgAfter = await removedPage.request.get("/api/org/my");
    expect(((await removedOrgAfter.json()) as { org: unknown }).org).toBeNull();

    // ── 4. The user who left can join a different org normally ────────────
    const secondOrg = await api.createOrg(`E2E Leave Org B ${Date.now()}`);
    secondOrgId = secondOrg.orgId;
    secondInviteCode = secondOrg.inviteCode;

    const rejoinValidate = await memberPage.request.post("/api/org/validate-invite", {
      data: { inviteCode: secondInviteCode, orgId: secondOrgId },
    });
    expect(rejoinValidate.ok()).toBe(true);
    const rejoin = await memberPage.request.post("/api/org/join", {
      data: { inviteCode: secondInviteCode, orgId: secondOrgId },
    });
    expect(rejoin.ok()).toBe(true);
    const rejoinBody = (await rejoin.json()) as { ok: boolean; alreadyMember: boolean };
    expect(rejoinBody.ok).toBe(true);
    expect(rejoinBody.alreadyMember).toBe(false);

    await adminCtx.close();
    await managerCtx.close();
    await memberCtx.close();
    await removedCtx.close();
  });
});
