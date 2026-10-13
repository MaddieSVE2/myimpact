import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";

// The match-funding and SSO routes (routes/org-match.ts, routes/org-sso.ts)
// are for organisation managers only, through requireOrgManager.
const state = vi.hoisted(() => ({
  authUser: null as { id: string; email: string } | null,
  membership: null as { orgId: string; userId: string; role: string; status: string } | null,
  organisation: { revokedAt: null } as { revokedAt: Date | null } | null,
  membershipQueries: [] as unknown[],
}));

vi.mock("@workspace/db", () => {
  const tableTag = (name: string) => ({ __tableName: name });
  return {
    db: {
      query: {
        orgMembersTable: {
          findFirst: vi.fn(async (q: unknown) => {
            state.membershipQueries.push(q);
            return state.membership;
          }),
        },
        organisationsTable: { findFirst: vi.fn(async () => state.organisation) },
        orgMatchRatesTable: { findMany: vi.fn(async () => []) },
        orgSsoConfigsTable: { findMany: vi.fn(async () => []) },
      },
    },
    organisationsTable: tableTag("organisations"),
    orgMembersTable: tableTag("org_members"),
    impactRecordsTable: tableTag("impact_records"),
    orgMatchRatesTable: tableTag("org_match_rates"),
    orgSsoConfigsTable: tableTag("org_sso_configs"),
  };
});

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: (col: unknown, val: unknown) => ({ eq: [col, val] }),
    and: (...conds: unknown[]) => ({ and: conds }),
  };
});

vi.mock("../src/middleware/authenticate.js", () => ({
  authenticate: (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!state.authUser) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    (req as express.Request & { user?: { id: string; email: string } }).user = state.authUser;
    next();
  },
}));

vi.mock("../src/lib/oidc.js", () => ({
  configuredProviders: () => ["google"],
  isProviderConfigured: () => true,
  normalizeDomain: (d: string) => d,
}));

const { default: orgMatchRouter } = await import("../src/routes/org-match.js");
const { default: orgSsoRouter } = await import("../src/routes/org-sso.js");

const app = express();
app.use(express.json());
app.use("/api/org", orgMatchRouter);
app.use("/api/org", orgSsoRouter);

const ROUTES = ["/api/org/match/rates", "/api/org/sso/config"];

beforeEach(() => {
  state.authUser = { id: "user-1", email: "manager@example.org" };
  state.membership = { orgId: "org-1", userId: "user-1", role: "manager", status: "active" };
  state.organisation = { revokedAt: null };
  state.membershipQueries = [];
});

describe("manager-only organisation routes", () => {
  it.each(ROUTES)("%s answers a manager", async (path) => {
    const res = await request(app).get(path);
    expect(res.status).toBe(200);
  });

  it.each(ROUTES)("%s needs a signed-in user", async (path) => {
    state.authUser = null;
    expect((await request(app).get(path)).status).toBe(401);
  });

  it.each(ROUTES)("%s refuses someone outside any organisation", async (path) => {
    state.membership = null;
    const res = await request(app).get(path);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("You are not a member of any organisation.");
  });

  it.each(ROUTES)("%s refuses a member who isn't a manager", async (path) => {
    state.membership = { orgId: "org-1", userId: "user-1", role: "member", status: "active" };
    const res = await request(app).get(path);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Only organisation managers can perform this action.");
  });

  it.each(ROUTES)("%s refuses a manager of a revoked organisation", async (path) => {
    state.organisation = { revokedAt: new Date("2026-01-01") };
    expect((await request(app).get(path)).status).toBe(403);
  });

  it("only looks at active memberships", async () => {
    await request(app).get("/api/org/sso/config");
    expect(JSON.stringify(state.membershipQueries[0])).toContain('"active"');
  });
});
