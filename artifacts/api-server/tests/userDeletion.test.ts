import { describe, it, expect, beforeEach, vi } from "vitest";
import { getTableName, type SQL, type Table } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

/**
 * Account deletion against a stand-in database that follows the two Postgres
 * rules the fault of 26 November 2026 turned on:
 *
 *  1. Deleting a users row fails with 23503 while a row in a table with a
 *     plain foreign key to users (page_views and others) still points at it.
 *  2. Inserting such a row takes a FOR KEY SHARE lock on the users row, so it
 *     waits while another transaction holds that row FOR UPDATE, and is
 *     refused with 23503 if the user is gone when the wait ends.
 *
 * The stand-in runs anywhere. userDeletionRace.test.ts checks the same thing
 * against a real Postgres.
 */

const EMAIL = "leaver@example.test";
const USER_ID = "user-being-deleted";

// Tables whose user_id is a plain REFERENCES users(id): no cascade, no set null.
const BLOCKS_USER_DELETE = [
  "magic_tokens",
  "user_profiles",
  "page_views",
  "feedback",
  "challenge_participants",
  "org_members",
  "org_member_consents",
];

function fkError(message: string): Error {
  return Object.assign(new Error(message), { code: "23503" });
}

const pg = vi.hoisted(() => ({
  userExists: true,
  userRowLocked: false,
  rows: {} as Record<string, number>,
  /** Inserts waiting for the user-row lock to be released. */
  waiting: [] as (() => void)[],
  /** Every statement, in order: "tx:" inside the transaction, "db:" outside. */
  statements: [] as string[],
  /** Runs straight after a table is cleared: the moment a late write lands. */
  afterDelete: null as null | ((table: string) => void),
  emailLogExecutor: null as unknown,
  emailLogAddress: null as string | null,
}));

function executor(scope: "db" | "tx") {
  const note = (statement: string) => pg.statements.push(`${scope}:${statement}`);
  return {
    select: () => ({
      from: (table: Table) => ({
        where: () => {
          const read = async () => (pg.userExists ? [{ email: EMAIL }] : []);
          return {
            then: (...args: Parameters<Promise<unknown[]>["then"]>) => {
              note(`select ${getTableName(table)}`);
              return read().then(...args);
            },
            for: async (strength: string) => {
              note(`select ${getTableName(table)} for ${strength}`);
              // A lock only outlives its statement inside a transaction.
              if (scope === "tx" && strength === "update") pg.userRowLocked = true;
              return read();
            },
          };
        },
      }),
    }),
    delete: (table: Table) => ({
      where: async () => {
        const name = getTableName(table);
        note(`delete ${name}`);
        if (name === "users") {
          const blocker = BLOCKS_USER_DELETE.find((t) => (pg.rows[t] ?? 0) > 0);
          if (blocker) {
            throw fkError(
              `update or delete on table "users" violates foreign key constraint "${blocker}_user_id_users_id_fk" on table "${blocker}"`,
            );
          }
          pg.userExists = false;
        } else {
          pg.rows[name] = 0;
        }
        pg.afterDelete?.(name);
      },
    }),
    execute: async (query: SQL) => {
      const text = new PgDialect().sqlToQuery(query).sql;
      const name = /DELETE FROM (\w+)/.exec(text)?.[1] ?? text;
      note(`delete ${name}`);
      pg.rows[name] = 0;
    },
    insert: (table: Table) => ({
      values: async () => {
        const name = getTableName(table);
        if (pg.userRowLocked) await new Promise<void>((resolve) => pg.waiting.push(resolve));
        if (!pg.userExists) {
          throw fkError(
            `insert or update on table "${name}" violates foreign key constraint "${name}_user_id_users_id_fk"`,
          );
        }
        pg.rows[name] = (pg.rows[name] ?? 0) + 1;
      },
    }),
    // Only the version of eraseUserData before the fix read the user this way.
    query: {
      usersTable: {
        findFirst: async () => (pg.userExists ? { id: USER_ID, email: EMAIL } : undefined),
      },
    },
  };
}

function releaseUserRowLock() {
  pg.userRowLocked = false;
  for (const wake of pg.waiting.splice(0)) wake();
}

vi.mock("@workspace/db", async (importOriginal) => {
  const real = await importOriginal<typeof import("@workspace/db")>();
  return {
    ...real,
    db: {
      ...executor("db"),
      transaction: async (work: (tx: unknown) => Promise<unknown>) => {
        const before = { userExists: pg.userExists, rows: { ...pg.rows } };
        try {
          return await work(executor("tx"));
        } catch (err) {
          pg.userExists = before.userExists;
          pg.rows = before.rows;
          throw err;
        } finally {
          releaseUserRowLock();
        }
      },
    },
  };
});

