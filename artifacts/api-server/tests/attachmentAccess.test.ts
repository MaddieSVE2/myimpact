import { describe, it, expect, beforeEach, vi } from "vitest";

// Who may view a photo or receipt (routes/attachments.ts loadViewableAttachment).
const state = vi.hoisted(() => ({
  // Results of successive db.select() chains, in order.
  selects: [] as unknown[][],
  contexts: new Map<string, { mode: string; revoked: boolean; shares: boolean }>(),
}));

vi.mock("@workspace/db", () => {
  const tag = (name: string) => new Proxy({ __table: name }, { get: (t, k) => (k in t ? (t as Record<string | symbol, unknown>)[k] : `${name}.${String(k)}`) });
  const chain = () => {
    const rows = state.selects.shift() ?? [];
    const b: Record<string, unknown> = {};
    for (const k of ["from", "where", "orderBy"]) b[k] = () => b;
    b.limit = async () => rows;
    b.then = (resolve: (v: unknown) => unknown) => Promise.resolve(rows).then(resolve);
    return b;
  };
  return {
    db: { select: () => chain() },
    attachmentsTable: tag("attachments"),
    impactRecordsTable: tag("impact_records"),
    journalEntriesTable: tag("journal_entries"),
    orgMembersTable: tag("org_members"),
    attachmentPendingReservationsTable: tag("attachment_pending_reservations"),
  };
});
vi.mock("drizzle-orm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("drizzle-orm")>()),
  eq: (a: unknown, b: unknown) => ({ eq: [a, b] }),
  and: (...c: unknown[]) => ({ and: c }),
}));
vi.mock("../src/middleware/authenticate.js", () => ({ authenticate: vi.fn() }));
vi.mock("../src/lib/rateLimiter.js", () => ({ createRateLimiter: () => vi.fn() }));
vi.mock("../src/lib/objectStorage.js", () => ({}));
vi.mock("../src/lib/orgSharing.js", () => ({
  getOrgSharingContext: vi.fn(async (orgId: string) => {
    const c = state.contexts.get(orgId)!;
    return { orgId, mode: c.mode, revoked: c.revoked, shares: c.shares };
  }),
  sharedRecordsCondition: vi.fn((ctx: { shares: boolean }) => (ctx.shares ? { shared: true } : undefined)),
}));

const { loadViewableAttachment } = await import("../src/routes/attachments.js");

const photo = { id: 7, userId: "member-1", recordId: 42, storageKey: "k" };

beforeEach(() => {
  state.selects = [];
  state.contexts = new Map([
    ["uni", { mode: "consented_logging", revoked: false, shares: true }],
    ["club", { mode: "explicit_submission", revoked: false, shares: true }],
  ]);
});

describe("loadViewableAttachment", () => {
  it("lets the owner see their own photo", async () => {
    state.selects = [[photo]];
    expect(await loadViewableAttachment("member-1", 7)).toBe(photo);
  });

  it("lets a manager see a photo on a record submitted to their organisation", async () => {
    state.selects = [[photo], [{ submittedToOrgId: "club" }], [{ orgId: "club" }]];
    expect(await loadViewableAttachment("manager-1", 7)).toBe(photo);
  });

  it("lets a manager see a photo on a record shared automatically with their organisation", async () => {
    state.selects = [[photo], [{ submittedToOrgId: null }], [{ orgId: "uni" }], [{ id: 42 }]];
    expect(await loadViewableAttachment("manager-1", 7)).toBe(photo);
  });

  it("refuses when the record isn't among those the organisation is shared", async () => {
    state.selects = [[photo], [{ submittedToOrgId: null }], [{ orgId: "uni" }], []];
    expect(await loadViewableAttachment("manager-1", 7)).toBeNull();
  });

  it("refuses managers of organisations that don't receive shared activity, or are revoked", async () => {
    state.selects = [[photo], [{ submittedToOrgId: null }], [{ orgId: "club" }]];
    expect(await loadViewableAttachment("manager-1", 7)).toBeNull();
    state.contexts.set("uni", { mode: "consented_logging", revoked: true, shares: true });
    state.selects = [[photo], [{ submittedToOrgId: null }], [{ orgId: "uni" }]];
    expect(await loadViewableAttachment("manager-1", 7)).toBeNull();
  });

  it("refuses someone who manages no organisation", async () => {
    state.selects = [[photo], [{ submittedToOrgId: null }], []];
    expect(await loadViewableAttachment("stranger", 7)).toBeNull();
  });
});
