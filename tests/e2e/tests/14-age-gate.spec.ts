import { test, expect } from "@playwright/test";
import { TestApi, uniqueEmail } from "../helpers/api";

/**
 * Spec 14 — age gate at sign-up.
 *
 * Server-side enforcement of the birth-date requirement on
 * POST /api/auth/request:
 *   - under-13 → rejected, and NO user row is ever created;
 *   - 13–17    → account created with is_minor = true;
 *   - 18+      → account created with is_minor = false;
 *   - missing birth date on a NEW email → rejected before any write;
 *   - existing user signs in WITHOUT a birth date → still works.
 */
test.describe("Spec 14 — age gate at sign-up", () => {
  let api: TestApi;
  const now = new Date();
  const year = now.getFullYear();
  const emails = {
    under13: uniqueEmail("age-under13"),
    minor: uniqueEmail("age-minor"),
    adult: uniqueEmail("age-adult"),
    missing: uniqueEmail("age-missing"),
  };

  test.beforeAll(async ({ baseURL }) => {
    api = await TestApi.create({ baseURL: baseURL! });
    for (const e of Object.values(emails)) await api.resetUser(e);
  });

  test.afterAll(async () => {
    for (const e of Object.values(emails)) await api.resetUser(e);
    await api.dispose();
  });

  test("under-13 is blocked and nothing is stored", async ({ request }) => {
    const res = await request.post("/api/auth/request", {
      data: { email: emails.under13, birthMonth: now.getMonth() + 1, birthYear: year - 10 },
    });
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("under_13");
    expect(body.error).toMatch(/13 or older/i);

    // No user row must exist — nothing was stored.
    const info = await request.get(`/api/test/user-info?email=${encodeURIComponent(emails.under13)}`);
    expect((await info.json()).exists).toBe(false);
    // And no magic token either (latest-token 404s when there is no user).
    const tok = await request.get(`/api/test/latest-token?email=${encodeURIComponent(emails.under13)}`);
    expect(tok.status()).toBe(404);
  });

  test("missing birth date on a new email is rejected before any write", async ({ request }) => {
    const res = await request.post("/api/auth/request", {
      data: { email: emails.missing },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).code).toBe("birth_date_required");
    const info = await request.get(`/api/test/user-info?email=${encodeURIComponent(emails.missing)}`);
    expect((await info.json()).exists).toBe(false);
  });

  test("13–17 creates an account flagged as a minor", async ({ request }) => {
    const birthYear = year - 15;
    const res = await request.post("/api/auth/request", {
      data: { email: emails.minor, birthMonth: 1, birthYear },
    });
    expect(res.ok()).toBe(true);
    const info = await (await request.get(`/api/test/user-info?email=${encodeURIComponent(emails.minor)}`)).json();
    expect(info.exists).toBe(true);
    expect(info.isMinor).toBe(true);
    expect(info.birthMonth).toBe(1);
    expect(info.birthYear).toBe(birthYear);
  });

  test("18+ creates a standard account and can sign in again without a birth date", async ({ request }) => {
    const birthYear = year - 30;
    const res = await request.post("/api/auth/request", {
      data: { email: emails.adult, birthMonth: 6, birthYear },
    });
    expect(res.ok()).toBe(true);
    const info = await (await request.get(`/api/test/user-info?email=${encodeURIComponent(emails.adult)}`)).json();
    expect(info.exists).toBe(true);
    expect(info.isMinor).toBe(false);
    expect(info.birthMonth).toBe(6);
    expect(info.birthYear).toBe(birthYear);

    // Existing user: no birth date needed on subsequent sign-ins.
    const again = await request.post("/api/auth/request", {
      data: { email: emails.adult },
    });
    expect(again.ok()).toBe(true);
  });

  test("conservative month rule: 13th-birthday month still counts as under 13", async ({ request }) => {
    const email = uniqueEmail("age-edge");
    const res = await request.post("/api/auth/request", {
      data: { email, birthMonth: now.getMonth() + 1, birthYear: year - 13 },
    });
    expect(res.status()).toBe(403);
    await api.resetUser(email);
  });
});
