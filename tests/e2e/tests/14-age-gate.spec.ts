import { test, expect } from "@playwright/test";
import { TestApi, uniqueEmail } from "../helpers/api";

/**
 * Spec 14 — age gate after the first magic-link confirmation.
 *
 * The birth date is no longer collected on the login form. Instead:
 *   - POST /api/auth/request creates the account WITHOUT birth data;
 *   - after POST /api/auth/confirm, the client submits the date of birth to
 *     POST /api/auth/birth-date, which enforces the age rules:
 *       - under-13 → 403 + the just-created account is erased entirely;
 *       - 13–17    → stored with is_minor = true;
 *       - 18+      → stored with is_minor = false.
 */
test.describe("Spec 14 — age gate after first sign-in", () => {
  let api: TestApi;
  const now = new Date();
  const year = now.getFullYear();
  const emails = {
    under13: uniqueEmail("age-under13"),
    minor: uniqueEmail("age-minor"),
    adult: uniqueEmail("age-adult"),
    edge: uniqueEmail("age-edge"),
  };

  test.beforeAll(async ({ baseURL }) => {
    api = await TestApi.create({ baseURL: baseURL! });
    for (const e of Object.values(emails)) await api.resetUser(e);
  });

  test.afterAll(async () => {
    for (const e of Object.values(emails)) await api.resetUser(e);
    await api.dispose();
  });

  /** Request a link, confirm it, and return the request context's session. */
  async function signUpAndConfirm(request: any, email: string) {
    const reqRes = await request.post("/api/auth/request", { data: { email } });
    expect(reqRes.ok()).toBe(true);
    const token = await api.getLatestMagicToken(email);
    const confRes = await request.post("/api/auth/confirm", {
      data: { token },
      headers: { "X-Requested-With": "XMLHttpRequest" },
    });
    expect(confRes.ok()).toBe(true);
    return (await confRes.json()) as { ok: boolean; needsBirthDate: boolean };
  }

  test("request without a birth date creates the account; confirm flags needsBirthDate", async ({ request }) => {
    const conf = await signUpAndConfirm(request, emails.adult);
    expect(conf.needsBirthDate).toBe(true);

    const info = await (await request.get(`/api/test/user-info?email=${encodeURIComponent(emails.adult)}`)).json();
    expect(info.exists).toBe(true);
    expect(info.birthMonth ?? null).toBeNull();

    // 18+: birth date stored, is_minor false, needsBirthDate cleared.
    const birthYear = year - 30;
    const bd = await request.post("/api/auth/birth-date", {
      data: { birthMonth: 6, birthYear },
    });
    expect(bd.ok()).toBe(true);
    expect((await bd.json()).isMinor).toBe(false);

    const after = await (await request.get(`/api/test/user-info?email=${encodeURIComponent(emails.adult)}`)).json();
    expect(after.isMinor).toBe(false);
    expect(after.birthMonth).toBe(6);
    expect(after.birthYear).toBe(birthYear);

    const me = await (await request.get("/api/auth/me")).json();
    expect(me.user.needsBirthDate).toBe(false);
  });

  test("13–17 is stored and flagged as a minor", async ({ request }) => {
    await signUpAndConfirm(request, emails.minor);
    const birthYear = year - 15;
    const bd = await request.post("/api/auth/birth-date", {
      data: { birthMonth: 1, birthYear },
    });
    expect(bd.ok()).toBe(true);
    expect((await bd.json()).isMinor).toBe(true);

    const info = await (await request.get(`/api/test/user-info?email=${encodeURIComponent(emails.minor)}`)).json();
    expect(info.isMinor).toBe(true);
    expect(info.birthMonth).toBe(1);
    expect(info.birthYear).toBe(birthYear);
  });

  test("under-13 is blocked and the just-created account is erased", async ({ request }) => {
    await signUpAndConfirm(request, emails.under13);

    const bd = await request.post("/api/auth/birth-date", {
      data: { birthMonth: now.getMonth() + 1, birthYear: year - 10 },
    });
    expect(bd.status()).toBe(403);
    const body = await bd.json();
    expect(body.code).toBe("under_13");
    expect(body.error).toMatch(/13 or older/i);

    // Nothing kept: user row erased and session no longer valid.
    const info = await (await request.get(`/api/test/user-info?email=${encodeURIComponent(emails.under13)}`)).json();
    expect(info.exists).toBe(false);
    const me = await (await request.get("/api/auth/me")).json();
    expect(me.user).toBeNull();
  });

  test("conservative month rule: 13th-birthday month still counts as under 13", async ({ request }) => {
    await signUpAndConfirm(request, emails.edge);
    const bd = await request.post("/api/auth/birth-date", {
      data: { birthMonth: now.getMonth() + 1, birthYear: year - 13 },
    });
    expect(bd.status()).toBe(403);
  });

  test("existing user with a stored birth date is not asked again", async ({ request }) => {
    // emails.minor already has birth data from the earlier test — a fresh
    // sign-in must not flag needsBirthDate.
    const reqRes = await request.post("/api/auth/request", { data: { email: emails.minor } });
    expect(reqRes.ok()).toBe(true);
    const token = await api.getLatestMagicToken(emails.minor);
    const confRes = await request.post("/api/auth/confirm", {
      data: { token },
      headers: { "X-Requested-With": "XMLHttpRequest" },
    });
    expect(confRes.ok()).toBe(true);
    expect((await confRes.json()).needsBirthDate).toBe(false);
  });

  test("settings: birth date can be edited but never to an under-13 value", async ({ request }) => {
    // Fresh request context — sign in again as the (former) minor account.
    await signUpAndConfirm(request, emails.minor);
    const patchOk = await request.patch("/api/auth/me", {
      data: { birthMonth: 3, birthYear: year - 20 },
    });
    expect(patchOk.ok()).toBe(true);
    const body = await patchOk.json();
    expect(body.user.birthMonth).toBe(3);
    expect(body.user.birthYear).toBe(year - 20);
    expect(body.user.isMinor).toBe(false);

    const patchBad = await request.patch("/api/auth/me", {
      data: { birthMonth: 1, birthYear: year - 5 },
    });
    expect(patchBad.status()).toBe(403);

    // Under-13 PATCH must NOT delete an existing account.
    const info = await (await request.get(`/api/test/user-info?email=${encodeURIComponent(emails.minor)}`)).json();
    expect(info.exists).toBe(true);
    expect(info.birthYear).toBe(year - 20);
  });
});
