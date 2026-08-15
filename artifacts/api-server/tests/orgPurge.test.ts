import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

// Capture storage-object deletions instead of hitting real object storage.
const deletedStorageKeys: string[] = [];
vi.mock("../src/lib/objectStorage.js", () => ({
  deleteAttachment: vi.fn(async (key: string) => {
    deletedStorageKeys.push(key);
  }),
}));
import {
  db,
  organisationsTable,
  orgMembersTable,
  orgRegistrationsTable,
  orgMemberConsentsTable,
  orgInvitesTable,
  orgSurveysTable,
  orgSurveyResponsesTable,
  orgAuditLogTable,
  orgPurgeArchivesTable,
  challengesTable,
  challengeParticipantsTable,
  impactRecordsTable,
  attachmentsTable,
  usersTable,
} from "@workspace/db";
import { and, eq, inArray, like } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  findPurgeableOrgs,
  runOrgPurge,
  ORG_DATA_RETENTION_DAYS,
} from "../src/lib/orgPurge.js";

// Uses the real dev database with unique throwaway rows (prefix-tagged) so
// the selection window, FK-safe deletion order and archive write are all
// exercised for real. Everything is cleaned up afterwards.
const TAG = `__test_purge_${Date.now()}__`;

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date();
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);

const oldOrgId = `${TAG}old`;
const freshOrgId = `${TAG}fresh`;
const activeOrgId = `${TAG}active`;
const userId = `${TAG}user`;

let personalRecordId: number;
let twinRecordId: number;

async function cleanup() {
  const orgIds = [oldOrgId, freshOrgId, activeOrgId];
  await db.delete(attachmentsTable).where(eq(attachmentsTable.userId, userId));
  await db.delete(orgRegistrationsTable).where(like(orgRegistrationsTable.orgName, `${TAG}%`));
  await db.delete(impactRecordsTable).where(eq(impactRecordsTable.userId, userId));
  await db.delete(challengeParticipantsTable).where(eq(challengeParticipantsTable.userId, userId));
  await db.delete(challengesTable).where(inArray(challengesTable.orgId, orgIds));
  const surveys = await db.select().from(orgSurveysTable).where(inArray(orgSurveysTable.orgId, orgIds));
  if (surveys.length > 0) {
    await db.delete(orgSurveyResponsesTable).where(inArray(orgSurveyResponsesTable.surveyId, surveys.map((s) => s.id)));
    await db.delete(orgSurveysTable).where(inArray(orgSurveysTable.orgId, orgIds));
  }
  await db.delete(orgAuditLogTable).where(inArray(orgAuditLogTable.orgId, orgIds));
  await db.delete(orgInvitesTable).where(inArray(orgInvitesTable.orgId, orgIds));
  await db.delete(orgMemberConsentsTable).where(inArray(orgMemberConsentsTable.orgId, orgIds));
  await db.delete(orgMembersTable).where(inArray(orgMembersTable.orgId, orgIds));
  await db.delete(organisationsTable).where(inArray(organisationsTable.id, orgIds));
  await db.delete(orgPurgeArchivesTable).where(inArray(orgPurgeArchivesTable.orgId, orgIds));
  await db.delete(usersTable).where(eq(usersTable.id, userId));
}

function baseRecord(overrides: Record<string, unknown>) {
  return {
    userId,
    name: "Test record",
    totalValue: "100.00",
    impactValue: "100.00",
    contributionValue: "0.00",
    donationsValue: "0.00",
    personalDevelopmentValue: "0.00",
    totalHours: 5,
    activitiesJson: [],
    resultJson: {},
    ...overrides,
  };
}

