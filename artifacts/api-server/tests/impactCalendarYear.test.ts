import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";

// ── Hoisted in-memory DB + drizzle predicate evaluator ──────────────────────
//
// These tests cover the calendar-year invariants of the impact API:
//   * /save with a backdated entryDate lands in the right calendar year
//     and is flagged as `retrospective`.
//   * /history?year=YYYY returns ONLY entries whose entryDate falls in
//     that year (strictly < Jan 1 of next year, no off-by-one leakage).
//   * /year-rollover only returns shouldShow=true when the user has
//     prior-year entries AND no current-year entries.
//   * Ticking a habit twice in the same calendar month does not create
//     duplicate impact entries (the second tick is a no-op).
//
// To exercise the route logic for real, we mock @workspace/db and
// drizzle-orm so that `where(...)` predicates are real JS functions
// evaluated against in-memory rows. That way our assertions reflect what
// the route actually queries — not what the test prepared as a canned
// response.

interface Col { __col: string }
type Pred = (row: Record<string, unknown>) => boolean;
interface SqlMarker { __sql: true; chunks: unknown[] }
interface SortDescriptor { __sort: "asc" | "desc"; col: string | undefined }

const state = vi.hoisted(() => {
  const impactRecords: Record<string, unknown>[] = [];
  const recurringTemplates: Record<string, unknown>[] = [];
  const recordVerifications: Record<string, unknown>[] = [];
  const userProfiles: Record<string, unknown>[] = [];
  const orgMembers: Record<string, unknown>[] = [];
  const ids = { impact: 1, template: 1 };
  return {
    impactRecords,
    recurringTemplates,
    recordVerifications,
    userProfiles,
    orgMembers,
    ids,
    authUser: null as { id: string; email: string } | null,
    nowOverride: null as Date | null,
    txQueue: Promise.resolve() as Promise<unknown>,
  };
});

function isCol(v: unknown): v is Col {
  return !!v && typeof v === "object" && "__col" in (v as object);
}

function isSql(v: unknown): v is SqlMarker {
  return !!v && typeof v === "object" && (v as SqlMarker).__sql === true;
}

function compare(a: unknown, b: unknown): number {
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "string" && typeof b === "string") return a < b ? -1 : a > b ? 1 : 0;
  return 0;
}

vi.mock("drizzle-orm", () => {
  const eq = (col: Col, val: unknown): Pred => (row) => {
    const v = row[col.__col];
    if (v instanceof Date && val instanceof Date) return v.getTime() === val.getTime();
    return v === val;
  };
  const gte = (col: Col, val: unknown): Pred => (row) => compare(row[col.__col], val) >= 0;
  const lte = (col: Col, val: unknown): Pred => (row) => compare(row[col.__col], val) <= 0;
  const lt = (col: Col, val: unknown): Pred => (row) => compare(row[col.__col], val) < 0;
  const and = (...preds: Array<Pred | undefined | null | false>): Pred => (row) =>
    preds.every((p) => !p || (typeof p === "function" && p(row)));
  const or = (...preds: Array<Pred | undefined | null | false>): Pred => (row) =>
    preds.some((p) => typeof p === "function" && p(row));
  const inArray = (col: Col, vals: unknown[]): Pred => (row) => vals.includes(row[col.__col]);
  const isNotNull = (col: Col): Pred => (row) => row[col.__col] != null;
  const ilike = (col: Col, val: string): Pred => {
    const needle = String(val).replace(/%/g, "").toLowerCase();
    return (row) => String(row[col.__col] ?? "").toLowerCase().includes(needle);
  };
  const desc = (col: Col): SortDescriptor => ({ __sort: "desc", col: col?.__col });
  const asc = (col: Col): SortDescriptor => ({ __sort: "asc", col: col?.__col });
  function sql(strings: TemplateStringsArray, ..._values: unknown[]): SqlMarker {
    return { __sql: true, chunks: [...(strings as unknown as string[])] };
  }
  sql.raw = (s: string): SqlMarker => ({ __sql: true, chunks: [s] });
  sql.join = (...args: unknown[]): SqlMarker => ({ __sql: true, chunks: args });
  return { eq, gte, lte, lt, and, or, inArray, isNotNull, ilike, desc, asc, sql };
});

function tableTag(name: string, columns: string[]) {
  const t: Record<string, unknown> = { __tableName: name };
  for (const c of columns) t[c] = { __col: c } as Col;
  return t as { __tableName: string } & Record<string, Col>;
}

