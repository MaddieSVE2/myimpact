import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";

// ─────────────────────────────────────────────────────────────────────────────
// Strict regression test for "quick logs always count toward open challenges".
//
// The previous test only asserted that progress *increased* after a save —
// which can pass even when seeded data already contributes. Here we:
//
//   1. Spin up a brand-new user with NO impact records of any kind.
//   2. Have that user create a personal challenge (auto-joined as participant).
//   3. Verify the baseline contributing-record list is empty (progress 0,
//      contributingRecordIds === []).
//   4. Set the wizard challenge-context sessionStorage key by calling the
//      *real* QuickLogActivity helper (`setChallengeContext`).
//   5. POST one impact record through /api/impact/save (the same endpoint the
//      QuickLogActivity page calls when the URL is /log?challenge=ID).
//   6. Run the *real* post-save cleanup helper (`consumeChallengeContextForSave`)
//      that QuickLogActivity calls in its handleSubmit success branch, and
//      assert it both returns the previously-set id AND clears the
//      sessionStorage key.
//   7. Re-fetch the challenge and assert the API's contributingRecordIds
//      contains exactly the brand-new record id and nothing else.
// ─────────────────────────────────────────────────────────────────────────────

// Wire up a minimal in-memory sessionStorage for the node test env so the
// real challenge-context helpers can read/write it without pulling jsdom.
const memSessionStorage = (() => {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => { store.clear(); },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size; },
  };
})();
(globalThis as unknown as { window: { sessionStorage: typeof memSessionStorage } }).window = {
  sessionStorage: memSessionStorage,
};

// ── Hoisted in-memory DB state shared across mocks and tests ────────────────
const tables = vi.hoisted(() => ({
  challenges: [] as Record<string, unknown>[],
  challengeParticipants: [] as Record<string, unknown>[],
  impactRecords: [] as Record<string, unknown>[],
  users: [] as Record<string, unknown>[],
  orgMembers: [] as Record<string, unknown>[],
  organisations: [] as Record<string, unknown>[],
  nextRecordId: 1,
  authUser: null as { id: string; email: string } | null,
}));

