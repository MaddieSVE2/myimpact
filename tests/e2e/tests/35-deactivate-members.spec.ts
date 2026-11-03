import { test, expect, type Browser, type Page } from "@playwright/test";
import { TestApi, uniqueEmail } from "../helpers/api";
import { signInWithMagicLink } from "../helpers/auth";

/**
 * Spec 35 — A manager deactivates a member.
 *
 * The person loses access and can't rejoin with the join link. What they logged
 * before being deactivated stays in the organisation's totals, what they log
 * afterwards doesn't, and they can take their hours out themselves. A manager
 * can reactivate them, which puts them back in their groups.
 */
test.describe("Spec 35 — deactivating members", () => {
  let api: TestApi;
  const managerEmail = uniqueEmail("mgr35");
  const memberEmail = uniqueEmail("mem35");
  const otherEmail = uniqueEmail("oth35");
  const consentManagerEmail = uniqueEmail("cmg35");
  const consentMemberEmail = uniqueEmail("cmm35");
  const orgIds: string[] = [];

  test.beforeAll(async ({ baseURL }) => {
    api = await TestApi.create({ baseURL: baseURL! });
  });

  test.afterAll(async () => {
    for (const id of orgIds) await api.deleteOrg(id);
    for (const email of [managerEmail, memberEmail, otherEmail, consentManagerEmail, consentMemberEmail]) {
      await api.resetUser(email);
    }
    await api.dispose();
  });

  async function signedIn(browser: Browser, email: string): Promise<Page> {
    const context = await browser.newContext({ locale: "en-GB" });
    const page = await context.newPage();
    await signInWithMagicLink(page, api, email);
    return page;
  }

  async function logHours(page: Page, hours: number, force = false, targetRecordId?: number): Promise<number> {
    const res = await page.request.post("/api/impact/save", {
      data: {
        userId: "",
        name: "My Impact Record",
        activities: [{ activityId: "recycling", quantity: 26, hoursPerYear: hours }],
        donationsGBP: 0,
        additionalVolunteerHours: 0,
        ...(force ? { force: true } : {}),
        ...(targetRecordId ? { targetRecordId: String(targetRecordId) } : {}),
      },
    });
    expect(res.ok(), await res.text()).toBeTruthy();
    return Number(((await res.json()) as { id: number | string }).id);
  }

  async function orgHours(manager: Page): Promise<number> {
    const res = await manager.request.get("/api/impact/org-stats");
    expect(res.ok()).toBeTruthy();
    return ((await res.json()) as { totalHours: number }).totalHours;
  }

  async function userId(page: Page): Promise<string> {
    const res = await page.request.get("/api/auth/me");
    return ((await res.json()) as { user?: { id: string }; id?: string }).user?.id
      ?? ((await res.json()) as { id: string }).id;
  }

  function deactivate(manager: Page, id: string) {
    return manager.request.post(`/api/org/my/members/${id}/deactivate`);
  }

  test("deactivating keeps past hours, blocks rejoining, and can be undone", async ({ browser }) => {
    const org = await api.createOrg("Spec 35 Volleyball", "charity", managerEmail);
    orgIds.push(org.orgId);
    const invite = { inviteCode: org.inviteCode, orgId: org.orgId };

    const manager = await signedIn(browser, managerEmail);
    expect((await manager.request.post("/api/org/join", { data: invite })).ok()).toBeTruthy();
    await manager.request.patch("/api/org/my/settings", { data: { autoApproveMembers: true } });
    const group = await (await manager.request.post("/api/org/groups", { data: { name: "Juniors" } })).json() as { group?: { id: string }; id?: string };
    const groupId = group.group?.id ?? group.id!;

    const member = await signedIn(browser, memberEmail);
    expect((await member.request.post("/api/org/join", { data: invite })).ok()).toBeTruthy();
    expect((await member.request.post(`/api/org/my/groups/${groupId}/join`)).ok()).toBeTruthy();
    const memberId = await userId(member);
    const managerId = await userId(manager);

    const firstRecord = await logHours(member, 12);
    expect(await orgHours(manager)).toBe(12);

    // A manager can't deactivate themselves, and a member can't deactivate anyone.
    const other = await signedIn(browser, otherEmail);
    expect((await other.request.post("/api/org/join", { data: invite })).ok()).toBeTruthy();
    expect((await deactivate(manager, managerId)).status()).toBe(409);
    expect((await deactivate(other, memberId)).status()).toBe(403);

    // ---- Deactivate from the Members tab ----------------------------------
    await manager.goto("/org/settings");
    await expect(manager.getByTestId(`button-deactivate-${managerId}-desktop`)).toHaveCount(0);
    manager.once("dialog", (d) => d.accept());
    await manager.getByTestId(`button-deactivate-${memberId}-desktop`).click();
    const deactivatedRow = manager.getByTestId(`row-deactivated-${memberId}`);
    await expect(deactivatedRow).toContainText("Their hours still count in your totals.");
    await expect(manager.getByTestId(`row-member-${memberId}-desktop`)).toHaveCount(0);

    // ---- Their access has gone --------------------------------------------
    const my = await member.request.get("/api/org/my");
    expect(my.ok() ? ((await my.json()) as { org: unknown }).org : null).toBeNull();
    const myGroups = await member.request.get("/api/org/my/groups");
    expect(myGroups.ok() ? ((await myGroups.json()) as { groups: unknown[] }).groups : []).toEqual([]);

    // ---- The join link can't bring them back ------------------------------
    expect((await member.request.post("/api/org/validate-invite", { data: invite })).status()).toBe(403);
    expect((await member.request.post("/api/org/join", { data: invite })).status()).toBe(403);
    await member.goto(`/org?invite=${org.inviteCode}`);
    await expect(member.getByText(/membership of this organisation was deactivated/i)).toBeVisible();

    // ---- Hours before stay, hours after don't ------------------------------
    expect(await orgHours(manager)).toBe(12);
    await logHours(member, 30, true);
    expect(await orgHours(manager)).toBe(12);

    // ---- Editing an old record takes it out of the totals ------------------
    await logHours(member, 500, true, firstRecord);
    expect(await orgHours(manager)).toBe(0);

    // ---- Reactivating restores access and their group ----------------------
    await manager.getByTestId(`button-reactivate-${memberId}`).click();
    await expect(manager.getByTestId(`row-member-${memberId}-desktop`)).toBeVisible();
    await expect(manager.getByTestId("panel-deactivated-members")).toHaveCount(0);
    const back = (await (await member.request.get("/api/org/my")).json()) as { org: { membershipStatus: string } };
    expect(back.org.membershipStatus).toBe("active");
    const groupsBack = (await (await member.request.get("/api/org/my/groups")).json()) as { groups: Array<{ id: string; isMember?: boolean; role?: string | null }> };
    expect(JSON.stringify(groupsBack)).toContain(groupId);
    const memberships = (await (await manager.request.get("/api/org/groups/memberships")).json()) as Record<string, unknown>;
    expect(JSON.stringify(memberships)).toContain(memberId);
  });

  test("a deactivated person can take their hours out, and then only they can return", async ({ browser }) => {
    const org = await api.createOrg("Spec 35 Rowing", "charity", consentManagerEmail);
    orgIds.push(org.orgId);
    const invite = { inviteCode: org.inviteCode, orgId: org.orgId };

    const manager = await signedIn(browser, consentManagerEmail);
    await manager.request.post("/api/org/join", { data: invite });
    await manager.request.patch("/api/org/my/settings", { data: { autoApproveMembers: true } });

    const member = await signedIn(browser, consentMemberEmail);
    await member.request.post("/api/org/join", { data: invite });
    const memberId = await userId(member);
    const recordId = await logHours(member, 9);
    expect(await orgHours(manager)).toBe(9);
    expect((await manager.request.post("/api/org/verifications/decide", { data: { recordId, decision: "approve" } })).ok()).toBeTruthy();
    const challenge = await api.seedOrgChallenge(org.orgId);

    expect((await deactivate(manager, memberId)).ok()).toBeTruthy();
    expect(await orgHours(manager)).toBe(9);

    // Deactivated people lose the challenge, though their hours stay on it.
    expect((await member.request.get(`/api/challenges/${challenge}`)).status()).toBe(403);
    expect(((await (await member.request.get("/api/challenges/mine")).json()) as { challenges: unknown[] }).challenges).toEqual([]);
    const leaderboard = async () => JSON.stringify(((await (await manager.request.get(`/api/challenges/${challenge}`)).json()) as { leaderboard: unknown }).leaderboard);
    expect(await leaderboard()).toContain(memberId);

    await member.goto("/settings");
    const row = member.getByTestId(`row-org-deactivation-${org.orgId}`);
    await expect(row).toContainText("still count towards Spec 35 Rowing's totals");
    await member.getByTestId("button-withdraw-hours").click();
    await member.getByTestId("button-confirm-withdraw-hours").click();
    await expect(row).toContainText("no longer count towards Spec 35 Rowing's totals");
    expect(await orgHours(manager)).toBe(0);
    expect(((await (await manager.request.get("/api/impact/org-stats")).json()) as { verifiedHours: number }).verifiedHours).toBe(0);
    expect(await leaderboard()).not.toContain(memberId);
    await api.deleteChallenge(challenge);

    // The manager can't put those hours back, only let the person rejoin.
    await manager.goto("/org/settings");
    await expect(manager.getByTestId(`row-deactivated-${memberId}`)).toContainText("They removed their hours");
    await manager.getByTestId(`button-reactivate-${memberId}`).click();
    await expect(manager.getByTestId("panel-deactivated-members")).toHaveCount(0);
    expect(await orgHours(manager)).toBe(0);
    await expect.poll(async () => (await member.request.post("/api/org/validate-invite", { data: invite })).status()).toBe(200);
  });

  test("consented organisations keep the hours until consent goes", async ({ browser }) => {
    const managerAddress = uniqueEmail("cmc35");
    const memberAddress = uniqueEmail("cmd35");
    const org = await api.createOrg("Spec 35 Consent", "charity", managerAddress, "consented_logging");
    orgIds.push(org.orgId);
    const invite = { inviteCode: org.inviteCode, orgId: org.orgId };
    const consent = { consentScope: "historic", consentHistoricFrom: "2020-01-01" };

    const manager = await signedIn(browser, managerAddress);
    await manager.request.post("/api/org/join", { data: { ...invite, ...consent } });
    await manager.request.patch("/api/org/my/settings", { data: { autoApproveMembers: true } });

    const member = await signedIn(browser, memberAddress);
    expect((await member.request.post("/api/org/join", { data: { ...invite, ...consent } })).ok()).toBeTruthy();
    const memberId = await userId(member);
    await logHours(member, 7);
    expect(await orgHours(manager)).toBe(7);

    expect((await deactivate(manager, memberId)).ok()).toBeTruthy();
    expect(await orgHours(manager)).toBe(7);
    await logHours(member, 5, true);
    expect(await orgHours(manager)).toBe(7);

    expect((await member.request.post(`/api/org/deactivations/${org.orgId}/withdraw-hours`)).ok()).toBeTruthy();
    expect(await orgHours(manager)).toBe(0);

    await api.resetUser(managerAddress);
    await api.resetUser(memberAddress);
  });

  test("public links show only what consent covers", async ({ browser }) => {
    const managerAddress = uniqueEmail("cml35");
    const insideAddress = uniqueEmail("cin35");
    const earlierAddress = uniqueEmail("cer35");
    const org = await api.createOrg("Spec 35 Links", "charity", managerAddress, "consented_logging");
    orgIds.push(org.orgId);
    const join = { inviteCode: org.inviteCode, orgId: org.orgId, consentScope: "historic", consentHistoricFrom: "2020-01-01" };

    const manager = await signedIn(browser, managerAddress);
    await manager.request.post("/api/org/join", { data: join });
    await manager.request.patch("/api/org/my/settings", { data: { autoApproveMembers: true } });

    const inside = await signedIn(browser, insideAddress);
    await inside.request.post("/api/org/join", { data: join });
    await logHours(inside, 5);

    // Logged from a date before the consent they gave.
    const earlier = await signedIn(browser, earlierAddress);
    await earlier.request.post("/api/org/join", { data: { ...join, consentHistoricFrom: new Date().toISOString().slice(0, 10) } });
    const before = await earlier.request.post("/api/impact/save", {
      data: { userId: "", name: "My Impact Record", activities: [{ activityId: "recycling", quantity: 26, hoursPerYear: 40 }], donationsGBP: 0, additionalVolunteerHours: 0, force: true, entryDate: "2022-06-01" },
    });
    expect(before.ok(), await before.text()).toBeTruthy();

    const link = ((await (await manager.request.post("/api/org/share-links", { data: { scope: "all" } })).json()) as { link: { slug: string } }).link.slug;
    const pub = (await (await manager.request.get(`/api/org-share/${link}`)).json()) as { sections: { summary: { totalHours: number } } };
    expect(pub.sections.summary.totalHours).toBe(5);

    for (const address of [managerAddress, insideAddress, earlierAddress]) await api.resetUser(address);
  });

  test("simultaneous changes leave membership consistent, and the contact can reclaim an empty organisation", async ({ browser }) => {
    const contactAddress = uniqueEmail("con35");
    const otherManagerAddress = uniqueEmail("omg35");
    const personAddress = uniqueEmail("per35");
    const org = await api.createOrg("Spec 35 Races", "charity", contactAddress);
    orgIds.push(org.orgId);
    const invite = { inviteCode: org.inviteCode, orgId: org.orgId };

    const contact = await signedIn(browser, contactAddress);
    await contact.request.post("/api/org/join", { data: invite });
    await contact.request.patch("/api/org/my/settings", { data: { autoApproveMembers: true } });
    const otherManager = await signedIn(browser, otherManagerAddress);
    await otherManager.request.post("/api/org/join", { data: invite });
    const person = await signedIn(browser, personAddress);
    await person.request.post("/api/org/join", { data: invite });
    const [contactId, otherManagerId, personId] = await Promise.all([userId(contact), userId(otherManager), userId(person)]);
    await contact.request.post(`/api/org/my/members/${otherManagerId}/role`, { data: { role: "manager" } });

    // Two clicks on Reactivate: one works and the other finds nothing to do.
    await deactivate(contact, personId);
    const clicks = await Promise.all([1, 2, 3].map(() => contact.request.post(`/api/org/my/members/${personId}/reactivate`)));
    expect(clicks.map((r) => r.status()).sort()).toEqual([200, 404, 404]);

    // Demoting and deactivating at once can't leave the organisation with no manager.
    const [demote, remove] = await Promise.all([
      contact.request.post(`/api/org/my/members/${otherManagerId}/role`, { data: { role: "member" } }),
      deactivate(otherManager, contactId),
    ]);
    expect([demote.ok(), remove.ok()]).toContain(false);

    // The contact was deactivated and the last manager left: only they can reclaim it.
    if (remove.ok()) {
      expect((await otherManager.request.post("/api/org/leave")).ok()).toBeTruthy();
      await person.request.post("/api/org/leave");
      expect((await contact.request.post("/api/org/validate-invite", { data: invite })).ok()).toBeTruthy();
      expect((await contact.request.post("/api/org/join", { data: invite })).ok()).toBeTruthy();
      const back = (await (await contact.request.get("/api/org/my")).json()) as { org: { membershipRole?: string; role?: string } };
      expect(JSON.stringify(back)).toContain("manager");
    }

    for (const address of [contactAddress, otherManagerAddress, personAddress]) await api.resetUser(address);
  });
});