vi.mock("@workspace/db", () => {
  const impactRecordsTable = tableTag("impact_records", [
    "id", "userId", "name", "periodLabel", "totalValue", "impactValue",
    "contributionValue", "donationsValue", "personalDevelopmentValue",
    "totalHours", "activitiesJson", "resultJson", "region", "outwardCode",
    "lat", "lng", "attestedByApiKeyId", "attestedAt", "submittedToOrgId",
    "submittedToOrgAt", "source", "tags", "entryDate", "habitTemplateId",
    "createdAt", "kind", "locationJson", "reportingYear",
  ]);
  const recurringTemplatesTable = tableTag("recurring_templates", [
    "id", "userId", "label", "cadence", "dayOfPeriod", "anchorDate",
    "defaultActivities", "defaultDonationsGBP", "lastConfirmedAt",
    "occurrenceActivities", "occurrenceDonationsGBP", "usualLocationJson",
    "sharingOrgId", "lastSkippedAt", "createdAt",
  ]);
  const orgMembersTable = tableTag("org_members", ["id", "orgId", "userId", "role"]);
  const organisationsTable = tableTag("organisations", ["id", "name"]);
  const orgMatchRatesTable = tableTag("org_match_rates", ["id", "orgId", "effectiveFrom"]);
  const journalEntriesTable = tableTag("journal_entries", ["id", "userId"]);
  const userProfilesTable = tableTag("user_profiles", ["id", "userId", "lastAckedStreakMilestone"]);
  const recordVerificationsTable = tableTag("record_verifications", [
    "id", "recordId", "orgId", "status", "reason", "decidedAt",
  ]);

  function tableStore(name: string): Record<string, unknown>[] {
    switch (name) {
      case "impact_records": return state.impactRecords;
      case "recurring_templates": return state.recurringTemplates;
      case "record_verifications": return state.recordVerifications;
      case "user_profiles": return state.userProfiles;
      case "org_members": return state.orgMembers;
      default: return [];
    }
  }

  function applySort(rows: Record<string, unknown>[], sorters: SortDescriptor[]) {
    if (sorters.length === 0) return rows;
    return [...rows].sort((a, b) => {
      for (const s of sorters) {
        if (!s?.col) continue;
        const c = compare(a[s.col], b[s.col]);
        if (c !== 0) return s.__sort === "desc" ? -c : c;
      }
      return 0;
    });
  }

  function projectCols(
    rows: Record<string, unknown>[],
    cols: Record<string, unknown> | undefined,
  ): Record<string, unknown>[] {
    if (!cols) return rows;
    // Detect aggregate (count) — return single row with count.
    const aggregateKeys: string[] = [];
    for (const [k, v] of Object.entries(cols)) {
      if (isSql(v)) aggregateKeys.push(k);
    }
    if (aggregateKeys.length > 0) {
      const out: Record<string, unknown> = {};
      for (const k of aggregateKeys) out[k] = rows.length;
      // Also project any column refs in the same select.
      for (const [k, v] of Object.entries(cols)) {
        if (isCol(v)) out[k] = rows.length > 0 ? rows[0][v.__col] : null;
      }
      return [out];
    }
    return rows.map((r) => {
      const o: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(cols)) {
        if (isCol(v)) o[k] = r[v.__col];
      }
      return o;
    });
  }

  function makeBuilder(
    cols: Record<string, unknown> | undefined,
    options: { joins?: Array<{ table: string; on: Pred }> } = {},
  ) {
    let table: string | null = null;
    let predicate: Pred | null = null;
    const sorters: SortDescriptor[] = [];
    let limit: number | null = null;
    const joins = options.joins ?? [];

    function resolve(): Record<string, unknown>[] {
      if (!table) return [];
      let rows = tableStore(table).filter((r) => (predicate ? predicate(r) : true));
      // For inner joins (only used for verifications -> orgs), if either
      // side is empty the result is empty. We only need empty-or-full
      // semantics for these tests.
      for (const j of joins) {
        const other = tableStore(j.table);
        if (other.length === 0 || rows.length === 0) {
          rows = [];
          break;
        }
        // Pair every row with first matching org by predicate.
        const merged: Record<string, unknown>[] = [];
        for (const r of rows) {
          for (const o of other) {
            const combined = { ...r, ...o };
            if (j.on(combined)) {
              merged.push(combined);
              break;
            }
          }
        }
        rows = merged;
      }
      rows = applySort(rows, sorters);
      if (limit != null) rows = rows.slice(0, limit);
      return projectCols(rows, cols);
    }

    const b: Record<string, unknown> = {};
    b.from = (t: { __tableName: string }) => { table = t.__tableName; return b; };
    b.innerJoin = (t: { __tableName: string }, on: Pred) => {
      joins.push({ table: t.__tableName, on });
      return b;
    };
    b.leftJoin = b.innerJoin;
    b.where = (p: Pred) => { predicate = p; return b; };
    b.orderBy = (...args: SortDescriptor[]) => { sorters.push(...args); return b; };
    b.groupBy = () => b;
    b.limit = (n: number) => { limit = n; return b; };
    b.then = (resolve2: (v: unknown[]) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(resolve()).then(resolve2, reject);
    b.catch = (reject: (e: unknown) => unknown) =>
      Promise.resolve(resolve()).catch(reject);
    b.finally = (cb: () => void) => Promise.resolve(resolve()).finally(cb);
    return b;
  }

  function insertBuilder(table: { __tableName: string }) {
    return {
      values(rawVals: unknown) {
        const arr = Array.isArray(rawVals) ? rawVals : [rawVals];
        const inserted: Record<string, unknown>[] = [];
        for (const v of arr) {
          const row = { ...(v as Record<string, unknown>) };
          if (table.__tableName === "impact_records") {
            if (row.id == null) row.id = state.ids.impact++;
            if (row.createdAt == null) row.createdAt = new Date();
            if (row.tags == null) row.tags = [];
            if (row.source == null) row.source = "user";
          } else if (table.__tableName === "recurring_templates") {
            if (row.id == null) row.id = state.ids.template++;
            if (row.createdAt == null) row.createdAt = new Date();
          }
          tableStore(table.__tableName).push(row);
          inserted.push(row);
        }
        const ret = {
          returning: async () => inserted,
          then: (r: (v: unknown) => unknown, rj?: (e: unknown) => unknown) =>
            Promise.resolve(undefined).then(r, rj),
          catch: (rj: (e: unknown) => unknown) => Promise.resolve(undefined).catch(rj),
          finally: (cb: () => void) => Promise.resolve(undefined).finally(cb),
        };
        return ret;
      },
    };
  }

  function updateBuilder(table: { __tableName: string }) {
    let setVals: Record<string, unknown> = {};
    let predicate: Pred | null = null;
    const b: Record<string, unknown> = {};
    b.set = (vals: Record<string, unknown>) => { setVals = vals; return b; };
    b.where = (p: Pred) => { predicate = p; return b; };
    b.returning = async () => {
      const store = tableStore(table.__tableName);
      const updated: Record<string, unknown>[] = [];
      for (const r of store) {
        if (!predicate || predicate(r)) {
          Object.assign(r, setVals);
          updated.push(r);
        }
      }
      return updated;
    };
    return b;
  }

  function deleteBuilder(table: { __tableName: string }) {
    let predicate: Pred | null = null;
    const b: Record<string, unknown> = {};
    b.where = (p: Pred) => { predicate = p; return b; };
    b.returning = async () => {
      const store = tableStore(table.__tableName);
      const removed: Record<string, unknown>[] = [];
      for (let i = store.length - 1; i >= 0; i--) {
        if (!predicate || predicate(store[i])) {
          removed.unshift(store[i]);
          store.splice(i, 1);
        }
      }
      return removed;
    };
    // Also awaitable directly.
    (b as { then?: unknown }).then = (resolveCb: (v: unknown) => unknown) => {
      const store = tableStore(table.__tableName);
      for (let i = store.length - 1; i >= 0; i--) {
        if (!predicate || predicate(store[i])) store.splice(i, 1);
      }
      return Promise.resolve(undefined).then(resolveCb);
    };
    return b;
  }

  const db = {
    select: (cols?: Record<string, unknown>) => makeBuilder(cols),
    insert: (table: { __tableName: string }) => insertBuilder(table),
    update: (table: { __tableName: string }) => updateBuilder(table),
    delete: (table: { __tableName: string }) => deleteBuilder(table),
    // Transactions run against the same in-memory stores; execute is a no-op
    // (used for advisory locks in the real DB). Transactions are serialized
    // through a queue, mirroring the advisory lock's behaviour so concurrency
    // tests exercise the lock-then-recheck path.
    transaction: (cb: (tx: unknown) => unknown) => {
      const tx = {
        select: (cols?: Record<string, unknown>) => makeBuilder(cols),
        insert: (table: { __tableName: string }) => insertBuilder(table),
        update: (table: { __tableName: string }) => updateBuilder(table),
        delete: (table: { __tableName: string }) => deleteBuilder(table),
        execute: async () => [],
      };
      const run = state.txQueue.then(() => cb(tx));
      state.txQueue = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
    execute: async () => [],
    query: {
      orgMembersTable: {
        findFirst: vi.fn(async (opts?: { where?: Pred }) => {
          const rows = state.orgMembers.filter((r) => (opts?.where ? opts.where(r) : true));
          return rows[0] ?? null;
        }),
        findMany: vi.fn(async (opts?: { where?: Pred }) =>
          state.orgMembers.filter((r) => (opts?.where ? opts.where(r) : true)),
        ),
      },
      userProfilesTable: {
        findFirst: vi.fn(async (opts?: { where?: Pred }) => {
          const rows = state.userProfiles.filter((r) => (opts?.where ? opts.where(r) : true));
          return rows[0] ?? null;
        }),
      },
      organisationsTable: {
        findFirst: vi.fn(async () => null),
      },
      orgMatchRatesTable: {
        findMany: vi.fn(async () => []),
      },
    },
  };

  return {
    db,
    impactRecordsTable,
    recurringTemplatesTable,
    orgMembersTable,
    organisationsTable,
    orgMatchRatesTable,
    journalEntriesTable,
    userProfilesTable,
    recordVerificationsTable,
  };
});

// Authenticate middleware reads the authUser set by the test.
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

// Stub heavy / unrelated modules pulled in at impact.ts load time.
vi.mock("@react-pdf/renderer", () => ({
  renderToBuffer: vi.fn(async () => Buffer.from("")),
  Font: { register: vi.fn() },
  Document: () => null,
  Page: () => null,
  Text: () => null,
  View: () => null,
  Image: () => null,
  StyleSheet: { create: (s: unknown) => s },
}));
vi.mock("../src/lib/impactPdf.js", () => ({
  buildImpactDocument: vi.fn(() => null),
  parsePdfData: vi.fn(() => ({})),
}));
vi.mock("../src/lib/evidencePackPdf.js", () => ({
  buildEvidencePackDocument: vi.fn(() => null),
}));
vi.mock("../src/lib/orgMatch.js", () => ({ computeMatchesForRecords: vi.fn(() => []) }));
vi.mock("../src/lib/webhookDispatcher.js", () => ({
  enqueueOrgEvent: vi.fn(async () => undefined),
}));
vi.mock("../src/lib/analytics.js", () => ({
  trackServerEvent: vi.fn(),
  ANALYTICS_EVENTS: [],
}));
vi.mock("../src/lib/auditLog.js", () => ({ recordAuditEvent: vi.fn(async () => undefined) }));
vi.mock("../src/lib/attachmentCleanup.js", () => ({
  deleteAttachmentsForRecord: vi.fn(async () => undefined),
  deleteAllAttachmentsForUser: vi.fn(async () => undefined),
}));
vi.mock("./org.js", () => ({
  getVerifiedTotalsForOrg: vi.fn(async () => ({})),
}));

const { default: impactRouter } = await import("../src/routes/impact.js");

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/impact", impactRouter);
  return app;
}

