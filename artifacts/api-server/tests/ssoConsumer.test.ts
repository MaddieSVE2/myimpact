import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import request from "supertest";

const state = vi.hoisted(() => ({
  user: null as Record<string, unknown> | null,
  profile: null as Record<string, unknown> | null,
  orgConfig: null as Record<string, unknown> | null,
  inserts: [] as Array<{ table: string; values: Record<string, unknown> }>,
  orgConfigQueries: 0,
  events: [] as Array<{ eventName: string; props?: Record<string, unknown> | null }>,
}));

vi.mock("@workspace/db", () => {
  const table = (name: string) => ({ __name: name });
  const usersTable = table("users");
  const userProfilesTable = table("profiles");
  const orgSsoConfigsTable = table("org_sso_configs");
  const organisationsTable = table("organisations");
  const orgMembersTable = table("org_members");
  const db = {
    query: {
      usersTable: { findFirst: vi.fn(async () => state.user) },
      userProfilesTable: { findFirst: vi.fn(async () => state.profile) },
      orgSsoConfigsTable: {
        findFirst: vi.fn(async () => {
          state.orgConfigQueries += 1;
          return state.orgConfig;
        }),
      },
      organisationsTable: { findFirst: vi.fn(async () => null) },
      orgMembersTable: { findFirst: vi.fn(async () => null) },
    },
    insert: (target: { __name: string }) => ({
      values(values: Record<string, unknown>) {
        state.inserts.push({ table: target.__name, values });
        const created = { ...values, createdAt: new Date() };
        return {
          returning: async () => [created],
          onConflictDoNothing: async () => undefined,
        };
      },
    }),
    update: () => ({
      set: () => ({ where: async () => undefined }),
    }),
  };
  return {
    db,
    usersTable,
    userProfilesTable,
    orgSsoConfigsTable,
    organisationsTable,
    orgMembersTable,
  };
});

vi.mock("../src/lib/analytics.js", () => ({
  trackServerEvent: (event: { eventName: string; props?: Record<string, unknown> | null }) => {
    state.events.push(event);
  },
}));

vi.mock("../src/lib/auditLog.js", () => ({
  recordAuditEvent: vi.fn(async () => undefined),
}));

vi.mock("../src/lib/oidc.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/oidc.js")>();
  return {
    ...actual,
    exchangeCodeAndVerify: vi.fn(async () => ({
      email: "person@example.com",
      emailVerified: true,
      sub: "google-subject",
      name: "Example Person",
      hostedDomain: null,
      tenantId: null,
    })),
  };
});

import ssoRouter from "../src/routes/sso.js";
import { signState } from "../src/lib/oidc.js";

function app() {
  const server = express();
  server.use(cookieParser());
  server.use(express.urlencoded({ extended: false }));
  server.use("/api/auth/sso", ssoRouter);
  return server;
}

function consumerState(returnTo = "/history") {
  return signState({
    provider: "google",
    flow: "consumer",
    returnTo,
    marketingOptIn: false,
    mode: "signin",
  });
}