beforeAll(async () => {
  await cleanup();

  await db.insert(usersTable).values({
    id: userId,
    email: `${TAG}@example.test`,
  });

  await db.insert(organisationsTable).values([
    { id: oldOrgId, name: "Old Revoked Org", type: "charity", inviteCode: `PG1${Date.now() % 1000000}`, revokedAt: daysAgo(181), logoKey: `org-logos/${oldOrgId}/logo.png` },
    { id: freshOrgId, name: "Recently Revoked Org", type: "charity", inviteCode: `PG2${Date.now() % 1000000}`, revokedAt: daysAgo(179) },
    { id: activeOrgId, name: "Active Org", type: "charity", inviteCode: `PG3${Date.now() % 1000000}` },
  ]);

  // Approved registration linked to the old org via its invite code (purged),
  // plus an unrelated pending registration (kept).
  const oldOrgInviteCode = (await db.select().from(organisationsTable).where(eq(organisationsTable.id, oldOrgId)))[0].inviteCode;
  await db.insert(orgRegistrationsTable).values([
    { id: randomUUID(), orgName: `${TAG}Old Revoked Org`, type: "charity", contactName: "Old Contact", contactEmail: `${TAG}old@example.test`, status: "approved", inviteCode: oldOrgInviteCode },
    { id: randomUUID(), orgName: `${TAG}Unrelated Org`, type: "charity", contactName: "Other Contact", contactEmail: `${TAG}other@example.test`, status: "pending" },
  ]);

  await db.insert(orgMembersTable).values([
    { orgId: oldOrgId, userId, role: "member", status: "active" },
    { orgId: freshOrgId, userId, role: "member", status: "active" },
  ]);
  await db.insert(orgMemberConsentsTable).values({
    id: randomUUID(), orgId: oldOrgId, userId, shareFrom: daysAgo(400), shareScope: "from_join",
  });
  await db.insert(orgInvitesTable).values({
    id: randomUUID(), orgId: oldOrgId, email: `${TAG}invite@example.test`, invitedByUserId: userId,
  });
  const surveyId = randomUUID();
  await db.insert(orgSurveysTable).values({
    id: surveyId, orgId: oldOrgId, template: "wellbeing", question: "How are you?", schedule: "one_off", createdBy: userId,
  });
  await db.insert(orgSurveyResponsesTable).values({
    id: randomUUID(), surveyId, userId, windowKey: "once", rating: 4,
  });
  await db.insert(orgAuditLogTable).values({
    orgId: oldOrgId, actorUserId: userId, action: "test", targetType: "org", targetId: oldOrgId,
  });
  const challengeId = randomUUID();
  await db.insert(challengesTable).values({
    id: challengeId, name: "Old org challenge", goalType: "hours", target: "10.00",
    startDate: daysAgo(300), endDate: daysAgo(200), orgId: oldOrgId, scope: "org",
    inviteCode: `PGC${Date.now() % 1000000}`,
  });
  await db.insert(challengeParticipantsTable).values({ challengeId, userId });

  // Twin pair: personal source record (kept) + org twin submission (purged).
  const [personal] = await db.insert(impactRecordsTable)
    .values(baseRecord({ source: "user" }))
    .returning({ id: impactRecordsTable.id });
  const [twin] = await db.insert(impactRecordsTable)
    .values(baseRecord({ source: "member-submitted", submittedToOrgId: oldOrgId, submittedToOrgAt: daysAgo(200) }))
    .returning({ id: impactRecordsTable.id });
  personalRecordId = personal.id;
  twinRecordId = twin.id;

  // Evidence attachments: one on the org twin (purged), one on the member's
  // personal record (kept).
  await db.insert(attachmentsTable).values([
    { userId, recordId: twinRecordId, kind: "evidence", storageKey: `${TAG}/twin-evidence.jpg`, mimeType: "image/jpeg", byteSize: 100 },
    { userId, recordId: personalRecordId, kind: "evidence", storageKey: `${TAG}/personal-evidence.jpg`, mimeType: "image/jpeg", byteSize: 100 },
  ]);
});

afterAll(cleanup);

describe("findPurgeableOrgs selection window", () => {
  it("selects the 181-day org but not the 179-day or active orgs", async () => {
    const eligible = await findPurgeableOrgs(NOW);
    const ids = eligible.map((o) => o.id);
    expect(ids).toContain(oldOrgId);
    expect(ids).not.toContain(freshOrgId);
    expect(ids).not.toContain(activeOrgId);
  });
});