const USER = { id: "user_1", email: "u1@example.com" };

function resetAll() {
  state.impactRecords.length = 0;
  state.recurringTemplates.length = 0;
  state.recordVerifications.length = 0;
  state.userProfiles.length = 0;
  state.orgMembers.length = 0;
  state.ids.impact = 1;
  state.ids.template = 1;
  state.authUser = USER;
}

const baseSavePayload = (overrides: Record<string, unknown> = {}) => ({
  userId: USER.id,
  name: "Recycling at home",
  donationsGBP: 0,
  additionalVolunteerHours: 0,
  activities: [
    { activityId: "recycling", quantity: 52, hoursPerYear: 0 },
  ],
  ...overrides,
});

beforeEach(() => {
  resetAll();
});

describe("impact route — calendar-year invariants", () => {
  it("/save with a backdated entryDate places the entry in the prior year and flags it retrospective", async () => {
    const app = makeApp();
    const priorYear = new Date().getUTCFullYear() - 1;

    const res = await request(app)
      .post("/api/impact/save")
      .send(baseSavePayload({ entryDate: `${priorYear}-06-15` }))
      .expect(200);

    expect(res.body.entryDate.startsWith(String(priorYear))).toBe(true);
    expect(res.body.source).toBe("retrospective");

    expect(state.impactRecords).toHaveLength(1);
    const stored = state.impactRecords[0];
    expect(stored.source).toBe("retrospective");
    const storedDate = stored.entryDate as Date;
    expect(storedDate.getUTCFullYear()).toBe(priorYear);
    expect(storedDate.getUTCMonth()).toBe(5); // June
  });

  it("/save with no entryDate uses today and is flagged as a normal user entry", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/impact/save")
      .send(baseSavePayload())
      .expect(200);
    expect(res.body.source).toBe("user");
    const currentYear = new Date().getUTCFullYear();
    expect(res.body.entryDate.startsWith(String(currentYear))).toBe(true);
  });

  it("/history?year=YYYY returns ONLY entries dated within that calendar year", async () => {
    const app = makeApp();
    const currentYear = new Date().getUTCFullYear();
    const priorYear = currentYear - 1;

    // Three entries spanning prior year, current year, and the
    // boundary edge (1 Jan of the year after current — should never
    // leak into current year).
    state.impactRecords.push(
      makeRecord({ id: 1, entryDate: new Date(Date.UTC(priorYear, 5, 15)), name: "prior" }),
      makeRecord({ id: 2, entryDate: new Date(Date.UTC(currentYear, 2, 10)), name: "current-mar" }),
      makeRecord({ id: 3, entryDate: new Date(Date.UTC(currentYear, 11, 31)), name: "current-dec31" }),
      makeRecord({ id: 4, entryDate: new Date(Date.UTC(currentYear + 1, 0, 1)), name: "next-jan1" }),
    );

    const priorRes = await request(app)
      .get(`/api/impact/history?year=${priorYear}`)
      .expect(200);
    expect(priorRes.body.records.map((r: { name: string }) => r.name)).toEqual(["prior"]);

    const currentRes = await request(app)
      .get(`/api/impact/history?year=${currentYear}`)
      .expect(200);
    const names = currentRes.body.records.map((r: { name: string }) => r.name).sort();
    expect(names).toEqual(["current-dec31", "current-mar"]);
    // Strictly < Jan 1 of next year — `next-jan1` must never appear here.
    expect(names).not.toContain("next-jan1");
  });

  it("/history without a year filter returns every entry the user has", async () => {
    const app = makeApp();
    const currentYear = new Date().getUTCFullYear();
    state.impactRecords.push(
      makeRecord({ id: 1, entryDate: new Date(Date.UTC(currentYear - 2, 0, 1)) }),
      makeRecord({ id: 2, entryDate: new Date(Date.UTC(currentYear, 0, 1)) }),
    );
    const res = await request(app).get("/api/impact/history").expect(200);
    expect(res.body.records).toHaveLength(2);
  });

  it("/year-rollover: shouldShow=false when the user has no entries at all", async () => {
    const app = makeApp();
    const res = await request(app).get("/api/impact/year-rollover").expect(200);
    expect(res.body.shouldShow).toBe(false);
    expect(res.body.priorYear).toBeNull();
  });

  it("/year-rollover: shouldShow=true only when prior-year entries exist AND current year is empty", async () => {
    const app = makeApp();
    const currentYear = new Date().getUTCFullYear();
    const priorYear = currentYear - 1;

    state.impactRecords.push(
      makeRecord({ id: 1, entryDate: new Date(Date.UTC(priorYear, 5, 15)) }),
    );
    const res1 = await request(app).get("/api/impact/year-rollover").expect(200);
    expect(res1.body.shouldShow).toBe(true);
    expect(res1.body.priorYear).toBe(priorYear);
    expect(res1.body.currentYear).toBe(currentYear);

    // Once the user has any current-year entry, the prompt goes away.
    state.impactRecords.push(
      makeRecord({ id: 2, entryDate: new Date(Date.UTC(currentYear, 0, 5)) }),
    );
    const res2 = await request(app).get("/api/impact/year-rollover").expect(200);
    expect(res2.body.shouldShow).toBe(false);
  });

  it("/year-rollover: only flips to shouldShow=true on/after 1 Jan, not on 31 Dec of the prior year", async () => {
    const app = makeApp();
    // Pretend "this year" is 2025 (entries logged through 2025), then
    // travel to 31 Dec 2025 vs 1 Jan 2026 to confirm the prompt only
    // appears once the calendar year has actually rolled over.
    state.impactRecords.push(
      makeRecord({ id: 1, entryDate: new Date(Date.UTC(2025, 5, 15)) }),
      makeRecord({ id: 2, entryDate: new Date(Date.UTC(2025, 11, 30)) }),
    );

    vi.useFakeTimers();
    try {
      // 31 Dec 2025 — "current year" is still 2025 and the user has
      // entries in it, so the rollover prompt must NOT show.
      vi.setSystemTime(new Date(Date.UTC(2025, 11, 31, 23, 59, 0)));
      const dec31 = await request(app).get("/api/impact/year-rollover").expect(200);
      expect(dec31.body.currentYear).toBe(2025);
      expect(dec31.body.shouldShow).toBe(false);

      // 1 Jan 2026 — "current year" is 2026 (empty) and 2025 has
      // entries, so the rollover prompt SHOULD show.
      vi.setSystemTime(new Date(Date.UTC(2026, 0, 1, 0, 0, 1)));
      const jan1 = await request(app).get("/api/impact/year-rollover").expect(200);
      expect(jan1.body.currentYear).toBe(2026);
      expect(jan1.body.priorYear).toBe(2025);
      expect(jan1.body.shouldShow).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("past-year entries remain editable: PATCH and /save targetRecordId update the entry without moving it across years", async () => {
    const app = makeApp();
    const priorYear = new Date().getUTCFullYear() - 1;
    const original = makeRecord({
      id: 500,
      entryDate: new Date(Date.UTC(priorYear, 5, 15)),
      name: "old name",
      source: "retrospective",
      activitiesJson: [{ activityId: "recycling", quantity: 10, hoursPerYear: 0 }],
    });
    state.impactRecords.push(original);

    // PATCH should be able to update a past-year record's tags / period
    // without changing the year it's bucketed under.
    await request(app)
      .patch("/api/impact/500")
      .send({ tags: ["edited"] })
      .expect(200);
    expect((state.impactRecords[0].entryDate as Date).getUTCFullYear()).toBe(priorYear);
    expect(state.impactRecords[0].tags).toEqual(["edited"]);

    // /save with targetRecordId should overwrite the SAME row instead
    // of creating a new one in the current year.
    await request(app)
      .post("/api/impact/save")
      .send(baseSavePayload({
        name: "new name",
        targetRecordId: "500",
        entryDate: `${priorYear}-06-15`,
      }))
      .expect(200);
    expect(state.impactRecords).toHaveLength(1);
    expect(state.impactRecords[0].name).toBe("new name");
    expect((state.impactRecords[0].entryDate as Date).getUTCFullYear()).toBe(priorYear);
  });

  it("/year-rollover: shouldShow=false when only current-year entries exist (no prior year to roll over)", async () => {
    const app = makeApp();
    const currentYear = new Date().getUTCFullYear();
    state.impactRecords.push(
      makeRecord({ id: 1, entryDate: new Date(Date.UTC(currentYear, 6, 1)) }),
    );
    const res = await request(app).get("/api/impact/year-rollover").expect(200);
    expect(res.body.shouldShow).toBe(false);
  });

  it("log-occurrence creates ONE actual entry; the same occurrence twice returns 409 unless forced", async () => {
    const app = makeApp();
    const currentYear = new Date().getUTCFullYear();

    state.recurringTemplates.push({
      id: 1,
      userId: USER.id,
      label: "Weekly recycling",
      cadence: "weekly",
      dayOfPeriod: new Date().getUTCDay(), // due today
      anchorDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      defaultActivities: [{ activityId: "recycling", quantity: 52, hoursPerYear: 52 }],
      defaultDonationsGBP: "0",
      lastConfirmedAt: null,
      occurrenceActivities: null,
      occurrenceDonationsGBP: null,
      usualLocationJson: null,
      sharingOrgId: null,
      lastSkippedAt: null,
      createdAt: new Date(),
    });

    // Confirming the due occurrence creates exactly ONE per-occurrence
    // entry (no bulk month creation), dated to the scheduled occurrence.
    const first = await request(app).post("/api/impact/templates/1/log-occurrence").expect(200);
    expect(state.impactRecords).toHaveLength(1);
    const r = state.impactRecords[0];
    expect(r.source).toBe("habit");
    expect(r.kind).toBe("recurring_confirmation");
    expect(r.habitTemplateId).toBe(1);
    expect((r.entryDate as Date).getUTCFullYear()).toBe(currentYear);
    expect(first.body.record.id).toBeDefined();
    // Occurrence-level defaults derived from annual quantities: 52/wk → 1.
    expect((r.activitiesJson as Array<{ quantity: number }>)[0].quantity).toBe(1);
    // Confirming ticks the schedule.
    expect(state.recurringTemplates[0].lastConfirmedAt).not.toBeNull();

    // Once confirmed, the occurrence is no longer due: plain retries are
    // rejected outright — even with a different in-window date override.
    const retry = await request(app).post("/api/impact/templates/1/log-occurrence").expect(400);
    expect(retry.body.error).toBe("occurrence_not_due");
    const otherDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const retryEdited = await request(app)
      .post("/api/impact/templates/1/log-occurrence")
      .send({ occurrenceDate: otherDate })
      .expect(400);
    expect(retryEdited.body.error).toBe("occurrence_not_due");
    expect(state.impactRecords).toHaveLength(1);

    // force=true is the explicit user-confirmed "log anyway" override.
    await request(app)
      .post("/api/impact/templates/1/log-occurrence")
      .send({ force: true })
      .expect(200);
    expect(state.impactRecords).toHaveLength(2);
  });

  it("concurrent requests with different in-window dates create exactly one record", async () => {
    const app = makeApp();
    const now = new Date();

    state.recurringTemplates.push({
      id: 1,
      userId: USER.id,
      label: "Weekly food bank",
      cadence: "weekly",
      dayOfPeriod: now.getUTCDay(), // due today
      anchorDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      defaultActivities: [{ activityId: "foodbank", quantity: 104, hoursPerYear: 104 }],
      defaultDonationsGBP: "0",
      lastConfirmedAt: null,
      occurrenceActivities: null,
      occurrenceDonationsGBP: null,
      usualLocationJson: null,
      sharingOrgId: null,
      lastSkippedAt: null,
      createdAt: now,
    });

    // Two simultaneous non-force confirmations for the same occurrence,
    // using DIFFERENT permitted dates so date-based dedupe alone would not
    // collide. The transactional handled-state re-check must let exactly
    // one through.
    const dateA = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const dateB = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const [resA, resB] = await Promise.all([
      request(app).post("/api/impact/templates/1/log-occurrence").send({ occurrenceDate: dateA }),
      request(app).post("/api/impact/templates/1/log-occurrence").send({ occurrenceDate: dateB }),
    ]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([200, 400]);
    const loser = resA.status === 400 ? resA : resB;
    expect(loser.body.error).toBe("occurrence_not_due");
    expect(state.impactRecords).toHaveLength(1);
    expect(state.recurringTemplates[0].lastConfirmedAt).not.toBeNull();
  });

  it("a pre-existing record for the same occurrence prompts with 409 instead of merging", async () => {
    const app = makeApp();
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    state.recurringTemplates.push({
      id: 1,
      userId: USER.id,
      label: "Weekly recycling",
      cadence: "weekly",
      dayOfPeriod: now.getUTCDay(), // due today, not yet confirmed/skipped
      anchorDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      defaultActivities: [{ activityId: "recycling", quantity: 52, hoursPerYear: 52 }],
      defaultDonationsGBP: "0",
      lastConfirmedAt: null,
      occurrenceActivities: null,
      occurrenceDonationsGBP: null,
      usualLocationJson: null,
      sharingOrgId: null,
      lastSkippedAt: null,
      createdAt: now,
    });
    // A record for the same (user, template, day) already exists — e.g. a
    // legacy habit row — so the prompt must surface it rather than stack.
    state.impactRecords.push({
      id: state.ids.impact++,
      userId: USER.id,
      name: "Weekly recycling",
      habitTemplateId: 1,
      entryDate: today,
      kind: "recurring_confirmation",
      source: "habit",
      totalHours: 1,
      totalValue: "10",
      createdAt: now,
    });

    const dup = await request(app).post("/api/impact/templates/1/log-occurrence").expect(409);
    expect(dup.body.error).toBe("occurrence_already_logged");
    expect(dup.body.existingRecordId).toBeDefined();
    expect(state.impactRecords).toHaveLength(1);

    await request(app)
      .post("/api/impact/templates/1/log-occurrence")
      .send({ force: true })
      .expect(200);
    expect(state.impactRecords).toHaveLength(2);
  });

  it("a template whose first scheduled occurrence is in the future is not due and cannot be logged", async () => {
    const app = makeApp();
    const now = new Date();
    // Weekly template anchored today, scheduled for 3 days from now: the
    // "previous" weekday occurrence predates the template — never due.
    const futureDow = (now.getUTCDay() + 3) % 7;

    state.recurringTemplates.push({
      id: 1,
      userId: USER.id,
      label: "Friday food bank",
      cadence: "weekly",
      dayOfPeriod: futureDow,
      anchorDate: now,
      defaultActivities: [{ activityId: "recycling", quantity: 52, hoursPerYear: 52 }],
      defaultDonationsGBP: "0",
      lastConfirmedAt: null,
      occurrenceActivities: null,
      occurrenceDonationsGBP: null,
      usualLocationJson: null,
      sharingOrgId: null,
      lastSkippedAt: null,
      createdAt: now,
    });

    const list = await request(app).get("/api/impact/templates").expect(200);
    const tpl = list.body.templates[0];
    expect(tpl.isDue).toBe(false);
    expect(tpl.dueOccurrenceDate).toBeNull();

    // Server enforces the same invariant: no due occurrence → no logging,
    // even with an explicit past date.
    const rejected = await request(app).post("/api/impact/templates/1/log-occurrence").expect(400);
    expect(rejected.body.error).toBe("occurrence_not_due");
    const backdated = await request(app)
      .post("/api/impact/templates/1/log-occurrence")
      .send({ occurrenceDate: "2020-01-01" })
      .expect(400);
    expect(backdated.body.error).toBe("occurrence_not_due");
    expect(state.impactRecords).toHaveLength(0);
  });

  it("log-occurrence rejects edit dates outside the current occurrence window", async () => {
    const app = makeApp();
    const now = new Date();

    state.recurringTemplates.push({
      id: 1,
      userId: USER.id,
      label: "Weekly recycling",
      cadence: "weekly",
      dayOfPeriod: now.getUTCDay(), // due today
      anchorDate: new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000),
      defaultActivities: [{ activityId: "recycling", quantity: 52, hoursPerYear: 52 }],
      defaultDonationsGBP: "0",
      lastConfirmedAt: null,
      occurrenceActivities: null,
      occurrenceDonationsGBP: null,
      usualLocationJson: null,
      sharingOrgId: null,
      lastSkippedAt: null,
      createdAt: now,
    });

    // Future dates and dates far before the occurrence are both rejected.
    const future = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const futureRes = await request(app)
      .post("/api/impact/templates/1/log-occurrence")
      .send({ occurrenceDate: future })
      .expect(400);
    expect(futureRes.body.error).toBe("occurrence_date_out_of_range");

    const tooOld = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const oldRes = await request(app)
      .post("/api/impact/templates/1/log-occurrence")
      .send({ occurrenceDate: tooOld })
      .expect(400);
    expect(oldRes.body.error).toBe("occurrence_date_out_of_range");
    expect(state.impactRecords).toHaveLength(0);

    // A date within the current occurrence window (a few days early) is fine.
    const withinWindow = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await request(app)
      .post("/api/impact/templates/1/log-occurrence")
      .send({ occurrenceDate: withinWindow })
      .expect(200);
    expect(state.impactRecords).toHaveLength(1);
  });

  it("skip silences the due prompt without creating any records; current-year bulk confirm is retired", async () => {
    const app = makeApp();

    state.recurringTemplates.push({
      id: 1,
      userId: USER.id,
      label: "Weekly recycling",
      cadence: "weekly",
      dayOfPeriod: new Date().getUTCDay(), // due today
      anchorDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      defaultActivities: [{ activityId: "recycling", quantity: 52, hoursPerYear: 0 }],
      defaultDonationsGBP: "0",
      lastConfirmedAt: null,
      occurrenceActivities: null,
      occurrenceDonationsGBP: null,
      usualLocationJson: null,
      sharingOrgId: null,
      lastSkippedAt: null,
      createdAt: new Date(),
    });

    const res = await request(app).post("/api/impact/templates/1/skip").expect(200);
    expect(res.body.template.isDue).toBe(false);
    expect(state.impactRecords).toHaveLength(0);
    expect(state.recurringTemplates[0].lastSkippedAt).not.toBeNull();
    expect(state.recurringTemplates[0].lastConfirmedAt).toBeNull();

    // A skipped occurrence cannot be logged afterwards through the
    // reminder path — skip means "nothing happened this period".
    const afterSkip = await request(app).post("/api/impact/templates/1/log-occurrence").expect(400);
    expect(afterSkip.body.error).toBe("occurrence_not_due");
    expect(state.impactRecords).toHaveLength(0);

    // Bulk month-creation from annual defaults is retired for the current
    // year — /confirm only remains as the past-year retrospective backfill.
    const confirm = await request(app).post("/api/impact/templates/1/confirm").expect(400);
    expect(confirm.body.error).toBe("bulk_confirm_retired");
    expect(state.impactRecords).toHaveLength(0);
  });

  it("confirming a habit with a past target year creates 12 retrospective entries in that year", async () => {
    const app = makeApp();
    const currentYear = new Date().getUTCFullYear();
    const priorYear = currentYear - 1;

    state.recurringTemplates.push({
      id: 1,
      userId: USER.id,
      label: "Weekly recycling",
      cadence: "weekly",
      dayOfPeriod: new Date().getUTCDay(), // due today
      anchorDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      defaultActivities: [{ activityId: "recycling", quantity: 52, hoursPerYear: 0 }],
      defaultDonationsGBP: "0",
      lastConfirmedAt: null,
      createdAt: new Date(),
    });

    const res = await request(app)
      .post("/api/impact/templates/1/confirm")
      .send({ year: priorYear })
      .expect(200);
    expect(res.body.entriesCreated).toBe(12);
    expect(state.impactRecords).toHaveLength(12);
    for (const r of state.impactRecords) {
      expect(r.source).toBe("retrospective");
      expect(r.habitTemplateId).toBe(1);
      const d = r.entryDate as Date;
      expect(d.getUTCFullYear()).toBe(priorYear);
      expect(d.getUTCDate()).toBe(1);
    }
    // Backfilling a past year must NOT tick off the current occurrence.
    expect(state.recurringTemplates[0].lastConfirmedAt).toBeNull();

    // Re-confirming the same past year inserts nothing new (dedupe per month).
    const second = await request(app)
      .post("/api/impact/templates/1/confirm")
      .send({ year: priorYear })
      .expect(200);
    expect(second.body.entriesCreated).toBe(0);
    expect(state.impactRecords).toHaveLength(12);

    // Future years are rejected outright.
    await request(app)
      .post("/api/impact/templates/1/confirm")
      .send({ year: currentYear + 1 })
      .expect(400);
  });

  it("/save returns 409 when a habit-generated entry already covers the same month with overlapping activities", async () => {
    const app = makeApp();
    const currentYear = new Date().getUTCFullYear();
    const month = new Date().getUTCMonth();

    state.impactRecords.push(
      makeRecord({
        id: 99,
        entryDate: new Date(Date.UTC(currentYear, month, 1)),
        source: "habit",
        habitTemplateId: 7,
        activitiesJson: [{ activityId: "recycling", quantity: 52, hoursPerYear: 0 }],
      }),
    );

    const conflict = await request(app)
      .post("/api/impact/save")
      .send(baseSavePayload({ entryDate: new Date(Date.UTC(currentYear, month, 15)).toISOString().slice(0, 10) }))
      .expect(409);
    expect(conflict.body.error).toBe("habit_entry_conflict");
    expect(conflict.body.existingRecordId).toBe("99");

    // force=true bypasses the conflict and creates an additional entry.
    await request(app)
      .post("/api/impact/save")
      .send(baseSavePayload({
        entryDate: new Date(Date.UTC(currentYear, month, 15)).toISOString().slice(0, 10),
        force: true,
      }))
      .expect(200);
    expect(state.impactRecords).toHaveLength(2);
  });
});

function makeRecord(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: state.ids.impact++,
    userId: USER.id,
    name: "test",
    periodLabel: null,
    totalValue: "0",
    impactValue: "0",
    contributionValue: "0",
    donationsValue: "0",
    personalDevelopmentValue: "0",
    totalHours: 0,
    activitiesJson: [],
    resultJson: { totalValue: 0, totalHours: 0, activityBreakdowns: [] },
    region: null,
    outwardCode: null,
    lat: null,
    lng: null,
    source: "user",
    tags: [],
    entryDate: new Date(),
    habitTemplateId: null,
    createdAt: new Date(),
    ...overrides,
  };
}
