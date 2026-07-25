import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  db,
  localCharitySuggestionsTable,
  localCharityVotesTable,
  type StoredCharityPlace,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  attachVotes,
  charityVoteKey,
  cleanupOrphanedVotes,
  getVoteState,
  toggleVote,
} from "../src/lib/localCharityVotes.js";

// Uses the real dev database with a unique throwaway local authority so the
// vote SQL (toggle, one-vote-per-user PK, aggregation) is exercised for real.
const AREA = `__test_votes_${Date.now()}__`;

function place(name: string, registrationNumber?: string): StoredCharityPlace {
  return {
    name,
    description: "",
    howToJoin: "",
    source: "ai",
    verified: !!registrationNumber,
    registrationNumber,
  };
}

async function cleanup() {
  await db.delete(localCharityVotesTable).where(eq(localCharityVotesTable.localAuthority, AREA));
}

beforeAll(cleanup);
afterAll(cleanup);

describe("charityVoteKey", () => {
  it("prefers the registration number", () => {
    expect(charityVoteKey(place("Some Charity", "123456"))).toBe("reg:123456");
  });

  it("falls back to the normalised name", () => {
    expect(charityVoteKey(place("  Some   Charity "))).toBe("name:some charity");
    // Same charity re-suggested with different whitespace/case keeps its key,
    // which is what lets votes survive the 30-day regeneration.
    expect(charityVoteKey(place("SOME CHARITY"))).toBe("name:some charity");
  });
});

describe("toggleVote", () => {
  const key = "reg:tv-100";

  it("adds a vote, then removes it on the second toggle", async () => {
    const first = await toggleVote(AREA, key, "user-a");
    expect(first).toEqual({ voted: true, votes: 1 });

    const second = await toggleVote(AREA, key, "user-a");
    expect(second).toEqual({ voted: false, votes: 0 });
  });

  it("enforces one vote per user and aggregates across users", async () => {
    await toggleVote(AREA, key, "user-a");
    // Direct duplicate insert is swallowed by the primary key
    await db
      .insert(localCharityVotesTable)
      .values({ localAuthority: AREA, charityKey: key, userId: "user-a" })
      .onConflictDoNothing();

    const other = await toggleVote(AREA, key, "user-b");
    expect(other).toEqual({ voted: true, votes: 2 });

    const stateA = await getVoteState(AREA, "user-a");
    expect(stateA.counts.get(key)).toBe(2);
    expect(stateA.mine.has(key)).toBe(true);

    const stateC = await getVoteState(AREA, "user-c");
    expect(stateC.counts.get(key)).toBe(2);
    expect(stateC.mine.has(key)).toBe(false);
  });
});

describe("attachVotes", () => {
  it("attaches counts + own votes and sorts by votes within each category", () => {
    const categories = [
      {
        category: "Community",
        places: [place("Alpha", "111"), place("Beta"), place("Gamma", "333")],
      },
    ];
    const counts = new Map<string, number>([
      ["reg:333", 5],
      ["name:beta", 2],
    ]);
    const mine = new Set<string>(["name:beta"]);

    const result = attachVotes(categories, counts, mine);
    expect(result[0].places.map((p) => p.name)).toEqual(["Gamma", "Beta", "Alpha"]);
    expect(result[0].places.map((p) => p.votes)).toEqual([5, 2, 0]);
    expect(result[0].places.map((p) => p.voted)).toEqual([false, true, false]);
    expect(result[0].places.map((p) => p.popular)).toEqual([true, false, false]);
  });

  it("does not mark popular below the vote threshold", () => {
    const categories = [
      { category: "Community", places: [place("Alpha", "111"), place("Beta")] },
    ];
    const counts = new Map<string, number>([["reg:111", 2]]);
    const result = attachVotes(categories, counts, new Set());
    expect(result[0].places.map((p) => p.popular)).toEqual([false, false]);
  });

  it("does not mark popular when the top spot is tied", () => {
    const categories = [
      { category: "Community", places: [place("Alpha", "111"), place("Beta", "222")] },
    ];
    const counts = new Map<string, number>([
      ["reg:111", 4],
      ["reg:222", 4],
    ]);
    const result = attachVotes(categories, counts, new Set());
    expect(result[0].places.map((p) => p.popular)).toEqual([false, false]);
  });

  it("keeps stored order as a stable tie-break", () => {
    const categories = [
      { category: "Health", places: [place("One"), place("Two")] },
    ];
    const result = attachVotes(categories, new Map(), new Set());
    expect(result[0].places.map((p) => p.name)).toEqual(["One", "Two"]);
  });
});

