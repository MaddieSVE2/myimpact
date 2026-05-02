/**
 * Test-only API helpers. All of these talk to endpoints that are gated by
 * E2E_TEST_MODE=1 on the api-server. They must NEVER be called against a
 * production stack — the server-side guard returns 404 in that case anyway.
 */

import { request, type APIRequestContext } from "@playwright/test";

const E2E_EMAIL_DOMAIN = "e2etest.local";

/**
 * Generate a unique e2e email. The `@e2etest.local` suffix is the only
 * domain accepted by the bulk reset endpoint, so all test users created
 * here are guaranteed to be cleanable in one call.
 */
export function uniqueEmail(prefix = "user"): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${ts}-${rand}@${E2E_EMAIL_DOMAIN}`;
}

export interface ApiClientOpts {
  baseURL: string;
}

export class TestApi {
  private constructor(private ctx: APIRequestContext, public baseURL: string) {}

  static async create(opts: ApiClientOpts): Promise<TestApi> {
    const ctx = await request.newContext({ baseURL: opts.baseURL });
    return new TestApi(ctx, opts.baseURL);
  }

  async dispose(): Promise<void> {
    await this.ctx.dispose();
  }

  /** Delete every test user matching the e2e domain plus their data. */
  async resetAllTestUsers(): Promise<void> {
    const res = await this.ctx.post("/api/test/reset-emails", {
      data: { pattern: `%@${E2E_EMAIL_DOMAIN}` },
    });
    if (!res.ok()) {
      const body = await res.text();
      throw new Error(`reset-emails failed (${res.status()}): ${body}`);
    }
  }

  /** Delete a single test user by email. No-op if the user doesn't exist. */
  async resetUser(email: string): Promise<void> {
    const res = await this.ctx.post("/api/test/reset-user", {
      data: { email },
    });
    if (!res.ok()) {
      const body = await res.text();
      throw new Error(`reset-user failed (${res.status()}): ${body}`);
    }
  }

  /**
   * Fetch the latest unconfirmed magic-link token issued for `email`. The
   * api-server, when E2E_TEST_MODE=1, skips the actual Resend call but still
   * inserts the token row, so this is the canonical way to "receive" the
   * email in tests.
   */
  async getLatestMagicToken(email: string): Promise<string> {
    const res = await this.ctx.get(`/api/test/latest-token?email=${encodeURIComponent(email)}`);
    if (!res.ok()) {
      const body = await res.text();
      throw new Error(`latest-token failed (${res.status()}): ${body}`);
    }
    const data = (await res.json()) as { token: string };
    return data.token;
  }

  /**
   * Approve the most recent pending org registration for `contactEmail`,
   * creating the organisation and stamping the registration with an invite
   * code. Returns the new org id, name and code.
   */
  async approveOrgRegistration(contactEmail: string): Promise<{
    orgId: string;
    inviteCode: string;
    orgName: string;
  }> {
    const res = await this.ctx.post("/api/test/approve-org-registration", {
      data: { contactEmail },
    });
    if (!res.ok()) {
      const body = await res.text();
      throw new Error(`approve-org-registration failed (${res.status()}): ${body}`);
    }
    return (await res.json()) as { orgId: string; inviteCode: string; orgName: string };
  }

  /** Direct-create an organisation, bypassing the registration queue. */
  async createOrg(name?: string, type?: string): Promise<{
    orgId: string;
    inviteCode: string;
    orgName: string;
  }> {
    const res = await this.ctx.post("/api/test/create-org", {
      data: { name, type },
    });
    if (!res.ok()) {
      const body = await res.text();
      throw new Error(`create-org failed (${res.status()}): ${body}`);
    }
    return (await res.json()) as { orgId: string; inviteCode: string; orgName: string };
  }

  /** Delete an org and all members. */
  async deleteOrg(orgId: string): Promise<void> {
    await this.ctx.post("/api/test/delete-org", { data: { orgId } });
  }
}