describe("consumer Google sign-in routes", () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = "consumer-google-test-secret";
    process.env.APP_URL = "https://app.example";
    process.env.GOOGLE_OIDC_CLIENT_ID = "google-client";
    process.env.GOOGLE_OIDC_CLIENT_SECRET = "google-secret";
    process.env.MICROSOFT_OIDC_CLIENT_ID = "microsoft-client";
    process.env.MICROSOFT_OIDC_CLIENT_SECRET = "microsoft-secret";
    state.user = null;
    state.profile = null;
    state.orgConfig = null;
    state.inserts = [];
    state.orgConfigQueries = 0;
    state.events = [];
  });

  it("matches an existing account by normalized verified email without organisation lookup", async () => {
    state.user = { id: "user-1", email: "person@example.com", displayName: null };
    state.profile = { userId: "user-1", emailOptIn: false };
    const { state: signedState, nonce } = consumerState();

    const response = await request(app())
      .get(`/api/auth/sso/google/callback?code=code&state=${encodeURIComponent(signedState)}`)
      .set("Cookie", `mi_sso_state=${nonce}`);

    expect(response.status).toBe(200);
    expect(response.headers["set-cookie"]?.join(";")).toContain("mi_session=");
    expect(state.inserts.filter((row) => row.table === "users")).toHaveLength(0);
    expect(state.orgConfigQueries).toBe(1);
    expect(state.events).toContainEqual(expect.objectContaining({
      eventName: "login_complete",
      props: { method: "google" },
    }));
  });

  it("does not create a new account before the age gate", async () => {
    const { state: signedState, nonce } = consumerState();
    const response = await request(app())
      .get(`/api/auth/sso/google/callback?code=code&state=${encodeURIComponent(signedState)}`)
      .set("Cookie", `mi_sso_state=${nonce}`);

    expect(response.status).toBe(200);
    expect(response.text).toContain("One last step");
    expect(state.inserts.filter((row) => row.table === "users")).toHaveLength(0);
    expect(state.orgConfigQueries).toBe(1);
  });

  it("blocks an under-13 signup without storing an account", async () => {
    const token = jwt.sign({
      purpose: "google_pending_signup",
      email: "person@example.com",
      name: "Example Person",
      returnTo: "/history",
    }, process.env.SESSION_SECRET!, { expiresIn: "15m" });
    const now = new Date();

    const response = await request(app())
      .post("/api/auth/sso/complete-signup")
      .type("form")
      .send({ token, birthMonth: now.getMonth() + 1, birthYear: now.getFullYear() - 10 });

    expect(response.status).toBe(400);
    expect(response.text).toContain("13 or older");
    expect(state.inserts.filter((row) => row.table === "users")).toHaveLength(0);
  });

  it("creates an age-approved account and records Google registration analytics", async () => {
    const token = jwt.sign({
      purpose: "google_pending_signup",
      email: "person@example.com",
      name: "Example Person",
      returnTo: "/history",
    }, process.env.SESSION_SECRET!, { expiresIn: "15m" });

    const response = await request(app())
      .post("/api/auth/sso/complete-signup")
      .type("form")
      .send({ token, birthMonth: 1, birthYear: 1990 });

    expect(response.status).toBe(200);
    expect(state.inserts.filter((row) => row.table === "users")).toHaveLength(1);
    expect(state.orgConfigQueries).toBe(1);
    expect(state.events.map((event) => [event.eventName, event.props?.method])).toEqual([
      ["signup_complete", "google"],
      ["login_complete", "google"],
    ]);
  });

  it.each(["google", "microsoft"] as const)(
    "does not issue a consumer session for a %s-enforced organisation domain",
    async (enforcedProvider) => {
      state.user = { id: "user-1", email: "person@example.com", displayName: null };
      state.orgConfig = {
        id: "sso-config",
        orgId: "org-1",
        domain: "example.com",
        provider: enforcedProvider,
        status: "verified",
        enforceSSO: true,
      };
      const { state: signedState, nonce } = consumerState("/org");

      const response = await request(app())
        .get(`/api/auth/sso/google/callback?code=code&state=${encodeURIComponent(signedState)}`)
        .set("Cookie", `mi_sso_state=${nonce}`);

      expect(response.status).toBe(400);
      expect(response.text).toContain("Use your organisation sign-in");
      expect(response.text).toContain(`/api/auth/sso/${enforcedProvider}/start?`);
      expect(response.headers["set-cookie"]?.join(";") ?? "").not.toContain("mi_session=");
      expect(state.inserts.filter((row) => row.table === "users")).toHaveLength(0);
      expect(state.events).toHaveLength(0);
    },
  );

  it("re-checks enforcement after the age gate before creating an account", async () => {
    const { state: signedState, nonce } = consumerState("/org");
    const callback = await request(app())
      .get(`/api/auth/sso/google/callback?code=code&state=${encodeURIComponent(signedState)}`)
      .set("Cookie", `mi_sso_state=${nonce}`);
    const pendingToken = callback.text.match(/name="token" value="([^"]+)"/)?.[1];
    expect(pendingToken).toBeTruthy();
    expect(state.inserts.filter((row) => row.table === "users")).toHaveLength(0);

    state.orgConfig = {
      id: "sso-config",
      orgId: "org-1",
      domain: "example.com",
      provider: "microsoft",
      status: "verified",
      enforceSSO: true,
    };

    const completion = await request(app())
      .post("/api/auth/sso/complete-signup")
      .type("form")
      .send({ token: pendingToken, birthMonth: 1, birthYear: 1990 });

    expect(completion.status).toBe(400);
    expect(completion.text).toContain("Use your organisation sign-in");
    expect(completion.text).toContain("/api/auth/sso/microsoft/start?");
    expect(completion.headers["set-cookie"]?.join(";") ?? "").not.toContain("mi_session=");
    expect(state.inserts.filter((row) => row.table === "users")).toHaveLength(0);
    expect(state.events).toHaveLength(0);
  });
});