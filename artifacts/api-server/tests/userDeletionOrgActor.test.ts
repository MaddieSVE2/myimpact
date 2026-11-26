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
  orgMigratedActivitiesTable,
} from "@workspace/db";
import { eq, like } from "drizzle-orm";
import { randomUUID } from "crypto";
import { eraseUserData } from "../src/lib/userDeletion.js";

// Uses the real database with throwaway rows, because the thing under test is
// a Postgres foreign key: org_invites.invited_by_user_id and
// org_migrations.imported_by both point at users(id). Before migration 0063 a
// row left in either one stopped the users row being deleted. Now the
// organisation keeps the row and the database blanks who the person was.
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

  it("deletes a manager who has an invitation still on the list, and keeps the invitation", async () => {
    const userId = await makeUser("inviter");
    await db.insert(orgMembersTable).values({ orgId, userId, role: "manager", status: "active" });
    const inviteId = randomUUID();
    await db.insert(orgInvitesTable).values({
      id: inviteId,
      orgId,
      email: `${TAG}invitee@example.test`,
      invitedByUserId: userId,
    });

    expect(await tryErase(userId)).toBe("deleted");
    expect(await userExists(userId)).toBe(false);

    // Still on the organisation's pending list, with the sender blanked.
    const invites = await db.select().from(orgInvitesTable).where(eq(orgInvitesTable.id, inviteId));
    expect(invites).toHaveLength(1);
    expect(invites[0].email).toBe(`${TAG}invitee@example.test`);
    expect(invites[0].invitedByUserId).toBeNull();
  });

  it("deletes someone who has run an organisation import, and keeps the imported history", async () => {
    const userId = await makeUser("importer");
    const migrationId = randomUUID();
    await db.insert(orgMigrationsTable).values({
      id: migrationId,
      orgId,
      sourceOrgId: `${TAG}source`,
      sourceOrgName: "Previous Org",
      sourceDataSharingMode: "explicit_submission",
      exportedAt: new Date(),
      importedBy: userId,
      activitiesImported: 1,
    });
    await db.insert(orgMigratedActivitiesTable).values({
      id: randomUUID(),
      orgId,
      migrationId,
      sourceRecordId: "1",
      entryDate: new Date(),
      name: "Imported activity",
      totalValue: "25.00",
      totalHours: 2,
      source: "user",
    });

    expect(await tryErase(userId)).toBe("deleted");
    expect(await userExists(userId)).toBe(false);

    // The import record stays, with the importer blanked, and so does the
    // history that hangs off it.
    const migrations = await db.select().from(orgMigrationsTable).where(eq(orgMigrationsTable.id, migrationId));
    expect(migrations).toHaveLength(1);
    expect(migrations[0].sourceOrgName).toBe("Previous Org");
    expect(migrations[0].importedBy).toBeNull();
    const activities = await db
      .select()
      .from(orgMigratedActivitiesTable)
      .where(eq(orgMigratedActivitiesTable.migrationId, migrationId));
    expect(activities).toHaveLength(1);
  });
});
