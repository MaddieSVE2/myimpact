import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

// No real object storage in tests.
vi.mock("../src/lib/objectStorage.js", () => ({
  deleteAttachment: vi.fn(async () => {}),
}));

import {
  db,
  usersTable,
  organisationsTable,
  orgMembersTable,
  orgInvitesTable,
  orgMigrationsTable,
} from "@workspace/db";
import { eq, like } from "drizzle-orm";
import { randomUUID } from "crypto";
import { eraseUserData } from "../src/lib/userDeletion.js";

// Uses the real database with throwaway rows, because the thing under test is
// a Postgres foreign key: org_invites.invited_by_user_id and
// org_migrations.imported_by both point at users(id), and a row left in
// either one stops the users row being deleted.
const TAG = `__test_erase_org_actor_${Date.now()}__`;
const orgId = `${TAG}org`;

async function cleanup() {
  await db.delete(orgInvitesTable).where(like(orgInvitesTable.orgId, `${TAG}%`));
  await db.delete(orgMigrationsTable).where(like(orgMigrationsTable.orgId, `${TAG}%`));
  await db.delete(orgMembersTable).where(like(orgMembersTable.orgId, `${TAG}%`));
  await db.delete(organisationsTable).where(like(organisationsTable.id, `${TAG}%`));
  await db.delete(usersTable).where(like(usersTable.id, `${TAG}%`));
}

beforeAll(async () => {
  await cleanup();
  await db.insert(organisationsTable).values({
    id: orgId,
    name: "Erase Test Org",
    type: "charity",
    inviteCode: `EOA${Date.now() % 1000000}`,
  });
});

afterAll(cleanup);

async function makeUser(label: string): Promise<string> {
  const id = `${TAG}${label}`;
  await db.insert(usersTable).values({ id, email: `${id}@example.test` });
  return id;
}

/**
 * "deleted", or what stopped it: the Postgres error code and the constraint
 * that refused, whether or not drizzle has wrapped the error.
 */
async function tryErase(userId: string): Promise<string> {
  try {
    await eraseUserData(userId);
    return "deleted";
  } catch (err) {
    const e = err as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } };
    const code = e?.code ?? e?.cause?.code ?? "unknown";
    const constraint = e?.constraint ?? e?.cause?.constraint ?? "unknown";
    return `refused: ${code} on ${constraint}`;
  }
}

async function userExists(userId: string): Promise<boolean> {
  const rows = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, userId));
  return rows.length > 0;
}

describe("eraseUserData for someone who has acted for an organisation", () => {
  it("deletes a manager who has sent no invitations (the control)", async () => {
    const userId = await makeUser("plain");
    await db.insert(orgMembersTable).values({ orgId, userId, role: "manager", status: "active" });

    expect(await tryErase(userId)).toBe("deleted");
    expect(await userExists(userId)).toBe(false);
  });

  it("deletes a manager who has an invitation still on the list", async () => {
    const userId = await makeUser("inviter");
    await db.insert(orgMembersTable).values({ orgId, userId, role: "manager", status: "active" });
    await db.insert(orgInvitesTable).values({
      id: randomUUID(),
      orgId,
      email: `${TAG}invitee@example.test`,
      invitedByUserId: userId,
    });

    expect(await tryErase(userId)).toBe("deleted");
    expect(await userExists(userId)).toBe(false);
  });

  it("deletes someone who has run an organisation import", async () => {
    const userId = await makeUser("importer");
    await db.insert(orgMigrationsTable).values({
      id: randomUUID(),
      orgId,
      sourceOrgId: `${TAG}source`,
      sourceOrgName: "Previous Org",
      sourceDataSharingMode: "explicit_submission",
      exportedAt: new Date(),
      importedBy: userId,
    });

    expect(await tryErase(userId)).toBe("deleted");
    expect(await userExists(userId)).toBe(false);
  });
});