vi.mock("../src/lib/attachmentCleanup.js", () => ({
  deleteAllAttachmentsForUser: async () => {
    pg.statements.push("db:delete attachments");
    return 2;
  },
}));

vi.mock("../src/lib/emailLog.js", () => ({
  deleteEmailLogFor: async (email: string, exec: unknown) => {
    pg.emailLogAddress = email;
    pg.emailLogExecutor = exec;
    pg.statements.push("email log");
  },
}));

import { db, pageViewsTable, magicTokensTable } from "@workspace/db";
import { eraseUserData } from "../src/lib/userDeletion.js";

beforeEach(() => {
  pg.userExists = true;
  pg.userRowLocked = false;
  pg.rows = { page_views: 3, magic_tokens: 1, user_profiles: 1, impact_records: 4 };
  pg.waiting = [];
  pg.statements = [];
  pg.afterDelete = null;
  pg.emailLogExecutor = null;
  pg.emailLogAddress = null;
});

/** Starts `write` as another request would, the moment `table` has been cleared. */
function lateWriteAfterClearing(table: string, write: () => Promise<unknown>) {
  const late: { outcome?: Promise<{ ok: true } | { ok: false; code?: string }> } = {};
  pg.afterDelete = (cleared) => {
    if (cleared !== table || late.outcome) return;
    late.outcome = write().then(
      () => ({ ok: true as const }),
      (err: { code?: string }) => ({ ok: false as const, code: err.code }),
    );
  };
  return late;
}

describe("eraseUserData", () => {
  it("still deletes the account when a page view arrives part-way through", async () => {
    const late = lateWriteAfterClearing("page_views", () =>
      db.insert(pageViewsTable).values({ userId: USER_ID, page: "/dashboard" }),
    );

    await expect(eraseUserData(USER_ID)).resolves.toEqual({ attachmentsRemoved: 2 });

    expect(pg.userExists).toBe(false);
    expect(pg.rows.page_views).toBe(0);
    // The late page view waited for the deletion and was then turned away.
    expect(await late.outcome).toEqual({ ok: false, code: "23503" });
  });

  it("does the same for any other late write that points at the person", async () => {
    const late = lateWriteAfterClearing("magic_tokens", () =>
      db.insert(magicTokensTable).values({ token: "t", userId: USER_ID, expiresAt: new Date() }),
    );

    await expect(eraseUserData(USER_ID)).resolves.toEqual({ attachmentsRemoved: 2 });

    expect(pg.userExists).toBe(false);
    expect(pg.rows.magic_tokens).toBe(0);
    expect(await late.outcome).toEqual({ ok: false, code: "23503" });
  });

  it("locks the person's row first and does every delete inside that transaction", async () => {
    await eraseUserData(USER_ID);

    // Attachments (and their stored files) go first, before the lock is held.
    expect(pg.statements[0]).toBe("db:delete attachments");
    expect(pg.statements[1]).toBe("tx:select users for update");
    expect(pg.statements.at(-1)).toBe("tx:delete users");
    expect(pg.statements.slice(1).filter((s) => s.startsWith("db:"))).toEqual([]);

    // The email log is cleared as part of the same transaction.
    expect(pg.emailLogAddress).toBe(EMAIL);
    expect(pg.emailLogExecutor).not.toBe(db);
    expect(pg.emailLogExecutor).toHaveProperty("delete");
  });

  it("removes everything it removed before", async () => {
    await eraseUserData(USER_ID);

    const cleared = pg.statements
      .filter((s) => s.includes("delete "))
      .map((s) => s.split("delete ")[1])
      .sort();
    expect(cleared).toEqual(
      [
        "attachments",
        "push_subscriptions",
        "push_preferences",
        "calendar_sources",
        "challenge_participants",
        "attachment_pending_reservations",
        "voice_usage",
        "text_ai_usage",
        "org_survey_responses",
        "org_survey_opt_outs",
        "analytics_events",
        "magic_tokens",
        "user_profiles",
        "page_views",
        "feedback",
        "onboarding_email_sends",
        "org_members",
        "org_member_consents",
        "public_profiles",
        "journal_entries",
        "impact_records",
        "recurring_templates",
        "users",
      ].sort(),
    );
    expect(pg.statements).toContain("email log");
  });

  it("changes nothing if a step fails", async () => {
    pg.afterDelete = (table) => {
      if (table === "impact_records") throw new Error("connection lost");
    };

    await expect(eraseUserData(USER_ID)).rejects.toThrow("connection lost");

    expect(pg.userExists).toBe(true);
    expect(pg.rows.page_views).toBe(3);
    expect(pg.userRowLocked).toBe(false);
  });
});
