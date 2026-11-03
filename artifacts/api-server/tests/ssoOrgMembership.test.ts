import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";

const state = vi.hoisted(() => ({
  organisation: {} as Record<string, unknown>,
  deactivated: null as Record<string, unknown> | null,
  inserts: [] as Array<{ table: string; values: Record<string, unknown> }>,
}));

vi.mock("@workspace/db", () => {
  const table = (name: string) => ({ __name: name });
  const db = {
    query: {
      usersTable: { findFirst: vi.fn(async () => ({ id: "user-1", email: "person@club.example", displayName: "Person" })) },
      userProfilesTable: { findFirst: vi.fn(async () => null) },
      orgSsoConfigsTable: {
        findFirst: vi.fn(async () => ({ id: "cfg-1", orgId: "org-1", domain: "club.example", provider: "google", status: "verified", enforceSSO: true, tenantId: null })),
      },
      organisationsTable: { findFirst: vi.fn(async () => state.organisation) },
      orgMembersTable: { findFirst: vi.fn(async () => null) },
      orgDeactivatedMembersTable: { findFirst: vi.fn(async () => state.deactivated) },
    },
    insert: (target: { __name: string }) => ({
      values(values: Record<string, unknown>) {
        state.inserts.push({ table: target.__name, values });
        return { returning: async () => [values], onConflictDoNothing: async () => undefined };
      },
    }),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
  };
  return {
    db,
    usersTable: table("users"),
    userProfilesTable: table("profiles"),
    orgSsoConfigsTable: table("org_sso_configs"),
    organisationsTable: table("organisations"),
    orgMembersTable: table("org_members"),
    orgDeactivatedMembersTable: table("org_deactivated_members"),
  };
});

vi.mock("../src/lib/analytics.js", () => ({ trackServerEvent: vi.fn() }));
vi.mock("../src/lib/auditLog.js", () => ({ recordAuditEvent: vi.fn(async () => undefined) }));
vi.mock("../src/lib/oidc.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/oidc.js")>();
  return {
    ...actual,
    exchangeCodeAndVerify: vi.fn(async () => ({
      email: "person@club.example",
      emailVerified: true,
      sub: "google-subject",
      name: "Person",
      hostedDomain: "club.example",
      tenantId: null,
    })),
  };
});

import ssoRouter from "../src/routes/sso.js";
import { signState } from "../src/lib/oidc.js";
import { DEACTIVATED_MEMBER_MESSAGE } from "../src/lib/orgDeactivation.js";

async function signIn() {
  const server = express();
  server.use(cookieParser());
  server.use("/api/auth/sso", ssoRouter);
  const { state: signed, nonce } = signState({ provider: "google", flow: "organisation", orgId: "org-1", domain: "club.example", mode: "signin" });
  return request(server)
    .get(`/api/auth/sso/google/callback?code=code&state=${encodeURIComponent(signed)}`)
    .set("Cookie", `mi_sso_state=${nonce}`);
}

const memberInserts = () => state.inserts.filter((i) => i.table === "org_members");
const sessionCookie = (res: request.Response) =>
  ([] as string[]).concat(res.headers["set-cookie"] ?? []).find((c) => c.startsWith("mi_session="));

describe("organisation SSO sign-in and membership", () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = "org-sso-test-secret";
    process.env.APP_URL = "https://app.example";
    process.env.GOOGLE_OIDC_CLIENT_ID = "google-client";
    process.env.GOOGLE_OIDC_CLIENT_SECRET = "google-secret";
    state.organisation = { id: "org-1", name: "Club", autoApproveMembers: false };
    state.deactivated = null;
    state.inserts = [];
  });

  it("signs in someone deactivated without making them a member again", async () => {
    state.deactivated = { userId: "user-1" };
    const res = await signIn();

    expect(sessionCookie(res)).toBeTruthy();
    expect(memberInserts()).toEqual([]);
    expect(res.text).toContain(DEACTIVATED_MEMBER_MESSAGE.replace(/'/g, "&#39;"));
  });

  it("leaves a new member waiting by default", async () => {
    await signIn();
    expect(memberInserts()[0].values.status).toBe("pending");
  });

  it("makes a new member active straight away when the org auto-approves", async () => {
    state.organisation = { ...state.organisation, autoApproveMembers: true };
    await signIn();
    expect(memberInserts()[0].values.status).toBe("active");
  });
});
