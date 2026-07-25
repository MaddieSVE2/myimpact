/**
 * Community thumbs-up votes on pre-mapped local charity suggestions.
 *
 * Votes are shared across all users per local authority and keyed by a
 * stable charity identifier so they survive the ~monthly regeneration of an
 * area's suggestions: the charity registration number when the charity is
 * verified, falling back to the normalised charity name.
 */

import { db, localCharityVotesTable, type StoredCharityPlace } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";

/**
 * Stable identity for a charity across regenerations. Registration number is
 * preferred (it never changes); the normalised name is the fallback for
 * unverified suggestions.
 */
export function charityVoteKey(place: { registrationNumber?: string | null; name: string }): string {
  const reg = place.registrationNumber?.trim();
  if (reg) return `reg:${reg}`;
  return `name:${place.name.trim().toLowerCase().replace(/\s+/g, " ")}`;
}

/** Aggregate counts plus the requesting user's own votes for one area. */
export async function getVoteState(
  localAuthority: string,
  userId: string,
): Promise<{ counts: Map<string, number>; mine: Set<string> }> {
  const rows = await db
    .select({
      charityKey: localCharityVotesTable.charityKey,
      count: sql<number>`count(*)::int`,
      mine: sql<boolean>`bool_or(${localCharityVotesTable.userId} = ${userId})`,
    })
    .from(localCharityVotesTable)
    .where(eq(localCharityVotesTable.localAuthority, localAuthority))
    .groupBy(localCharityVotesTable.charityKey);

  const counts = new Map<string, number>();
  const mine = new Set<string>();
  for (const row of rows) {
    counts.set(row.charityKey, row.count);
    if (row.mine) mine.add(row.charityKey);
  }
  return { counts, mine };
}

/**
 * Toggle one user's vote for a charity. Returns the new state. The primary
 * key (authority, key, user) enforces one vote per user per charity.
 */
export async function toggleVote(
  localAuthority: string,
  charityKey: string,
  userId: string,
): Promise<{ voted: boolean; votes: number }> {
  const deleted = await db
    .delete(localCharityVotesTable)
    .where(
      and(
        eq(localCharityVotesTable.localAuthority, localAuthority),
        eq(localCharityVotesTable.charityKey, charityKey),
        eq(localCharityVotesTable.userId, userId),
      ),
    )
    .returning({ userId: localCharityVotesTable.userId });

  let voted: boolean;
  if (deleted.length > 0) {
    voted = false;
  } else {
    await db
      .insert(localCharityVotesTable)
      .values({ localAuthority, charityKey, userId })
      .onConflictDoNothing();
    voted = true;
  }

  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(localCharityVotesTable)
    .where(
      and(
        eq(localCharityVotesTable.localAuthority, localAuthority),
        eq(localCharityVotesTable.charityKey, charityKey),
      ),
    );

  return { voted, votes: row?.count ?? 0 };
}

export type VotedPlace = StoredCharityPlace & { votes: number; voted: boolean; popular: boolean };

/**
 * Minimum shared votes before the top charity in a category earns the
 * "Popular with the community" badge.
 */
export const POPULAR_VOTE_THRESHOLD = 3;

/**
 * Attach vote counts + the user's own votes to stored places, and sort each
 * category's places by votes (descending), preserving the stored order as a
 * stable tie-break. The single most-voted charity in each category is marked
 * `popular` when it has at least POPULAR_VOTE_THRESHOLD votes and strictly
 * more votes than any other charity in the category (ties earn no badge).
 */
export function attachVotes(
  categories: Array<{ category: string; places: StoredCharityPlace[] }>,
  counts: Map<string, number>,
  mine: Set<string>,
): Array<{ category: string; places: VotedPlace[] }> {
  return categories.map(({ category, places }) => {
    const withVotes = places.map((place) => {
      const key = charityVoteKey(place);
      return { ...place, votes: counts.get(key) ?? 0, voted: mine.has(key) };
    });
    const sorted = withVotes
      .map((p, i) => ({ p, i }))
      .sort((a, b) => b.p.votes - a.p.votes || a.i - b.i)
      .map(({ p }) => p);
    const top = sorted[0];
    const runnerUp = sorted[1];
    const topIsPopular =
      !!top &&
      top.votes >= POPULAR_VOTE_THRESHOLD &&
      (!runnerUp || runnerUp.votes < top.votes);
    return {
      category,
      places: sorted.map((p, i) => ({ ...p, popular: topIsPopular && i === 0 })),
    };
  });
}