// ── @workspace/db mock with a tiny evaluatable query layer ──────────────────
vi.mock("@workspace/db", () => {
  type ColRef = { __table: string; __col: string };
  type TableTag = { __table: string };

  const tableTag = (name: string): TableTag => {
    const base = { __table: name } as Record<string, unknown>;
    return new Proxy(base, {
      get(target, prop) {
        if (prop === "__table") return name;
        if (typeof prop === "symbol") return target[prop as unknown as string];
        const key = String(prop);
        if (key in target) return target[key];
        const ref: ColRef = { __table: name, __col: key };
        return ref;
      },
    }) as unknown as TableTag;
  };

  type Cond =
    | { op: "eq"; col: ColRef; val: unknown }
    | { op: "in"; col: ColRef; arr: unknown[] }
    | { op: "gte"; col: ColRef; val: unknown }
    | { op: "lte"; col: ColRef; val: unknown }
    | { op: "lt"; col: ColRef; val: unknown }
    | { op: "and"; args: Cond[] }
    | { op: "or"; args: Cond[] }
    | { op: "true" };

  const isCond = (v: unknown): v is Cond =>
    !!v && typeof v === "object" && "op" in (v as Record<string, unknown>);

  function matches(row: Record<string, unknown>, cond: unknown): boolean {
    if (!isCond(cond)) return true;
    if (cond.op === "and") return cond.args.every((c) => matches(row, c));
    if (cond.op === "or") return cond.args.some((c) => matches(row, c));
    if (cond.op === "true") return true;
    const left = row[cond.col.__col];
    const toMs = (v: unknown): number =>
      v instanceof Date ? v.getTime()
        : typeof v === "string" || typeof v === "number" ? new Date(v).getTime()
        : NaN;
    if (cond.op === "eq") {
      if (left instanceof Date && (typeof cond.val === "string" || cond.val instanceof Date)) {
        return toMs(left) === toMs(cond.val);
      }
      return left === cond.val;
    }
    if (cond.op === "in") return cond.arr.some((v) => v === left);
    if (cond.op === "gte") return toMs(left) >= toMs(cond.val);
    if (cond.op === "lte") return toMs(left) <= toMs(cond.val);
    if (cond.op === "lt") return toMs(left) < toMs(cond.val);
    return true;
  }

  const tableMap: Record<string, Record<string, unknown>[]> = {
    challenges: tables.challenges,
    challenge_participants: tables.challengeParticipants,
    impact_records: tables.impactRecords,
    users: tables.users,
    org_members: tables.orgMembers,
    organisations: tables.organisations,
  };

  function project(rows: Record<string, unknown>[], cols: unknown): Record<string, unknown>[] {
    if (!cols || typeof cols !== "object") return rows;
    const c = cols as Record<string, ColRef>;
    const keys = Object.keys(c);
    if (keys.length === 0 || !c[keys[0]]?.__col) return rows;
    return rows.map((r) => {
      const out: Record<string, unknown> = {};
      for (const k of keys) out[k] = r[c[k].__col];
      return out;
    });
  }

  function selectBuilder(cols?: unknown) {
    let _table = "";
    let _where: unknown = null;
    let _orderBy: { col: ColRef; dir: "asc" | "desc" }[] = [];
    let _limit: number | null = null;
    const exec = async () => {
      let rows = (tableMap[_table] ?? []).slice();
      if (_where) rows = rows.filter((r) => matches(r, _where));
      if (_orderBy.length) {
        const o = _orderBy[0];
        rows.sort((a, b) => {
          const av = a[o.col.__col] as number | string | Date;
          const bv = b[o.col.__col] as number | string | Date;
          const an = av instanceof Date ? av.getTime() : (av as number);
          const bn = bv instanceof Date ? bv.getTime() : (bv as number);
          return (an > bn ? 1 : an < bn ? -1 : 0) * (o.dir === "desc" ? -1 : 1);
        });
      }
      if (_limit != null) rows = rows.slice(0, _limit);
      return project(rows, cols);
    };
    const builder: Record<string, unknown> = {
      from(t: TableTag) { _table = t.__table; return builder; },
      where(c: unknown) { _where = c; return builder; },
      orderBy(...orders: { __dir?: "asc" | "desc"; __col?: ColRef; col?: ColRef }[]) {
        _orderBy = orders.map((o) => ({
          col: (o.__col ?? o.col) as ColRef,
          dir: (o.__dir ?? "asc") as "asc" | "desc",
        }));
        return builder;
      },
      limit(n: number) { _limit = n; return builder; },
      then: (resolve: (v: unknown[]) => unknown, reject?: (e: unknown) => unknown) =>
        exec().then(resolve, reject),
      catch: (reject: (e: unknown) => unknown) => exec().catch(reject),
      finally: (cb: () => void) => exec().finally(cb),
    };
    return builder;
  }

  function insertBuilder(table: TableTag) {
    return {
      values(vals: unknown) {
        const arr = Array.isArray(vals) ? vals : [vals];
        const inserted: Record<string, unknown>[] = [];
        for (const raw of arr) {
          const row = { ...(raw as Record<string, unknown>) };
          if (table.__table === "impact_records" && row.id == null) {
            row.id = tables.nextRecordId++;
          }
          if (row.createdAt == null) row.createdAt = new Date();
          tableMap[table.__table].push(row);
          inserted.push(row);
        }
        return {
          returning: async () => inserted,
          onConflictDoNothing: () => Promise.resolve(undefined),
          then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
            Promise.resolve(undefined).then(resolve, reject),
          catch: (reject: (e: unknown) => unknown) => Promise.resolve(undefined).catch(reject),
          finally: (cb: () => void) => Promise.resolve(undefined).finally(cb),
        };
      },
    };
  }

  function updateBuilder(table: TableTag) {
    let _set: Record<string, unknown> = {};
    const b = {
      set(s: Record<string, unknown>) { _set = s; return b; },
      where(c: unknown) {
        const apply = async () => {
          const matched = tableMap[table.__table].filter((r) => matches(r, c));
          for (const r of matched) Object.assign(r, _set);
          return matched;
        };
        return {
          returning: () => apply(),
          then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
            apply().then(resolve, reject),
          catch: (reject: (e: unknown) => unknown) => apply().catch(reject),
          finally: (cb: () => void) => apply().finally(cb),
        };
      },
    };
    return b;
  }

  function deleteBuilder(table: TableTag) {
    return {
      where(c: unknown) {
        const before = tableMap[table.__table];
        const kept = before.filter((r) => !matches(r, c));
        before.length = 0;
        before.push(...kept);
        return Promise.resolve(undefined);
      },
    };
  }

  const findFirst = (rows: Record<string, unknown>[]) =>
    async (opts?: { where?: unknown }) => {
      const where = opts?.where;
      const filtered = where ? rows.filter((r) => matches(r, where)) : rows;
      return filtered[0] ?? null;
    };
  const findMany = (rows: Record<string, unknown>[]) =>
    async (opts?: { where?: unknown }) => {
      const where = opts?.where;
      return where ? rows.filter((r) => matches(r, where)) : rows.slice();
    };

  const db = {
    query: {
      challengesTable: { findFirst: findFirst(tables.challenges), findMany: findMany(tables.challenges) },
      challengeParticipantsTable: { findFirst: findFirst(tables.challengeParticipants), findMany: findMany(tables.challengeParticipants) },
      orgMembersTable: { findFirst: findFirst(tables.orgMembers), findMany: findMany(tables.orgMembers) },
      organisationsTable: { findFirst: findFirst(tables.organisations) },
      impactRecordsTable: { findFirst: findFirst(tables.impactRecords) },
      usersTable: { findFirst: findFirst(tables.users) },
    },
    select: (cols?: unknown) => selectBuilder(cols),
    insert: (t: TableTag) => insertBuilder(t),
    update: (t: TableTag) => updateBuilder(t),
    delete: (t: TableTag) => deleteBuilder(t),
    transaction: async (cb: (tx: unknown) => unknown) => cb({
      insert: (t: TableTag) => insertBuilder(t),
      update: (t: TableTag) => updateBuilder(t),
      delete: (t: TableTag) => deleteBuilder(t),
      select: (c?: unknown) => selectBuilder(c),
    }),
  };

  return {
    db,
    challengesTable: tableTag("challenges"),
    challengeParticipantsTable: tableTag("challenge_participants"),
    impactRecordsTable: tableTag("impact_records"),
    orgMembersTable: tableTag("org_members"),
    organisationsTable: tableTag("organisations"),
    usersTable: tableTag("users"),
    orgMatchRatesTable: tableTag("org_match_rates"),
    journalEntriesTable: tableTag("journal_entries"),
    recurringTemplatesTable: tableTag("recurring_templates"),
    userProfilesTable: tableTag("user_profiles"),
    recordVerificationsTable: tableTag("record_verifications"),
  };
});

