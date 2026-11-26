import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

// No real object storage in tests.
vi.mock("../src/lib/objectStorage.js", () => ({
  deleteAttachment: vi.fn(async () => {}),
}));

// eraseUserData clears the email log after page_views and magic_tokens and
// just before the users row: the gap a late write used to fall into. The
// tests use that call as the moment to make their late write.
const gap = vi.hoisted(() => ({ beforeUserRowDelete: null as null | (() => Promise<void>) }));
vi.mock("../src/lib/emailLog.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/lib/emailLog.js")>();
  return {
    ...real,
    deleteEmailLogFor: async (...args: Parameters<typeof real.deleteEmailLogFor>) => {
      await gap.beforeUserRowDelete?.();
      return real.deleteEmailLogFor(...args);
    },
  };
});

import { db, usersTable, pageViewsTable, magicTokensTable } from "@workspace/db";
import { eq, like } from "drizzle-orm";
import { eraseUserData } from "../src/lib/userDeletion.js";

// Uses the real database with throwaway rows, because the thing under test is
// Postgres's own behaviour: a write that points at a user waits while that
// user's row is locked for deletion, and is refused once the user is gone.
const TAG = `__test_erase_race_${Date.now()}__`;

async function cleanup() {
  const users = await db.select({ id: usersTable.id }).from(usersTable).where(like(usersTable.id, `${TAG}%`));
  for (const { id } of users) {
    await db.delete(pageViewsTable).where(eq(pageViewsTable.userId, id));
    await db.delete(magicTokensTable).where(eq(magicTokensTable.userId, id));
    await db.delete(usersTable).where(eq(usersTable.id, id));
  }
}

beforeAll(cleanup);
afterAll(async () => {
  gap.beforeUserRowDelete = null;
  await cleanup();
});

/** Postgres error code, whether or not drizzle has wrapped the error. */
function pgCode(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code ?? e?.cause?.code;
}

const lateWrites = [
  {
    what: "a page view",
    write: (userId: string) => db.insert(pageViewsTable).values({ userId, page: "/dashboard" }),
  },
  {
    what: "a sign-in link",
    write: (userId: string) =>
      db.insert(magicTokensTable).values({
        token: `${userId}-late`,
        userId,
        expiresAt: new Date(Date.now() + 60_000),
      }),
  },
];

describe("eraseUserData against a real database", () => {
  it.each(lateWrites)("still deletes the account when $what arrives part-way through", async ({ write }) => {
    const userId = `${TAG}${Math.random().toString(36).slice(2, 10)}`;
    await db.insert(usersTable).values({ id: userId, email: `${userId}@example.test` });
    await db.insert(pageViewsTable).values({ userId, page: "/earlier" });

    let late: Promise<{ ok: true } | { ok: false; code?: string }> | undefined;
    gap.beforeUserRowDelete = async () => {
      // Another request, on another connection. Not awaited: with the fix it
      // cannot finish until the deletion does.
      late = write(userId).then(
        () => ({ ok: true as const }),
        (err: unknown) => ({ ok: false as const, code: pgCode(err) }),
      );
      // Long enough for that write to land if nothing is holding it back.
      await new Promise((resolve) => setTimeout(resolve, 300));
    };

    await expect(eraseUserData(userId)).resolves.toEqual({ attachmentsRemoved: 0 });

    // The late write was held until the account had gone, then refused.
    expect(late).toBeDefined();
    expect(await late).toEqual({ ok: false, code: "23503" });

    expect(await db.select().from(usersTable).where(eq(usersTable.id, userId))).toEqual([]);
    expect(await db.select().from(pageViewsTable).where(eq(pageViewsTable.userId, userId))).toEqual([]);
    expect(await db.select().from(magicTokensTable).where(eq(magicTokensTable.userId, userId))).toEqual([]);
  });
});
