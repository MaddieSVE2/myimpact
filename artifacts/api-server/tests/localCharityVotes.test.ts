import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db, localCharityVotesTable, type StoredCharityPlace } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  attachVotes,
  charityVoteKey,
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