// ── drizzle-orm operator mock ───────────────────────────────────────────────
vi.mock("drizzle-orm", () => {
  type ColRef = { __table: string; __col: string };
  return {
    eq: (col: ColRef, val: unknown) => ({ op: "eq", col, val }),
    inArray: (col: ColRef, arr: unknown[]) => ({ op: "in", col, arr }),
    gte: (col: ColRef, val: unknown) => ({ op: "gte", col, val }),
    lte: (col: ColRef, val: unknown) => ({ op: "lte", col, val }),
    lt: (col: ColRef, val: unknown) => ({ op: "lt", col, val }),
    and: (...args: unknown[]) => ({ op: "and", args: args.filter(Boolean) }),
    or: (...args: unknown[]) => ({ op: "or", args: args.filter(Boolean) }),
    desc: (col: ColRef) => ({ __col: col, __dir: "desc" }),
    asc: (col: ColRef) => ({ __col: col, __dir: "asc" }),
    isNotNull: () => ({ op: "true" }),
    ilike: () => ({ op: "true" }),
    sql: (..._args: unknown[]) => ({ queryChunks: [] }),
  };
});

// ── Authenticate middleware: read user from hoisted state ───────────────────
vi.mock("../src/middleware/authenticate.js", () => ({
  authenticate: (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!tables.authUser) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    (req as express.Request & { user?: { id: string; email: string } }).user = tables.authUser;
    next();
  },
}));

// ── Stub heavy or unrelated modules pulled in by the routers ────────────────
vi.mock("../src/lib/resend.js", () => ({
  getUncachableResendClient: vi.fn(async () => ({
    client: { emails: { send: vi.fn(async () => ({ id: "stub" })) } },
    fromEmail: "test@example.com",
  })),
}));
vi.mock("@react-pdf/renderer", () => ({ renderToBuffer: vi.fn(async () => Buffer.from("")) }));
vi.mock("../src/lib/impactPdf.js", () => ({
  buildImpactDocument: vi.fn(() => null),
  parsePdfData: vi.fn(() => ({})),
}));
vi.mock("../src/lib/evidencePackPdf.js", () => ({ buildEvidencePackDocument: vi.fn(() => null) }));
vi.mock("../src/lib/streak.js", () => ({ calculateStreak: vi.fn(() => 0) }));
vi.mock("../src/lib/orgMatch.js", () => ({ computeMatchesForRecords: vi.fn(() => []) }));
vi.mock("../src/lib/webhookDispatcher.js", () => ({ enqueueOrgEvent: vi.fn(async () => undefined) }));
vi.mock("../src/lib/analytics.js", () => ({
  trackServerEvent: vi.fn(),
  ANALYTICS_EVENTS: [],
}));
vi.mock("../src/lib/auditLog.js", () => ({ recordAuditEvent: vi.fn() }));
vi.mock("../src/lib/attachmentCleanup.js", () => ({
  deleteAttachmentsForRecord: vi.fn(async () => undefined),
  deleteAllAttachmentsForUser: vi.fn(async () => undefined),
}));
vi.mock("../src/routes/org.js", () => ({
  default: express.Router(),
  getVerifiedTotalsForOrg: vi.fn(async () => ({ totalValue: 0, totalHours: 0 })),
}));