describe("runOrgPurge", () => {
  it("dry run deletes nothing and reports counts", async () => {
    const results = await runOrgPurge({ dryRun: true, now: NOW });
    const r = results.find((x) => x.orgId === oldOrgId);
    expect(r).toBeDefined();
    expect(r!.dryRun).toBe(true);
    expect(r!.archiveId).toBeNull();
    expect(r!.counts.orgMembers).toBe(1);
    expect(r!.counts.orgTwinImpactRecords).toBe(1);
    const stillThere = await db.select().from(organisationsTable).where(eq(organisationsTable.id, oldOrgId));
    expect(stillThere).toHaveLength(1);
    const archives = await db.select().from(orgPurgeArchivesTable).where(eq(orgPurgeArchivesTable.orgId, oldOrgId));
    expect(archives).toHaveLength(0);
  });

  it("purges the expired org, archives a snapshot, and keeps member source records", async () => {
    const results = await runOrgPurge({ dryRun: false, now: NOW });
    const r = results.find((x) => x.orgId === oldOrgId);
    expect(r).toBeDefined();
    expect(r!.dryRun).toBe(false);
    expect(r!.archiveId).toBeTruthy();

    // Org row and org-owned data gone.
    expect(await db.select().from(organisationsTable).where(eq(organisationsTable.id, oldOrgId))).toHaveLength(0);
    expect(await db.select().from(orgMembersTable).where(eq(orgMembersTable.orgId, oldOrgId))).toHaveLength(0);
    expect(await db.select().from(orgSurveysTable).where(eq(orgSurveysTable.orgId, oldOrgId))).toHaveLength(0);
    expect(await db.select().from(orgAuditLogTable).where(eq(orgAuditLogTable.orgId, oldOrgId))).toHaveLength(0);
    expect(await db.select().from(challengesTable).where(eq(challengesTable.orgId, oldOrgId))).toHaveLength(0);

    // Org twin deleted; member's personal source record survives.
    expect(await db.select().from(impactRecordsTable).where(eq(impactRecordsTable.id, twinRecordId))).toHaveLength(0);
    expect(await db.select().from(impactRecordsTable).where(eq(impactRecordsTable.id, personalRecordId))).toHaveLength(1);

    // Twin evidence attachment row deleted (its storage object is deleted
    // best-effort and, once unregistered, swept by the attachment GC);
    // the personal record's attachment survives.
    expect(await db.select().from(attachmentsTable).where(eq(attachmentsTable.recordId, twinRecordId))).toHaveLength(0);
    expect(await db.select().from(attachmentsTable).where(eq(attachmentsTable.recordId, personalRecordId))).toHaveLength(1);

    // Storage objects: twin evidence file and the org's branding logo are
    // deleted post-commit; the personal record's evidence file is not.
    expect(deletedStorageKeys).toContain(`${TAG}/twin-evidence.jpg`);
    expect(deletedStorageKeys).toContain(`org-logos/${oldOrgId}/logo.png`);
    expect(deletedStorageKeys).not.toContain(`${TAG}/personal-evidence.jpg`);

    // The approved registration linked via invite code is gone; the
    // unrelated registration survives.
    const regs = await db.select().from(orgRegistrationsTable).where(like(orgRegistrationsTable.orgName, `${TAG}%`));
    expect(regs).toHaveLength(1);
    expect(regs[0].orgName).toBe(`${TAG}Unrelated Org`);

    // The 179-day org and its membership are untouched.
    expect(await db.select().from(organisationsTable).where(eq(organisationsTable.id, freshOrgId))).toHaveLength(1);
    expect(await db.select().from(orgMembersTable).where(eq(orgMembersTable.orgId, freshOrgId))).toHaveLength(1);

    // Archive snapshot recorded with counts.
    const [archive] = await db.select().from(orgPurgeArchivesTable).where(eq(orgPurgeArchivesTable.orgId, oldOrgId));
    expect(archive).toBeDefined();
    const counts = archive.counts as Record<string, number>;
    expect(counts.orgMembers).toBe(1);
    expect(counts.orgSurveyResponses).toBe(1);
    expect(counts.challenges).toBe(1);
    expect(counts.orgTwinImpactRecords).toBe(1);
    expect(counts.orgTwinAttachments).toBe(1);
    expect(counts.orgRegistrations).toBe(1);
    const snapshot = archive.snapshot as Record<string, unknown[]> & { organisation: { id: string } };
    expect(snapshot.organisation.id).toBe(oldOrgId);
    expect(snapshot.orgSurveys).toHaveLength(1);
  });

  it("is idempotent — a second run finds nothing to purge", async () => {
    const results = await runOrgPurge({ dryRun: false, now: NOW });
    expect(results.find((x) => x.orgId === oldOrgId)).toBeUndefined();
    // Still exactly one archive row.
    expect(await db.select().from(orgPurgeArchivesTable).where(eq(orgPurgeArchivesTable.orgId, oldOrgId))).toHaveLength(1);
  });

  it("selection window constant matches the promised 180 days", () => {
    expect(ORG_DATA_RETENTION_DAYS).toBe(180);
  });
});
