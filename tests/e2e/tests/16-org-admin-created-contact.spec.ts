import { test, expect } from "@playwright/test";
import { TestApi, uniqueEmail } from "../helpers/api";
import { signInWithMagicLink } from "../helpers/auth";

/**
 * Spec 16 — admin-created organisations: activation email, contact-email
 * manager promotion, and the no-manager join-request fallback.
 *
 * Mirrors the live bug: an org created straight from the admin console has
 * no registration record and no managers, so previously (a) the contact got
 * no "your organisation is active" email, (b) the contact was never promoted
 * to manager when they joined, and (c) join-request notifications were
 * silently dropped because there were no active managers to email.
 *
 * All emails are suppressed by the resend test-mode stub (E2E_TEST_MODE=1),
 * so these tests exercise the send paths and assert on the behaviour that
 * surrounds them.
 */
test.describe("Spec 16 — admin-created org contact promotion & notification fallback", () => {
  let api: TestApi;
  const adminEmail = "maddie@socialvalueengine.com"; // in the hard-coded admin allowlist
  const contactEmail = uniqueEmail("orgcontact");
  const applicantEmail = uniqueEmail("applicant");
  let orgId: string | undefined;

  test.beforeAll(async ({ baseURL }) => {
    api = await TestApi.create({ baseURL: baseURL! });
    await api.resetUser(adminEmail);
    await api.resetUser(contactEmail);
    await api.resetUser(applicantEmail);
  });

  test.afterAll(async () => {
    await api.resetUser(adminEmail);
    await api.resetUser(contactEmail);
    await api.resetUser(applicantEmail);
    if (orgId) await api.deleteOrg(orgId);
    await api.dispose();
  });

  test("create via admin console → applicant pending (contact-email fallback) → contact joins as manager → approves applicant", async ({ browser }) => {
    // ── Admin: create the organisation from the admin console API ─────────
    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    await signInWithMagicLink(adminPage, api, adminEmail);

    const createRes = await adminPage.request.post("/api/admin/orgs", {
      data: {
        name: `E2E Admin Org ${Date.now()}`,
        type: "charity",
        contactName: "E2E Contact",
        contactEmail,
        dataSharingMode: "explicit_submission",
      },
    });
    expect(createRes.ok()).toBe(true);
    const createBody = (await createRes.json()) as {
      ok: boolean;
      org: { id: string; inviteCode: string; name: string };
      warning?: string;
    };
    orgId = createBody.org.id;
    const inviteCode = createBody.org.inviteCode;
    // The activation email must have been attempted successfully — in test
    // mode the resend stub always succeeds, so any warning here means the
    // send path itself threw before reaching the stub.
    expect(createBody.warning).toBeUndefined();
    await adminCtx.close();

    // ── Applicant: joins before any manager exists ─────────────────────────
    // The join-request notification has no active managers to email, so it
    // must fall back to the organisation's contact email instead of
    // silently returning. The request itself lands as "pending".
    const applicantCtx = await browser.newContext();
    const applicantPage = await applicantCtx.newPage();
    await signInWithMagicLink(applicantPage, api, applicantEmail);

    const applicantJoin = await applicantPage.request.post("/api/org/join", {
      data: { inviteCode, orgId },
    });
    expect(applicantJoin.ok()).toBe(true);
    const applicantJoinBody = (await applicantJoin.json()) as { status: string };
    expect(applicantJoinBody.status).toBe("pending");

    // The pending applicant sees the explicit "pending approval" state.
    await applicantPage.goto("/org");
    await expect(
      applicantPage.getByText(/pending approval/i).first(),
    ).toBeVisible({ timeout: 15_000 });

    // ── Contact: signs in and joins with the invite code ───────────────────
    // There is no registration record for admin-created orgs; the join flow
    // must promote them to manager off the organisation's contact email.
    const contactCtx = await browser.newContext();
    const contactPage = await contactCtx.newPage();
    await signInWithMagicLink(contactPage, api, contactEmail);

    const contactJoin = await contactPage.request.post("/api/org/join", {
      data: { inviteCode, orgId },
    });
    expect(contactJoin.ok()).toBe(true);
    const contactJoinBody = (await contactJoin.json()) as { status: string };
    expect(contactJoinBody.status).toBe("active");

    const myOrgRes = await contactPage.request.get("/api/org/my");
    const myOrgBody = (await myOrgRes.json()) as { org: { role: string } | null };
    expect(myOrgBody.org?.role).toBe("manager");

    // ── Manager approves the pending applicant ─────────────────────────────
    const meRes = await applicantPage.request.get("/api/auth/me");
    const meBody = (await meRes.json()) as { user: { id: string } | null };
    expect(meBody.user?.id).toBeTruthy();
    const approveRes = await contactPage.request.post(
      `/api/org/my/members/${meBody.user!.id}/approve`,
    );
    expect(approveRes.ok()).toBe(true);

    await applicantCtx.close();
    await contactCtx.close();
  });
});