describe("cleanupOrphanedVotes", () => {
  // Two throwaway areas: one with stored suggestions, one with votes only.
  const CLEAN_AREA = `__test_cleanup_${Date.now()}__`;
  const NO_SUGGESTIONS_AREA = `__test_cleanup_nosugg_${Date.now()}__`;
  const OLD = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000); // beyond 90d grace

  async function cleanupAreas() {
    for (const area of [CLEAN_AREA, NO_SUGGESTIONS_AREA]) {
      await db.delete(localCharityVotesTable).where(eq(localCharityVotesTable.localAuthority, area));
      await db
        .delete(localCharitySuggestionsTable)
        .where(eq(localCharitySuggestionsTable.localAuthority, area));
    }
  }

  beforeAll(async () => {
    await cleanupAreas();
    await db.insert(localCharitySuggestionsTable).values({
      localAuthority: CLEAN_AREA,
      category: "Community",
      places: [
        // Verified: current key is reg:cl-111, but it may hold older name votes.
        place("Verified Charity", "cl-111"),
        // Unverified: current key is the name key.
        place("Name Only Charity"),
      ],
    });
    await db.insert(localCharityVotesTable).values([
      // Present via reg key, stale lastSeenAt -> must be kept and touched.
      { localAuthority: CLEAN_AREA, charityKey: "reg:cl-111", userId: "u1", lastSeenAt: OLD },
      // Legacy name-key vote for the now-verified charity -> still present, kept.
      { localAuthority: CLEAN_AREA, charityKey: "name:verified charity", userId: "u2", lastSeenAt: OLD },
      // Present via name key -> kept.
      { localAuthority: CLEAN_AREA, charityKey: "name:name only charity", userId: "u1", lastSeenAt: OLD },
      // Absent and past the grace period -> deleted.
      { localAuthority: CLEAN_AREA, charityKey: "reg:cl-gone", userId: "u1", lastSeenAt: OLD },
      // Absent but recently seen -> kept (still within grace).
      { localAuthority: CLEAN_AREA, charityKey: "reg:cl-recent", userId: "u1" },
      // Area with no stored suggestions -> untouched even though stale.
      { localAuthority: NO_SUGGESTIONS_AREA, charityKey: "reg:cl-orphan", userId: "u1", lastSeenAt: OLD },
    ]);
  });

  afterAll(cleanupAreas);

  it("deletes only long-absent votes and refreshes lastSeenAt for present ones", async () => {
    await cleanupOrphanedVotes();

    const rows = await db
      .select()
      .from(localCharityVotesTable)
      .where(eq(localCharityVotesTable.localAuthority, CLEAN_AREA));
    const keys = rows.map((r) => r.charityKey).sort();
    expect(keys).toEqual([
      "name:name only charity",
      "name:verified charity",
      "reg:cl-111",
      "reg:cl-recent",
    ]);

    // Present votes (including the legacy name-key vote for the verified
    // charity) had their lastSeenAt refreshed past the old timestamp.
    for (const key of ["reg:cl-111", "name:verified charity", "name:name only charity"]) {
      const row = rows.find((r) => r.charityKey === key)!;
      expect(row.lastSeenAt.getTime()).toBeGreaterThan(OLD.getTime());
    }

    // Areas without stored suggestions are skipped entirely.
    const untouched = await db
      .select()
      .from(localCharityVotesTable)
      .where(eq(localCharityVotesTable.localAuthority, NO_SUGGESTIONS_AREA));
    expect(untouched.map((r) => r.charityKey)).toEqual(["reg:cl-orphan"]);
    expect(untouched[0].lastSeenAt.getTime()).toBe(OLD.getTime());
  });
});