// Now import the routers (after all mocks are registered) and the *real*
// challenge-context helpers from QuickLogActivity's shared module.
const { default: challengesRouter } = await import("../src/routes/challenges.js");
const { default: impactRouter } = await import("../src/routes/impact.js");
const {
  CHALLENGE_CONTEXT_KEY,
  getChallengeContext,
  setChallengeContext,
  consumeChallengeContextForSave,
} = await import("../../my-impact/src/lib/challenge-context.js");

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/challenges", challengesRouter);
  app.use("/api/impact", impactRouter);
  return app;
}

beforeEach(() => {
  tables.challenges.length = 0;
  tables.challengeParticipants.length = 0;
  tables.impactRecords.length = 0;
  tables.users.length = 0;
  tables.orgMembers.length = 0;
  tables.organisations.length = 0;
  tables.nextRecordId = 1;
  tables.authUser = null;
  memSessionStorage.clear();
});

describe("Quick log → challenge attribution (strict regression)", () => {
  it("attributes exactly the new record id (and nothing else) to a fresh user's open challenge, and the real post-save helper clears the wizard challenge-context sessionStorage key", async () => {
    // Brand-new user with no impact records of any kind.
    const userId = "fresh-user-001";
    tables.authUser = { id: userId, email: "fresh@example.com" };
    tables.users.push({ id: userId, email: "fresh@example.com", displayName: "Fresh User" });
    expect(tables.impactRecords.filter((r) => r.userId === userId)).toHaveLength(0);

    const app = makeApp();

    // 1) Create a personal challenge — owner is auto-joined as participant.
    const now = new Date();
    const startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const endDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const createRes = await request(app).post("/api/challenges").send({
      name: "Plant 50 trees",
      goalType: "social_value",
      target: 1000,
      startDate,
      endDate,
      scope: "personal",
    });
    expect(createRes.status).toBe(200);
    const challengeId = createRes.body.challenge.id as string;
    expect(typeof challengeId).toBe("string");

    // 2) Baseline contributing-record list from the API is empty.
    const baselineRes = await request(app).get(`/api/challenges/${challengeId}`);
    expect(baselineRes.status).toBe(200);
    expect(baselineRes.body.progress.total).toBe(0);
    expect(baselineRes.body.progress.contributingRecordIds).toEqual([]);
    expect(baselineRes.body.leaderboard).toHaveLength(1);
    expect(baselineRes.body.leaderboard[0].contribution).toBe(0);

    // 3) Use the *real* QuickLogActivity helper to set the wizard
    //    challenge-context key — this is what runs in the page's mount
    //    effect when the URL is /log?challenge=ID.
    setChallengeContext(challengeId);
    expect(getChallengeContext()).toBe(challengeId);
    // Sanity: the mock sessionStorage actually received the value the
    // helper writes under the canonical key.
    expect(memSessionStorage.getItem(CHALLENGE_CONTEXT_KEY)).toBe(challengeId);

    // 4) POST one impact record through /api/impact/save — the same
    //    endpoint QuickLogActivity calls via useSaveImpact.
    const todayIso = now.toISOString().slice(0, 10);
    const saveRes = await request(app).post("/api/impact/save").send({
      userId,
      name: "My Impact Record",
      entryDate: todayIso,
      activities: [
        { activityId: "tree_planting", quantity: 10, hoursPerYear: 5 },
      ],
      donationsGBP: 0,
      additionalVolunteerHours: 0,
    });
    expect(saveRes.status).toBe(200);
    const newRecordId = String(saveRes.body.id);
    expect(newRecordId).toMatch(/^\d+$/);
    const newRecordValue = saveRes.body.impactResult.totalValue as number;
    expect(newRecordValue).toBeGreaterThan(0);

    // 5) Run the *real* QuickLogActivity post-save cleanup helper. This is
    //    the exact function the page calls in its handleSubmit success
    //    branch — if a future refactor breaks it, this assertion fails.
    const consumed = consumeChallengeContextForSave();
    expect(consumed).toBe(challengeId);
    expect(getChallengeContext()).toBeNull();
    expect(memSessionStorage.getItem(CHALLENGE_CONTEXT_KEY)).toBeNull();

    // 6) Re-fetch the challenge: the API's contributing-record list
    //    contains exactly the brand-new record id and nothing else, and
    //    progress totals reflect exactly that record's value.
    const afterRes = await request(app).get(`/api/challenges/${challengeId}`);
    expect(afterRes.status).toBe(200);
    expect(afterRes.body.progress.contributingRecordIds).toEqual([newRecordId]);
    expect(afterRes.body.progress.total).toBe(Math.round(newRecordValue * 100) / 100);
    expect(afterRes.body.leaderboard).toHaveLength(1);
    expect(afterRes.body.leaderboard[0].userId).toBe(userId);
    expect(afterRes.body.leaderboard[0].contribution).toBe(
      Math.round(newRecordValue * 100) / 100
    );
  });
});
