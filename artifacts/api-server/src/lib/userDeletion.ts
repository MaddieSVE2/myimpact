import {
  db,
  usersTable,
  magicTokensTable,
  userProfilesTable,
  pageViewsTable,
  feedbackTable,
  onboardingEmailSendsTable,
  orgMembersTable,
  publicProfilesTable,
  journalEntriesTable,
  impactRecordsTable,
  recurringTemplatesTable,
  pushSubscriptionsTable,
  pushPreferencesTable,
  calendarSourcesTable,
  challengeParticipantsTable,
  voiceUsageTable,
  textAiUsageTable,
  attachmentPendingReservationsTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { deleteAllAttachmentsForUser } from "./attachmentCleanup.js";

/**
 * Erase every row in the database that is personal to the given user, then
 * delete the users row itself. Tables that retain rows for organisation
 * aggregates (org_audit_log, org_match_rates, challenges, record_verifications)
 * have their FK columns set to NULL via the ON DELETE SET NULL constraint
 * configured in migration 0018; nothing extra is required here.
 *
 * Order matters where FK constraints exist: dependants first, parent last.
 *
 * Returns a small summary so callers can log/audit how much was removed.
 */
export async function eraseUserData(userId: string): Promise<{
  attachmentsRemoved: number;
}> {
  // Storage objects + attachment rows. Done first so that even if a later
  // step throws we have at least reclaimed the user's GCS bytes.
  const attachmentsRemoved = await deleteAllAttachmentsForUser(userId);

  // Push (no FK to users, so explicit delete required).
  await db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.userId, userId));
  await db.delete(pushPreferencesTable).where(eq(pushPreferencesTable.userId, userId));

  // Calendar sources cascade to calendar_events via FK ON DELETE CASCADE.
  await db.delete(calendarSourcesTable).where(eq(calendarSourcesTable.userId, userId));

  // Challenge participation (no cascade).
  await db.delete(challengeParticipantsTable).where(eq(challengeParticipantsTable.userId, userId));

  // Pending upload reservations.
  await db
    .delete(attachmentPendingReservationsTable)
    .where(eq(attachmentPendingReservationsTable.userId, userId));

  // Per-user usage counters (cascade-defined but explicit for clarity).
  await db.delete(voiceUsageTable).where(eq(voiceUsageTable.userId, userId));
  await db.delete(textAiUsageTable).where(eq(textAiUsageTable.userId, userId));

  // Pulse-survey personal data: responses + opt-outs cascade via FK
  // (migration 0019), but delete explicitly so the count is observable
  // and the order is deterministic.
  await db.execute(
    sql`DELETE FROM org_survey_responses WHERE user_id = ${userId}`,
  );
  await db.execute(
    sql`DELETE FROM org_survey_opt_outs WHERE user_id = ${userId}`,
  );

  // GDPR right-to-erasure: remove analytics events tied to this user.
  // The FK is ON DELETE SET NULL (so org-level aggregates don't break
  // for currently-active users), but a deletion request requires us to
  // physically drop the rows — `props` may contain personal context.
  await db.execute(
    sql`DELETE FROM analytics_events WHERE user_id = ${userId}`,
  );

  // Auth + profile + analytics references.
  await db.delete(magicTokensTable).where(eq(magicTokensTable.userId, userId));
  await db.delete(userProfilesTable).where(eq(userProfilesTable.userId, userId));
  await db.delete(pageViewsTable).where(eq(pageViewsTable.userId, userId));
  await db.delete(feedbackTable).where(eq(feedbackTable.userId, userId));
  await db.delete(onboardingEmailSendsTable).where(eq(onboardingEmailSendsTable.userId, userId));
  await db.delete(orgMembersTable).where(eq(orgMembersTable.userId, userId));
  await db.delete(publicProfilesTable).where(eq(publicProfilesTable.userId, userId));

  // Personal content.
  await db.delete(journalEntriesTable).where(eq(journalEntriesTable.userId, userId));
  await db.delete(impactRecordsTable).where(eq(impactRecordsTable.userId, userId));
  await db.delete(recurringTemplatesTable).where(eq(recurringTemplatesTable.userId, userId));

  // Finally: delete the user row. Org-side rows that still reference this
  // user have their FK column set to NULL via ON DELETE SET NULL.
  // analytics_events.user_id is also ON DELETE SET NULL.
  await db.delete(usersTable).where(eq(usersTable.id, userId));

  return { attachmentsRemoved };
}
