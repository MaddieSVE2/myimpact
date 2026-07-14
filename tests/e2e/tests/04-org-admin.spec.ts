import { test, expect } from "@playwright/test";
import { TestApi, uniqueEmail } from "../helpers/api";
import { signInWithMagicLink } from "../helpers/auth";
import { completeWizardWithExtraHours } from "../helpers/wizard";

test.describe("Spec 4 — org admin registers, member joins, hours visible in dashboard", () => {
  let api: TestApi;
  const managerEmail = uniqueEmail("manager");
  const memberEmail = uniqueEmail("member");
  let orgId: string | undefined;

  test.beforeAll(async ({ baseURL }) => {
    api = await TestApi.create({ baseURL: baseURL! });
    await api.resetUser(managerEmail);
    await api.resetUser(memberEmail);
  });

  test.afterAll(async () => {
    await api.resetUser(managerEmail);
    await api.resetUser(memberEmail);
    if (orgId) await api.deleteOrg(orgId);
    await api.dispose();
  });

  test("org register → approve → manager joins → member joins → dashboard shows hours", async ({ browser }) => {
    // ── Manager: sign up + register the organisation ──────────────────────
    const managerCtx = await browser.newContext();
    const managerPage = await managerCtx.newPage();
    await signInWithMagicLink(managerPage, api, managerEmail);

    // Submit a registration — we hit the API directly because the form UI
    // adds noise that's not what we're verifying here.
    const regRes = await managerPage.request.post("/api/org/register", {
      data: {
        orgName: `E2E Org ${Date.now()}`,
        type: "charity",
        contactName: "E2E Manager",
        contactEmail: managerEmail,
        size: "11–50",
        purpose: "End-to-end testing",
      },
    });
    expect(regRes.ok()).toBe(true);

    // Test-only endpoint approves the latest pending registration and
    // returns the new orgId + invite code.
    const approval = await api.approveOrgRegistration(managerEmail);
    orgId = approval.orgId;

    // Manager joins their own org — the join handler auto-promotes them
    // to manager because the registration's contact email matches.
    const managerJoin = await managerPage.request.post("/api/org/join", {
      data: { inviteCode: approval.inviteCode, orgId: approval.orgId },
    });
    expect(managerJoin.ok()).toBe(true);

    // Confirm role server-side.
    const myOrgRes = await managerPage.request.get("/api/org/my");
    const myOrgBody = (await myOrgRes.json()) as { org: { role: string } | null };
    expect(myOrgBody.org?.role).toBe("manager");

    // The org dashboard renders for managers and surfaces the join link.
    await managerPage.goto("/org");
    // The org name can appear more than once (e.g. header + join-link card),
    // so assert on the first occurrence to avoid strict-mode violations.
    await expect(managerPage.getByText(approval.orgName).first()).toBeVisible({ timeout: 15_000 });

    // ── Member: sign up, log impact, join org with the invite code ────────
    const memberCtx = await browser.newContext();
    const memberPage = await memberCtx.newPage();
    await signInWithMagicLink(memberPage, api, memberEmail);

    // Member logs hours via the wizard.
    await completeWizardWithExtraHours(memberPage, { donationsGBP: 0, hours: 8 });

    // Member joins via the API (the join UI is covered by other suites).
    const memberJoin = await memberPage.request.post("/api/org/join", {
      data: { inviteCode: approval.inviteCode, orgId: approval.orgId },
    });
    expect(memberJoin.ok()).toBe(true);

    // Regular members start as "pending" and only count towards org stats
    // once a manager approves them — mirror that approval step here.
    const meRes = await memberPage.request.get("/api/auth/me");
    const meBody = (await meRes.json()) as { user: { id: string } | null };
    expect(meBody.user?.id).toBeTruthy();
    const approveRes = await managerPage.request.post(
      `/api/org/my/members/${meBody.user!.id}/approve`,
    );
    expect(approveRes.ok()).toBe(true);

    // ── Manager dashboard: aggregated hours include the member ────────────
    // Hit the org stats API; the dashboard graphs hang off the same data.
    const statsRes = await managerPage.request.get(`/api/impact/org-stats`);
    expect(statsRes.ok()).toBe(true);
    const stats = (await statsRes.json()) as {
      totalHours?: number;
      totalMemberCount?: number;
    };
    expect(stats.totalMemberCount ?? 0).toBeGreaterThanOrEqual(2);
    expect(stats.totalHours ?? 0).toBeGreaterThanOrEqual(8);

    await managerCtx.close();
    await memberCtx.close();
  });
});
