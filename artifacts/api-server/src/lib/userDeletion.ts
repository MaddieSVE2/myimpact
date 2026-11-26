import {
  db,
  usersTable,
  magicTokensTable,
  userProfilesTable,
  pageViewsTable,
  feedbackTable,
  onboardingEmailSendsTable,
  orgMembersTable,
  orgMemberConsentsTable,
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
import { deleteEmailLogFor } from "./emailLog.js";

/**
 * Erase every row in the database that is personal to the given user, then
 * delete the users row itself. Tables that retain rows for organisation
 * aggregates (org_audit_log, org_match_rates, challenges, record_verifications)
 * have their FK columns set to NULL via the ON DELETE SET NULL constraint
 * configured in migration 0018; nothing extra is required here.
 *
 * Order matters where FK constraints exist: dependants first, parent last.
 *
 * Every database delete runs in one transaction that first locks the users
 * row FOR UPDATE. Inserting a row that references a user (a page view, a
 * sign-in token, an analytics event) takes a FOR KEY SHARE lock on that users
 * row, which FOR UPDATE blocks. So a write that arrives mid-delete waits for
 * this transaction and is then refused because the user is gone, instead of
 * landing between "clear the table" and "delete the user" and failing the
 * whole erasure with a foreign key error (23503). Whoever made that late
 * write gets the foreign key error instead; routes/analytics.ts already
 * treats it as non-fatal.
 *
 * Inside the transaction use `tx` only. A query on the global `db` that
 * writes a row referencing this user would wait on the lock held here and
 * never return.
 *
 * Returns a small summary so callers can log/audit how much was removed.
 */
export async function eraseUserData(userId: string): Promise<{
  attachmentsRemoved: number;
}> {
  // Storage objects + attachment rows. Done first, outside the transaction,
  // so that even if a later step throws we have at least reclaimed the
  // user's GCS bytes, and so the row lock is not held during storage calls.
  const attachmentsRemoved = await deleteAllAttachmentsForUser(userId);

  await db.transaction(async (tx) => {
    // Lock the user row before anything else (see the note above). It must be
    // FOR UPDATE: the weaker FOR NO KEY UPDATE does not block child inserts.
    const [user] = await tx
      .select({ email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .for("update");

    // Push (no FK to users, so explicit delete required).
    await tx.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.userId, userId));
    await tx.delete(pushPreferencesTable).where(eq(pushPreferencesTable.userId, userId));

    // Calendar sources cascade to calendar_events via FK ON DELETE CASCADE.
    await tx.delete(calendarSourcesTable).where(eq(calendarSourcesTable.userId, userId));

    // Challenge participation (no cascade).
    await tx.delete(challengeParticipantsTable).where(eq(challengeParticipantsTable.userId, userId));

    // Pending upload reservations.
    await tx
      .delete(attachmentPendingReservationsTable)
      .where(eq(attachmentPendingReservationsTable.userId, userId));

    // Per-user usage counters (cascade-defined but explicit for clarity).
    await tx.delete(voiceUsageTable).where(eq(voiceUsageTable.userId, userId));
    await tx.delete(textAiUsageTable).where(eq(textAiUsageTable.userId, userId));

    // Pulse-survey personal data: responses + opt-outs cascade via FK
    // (migration 0019), but delete explicitly so the count is observable
    // and the order is deterministic.
    await tx.execute(
      sql`DELETE FROM org_survey_responses WHERE user_id = ${userId}`,
    );
    await tx.execute(
      sql`DELETE FROM org_survey_opt_outs WHERE user_id = ${userId}`,
    );

    // GDPR right-to-erasure: remove analytics events tied to this user.
    // The FK is ON DELETE SET NULL (so org-level aggregates don't break
    // for currently-active users), but a deletion request requires us to
    // physically drop the rows — `props` may contain personal context.
    await tx.execute(
      sql`DELETE FROM analytics_events WHERE user_id = ${userId}`,
    );

    // Auth + profile + analytics references.
    await tx.delete(magicTokensTable).where(eq(magicTokensTable.userId, userId));
    await tx.delete(userProfilesTable).where(eq(userProfilesTable.userId, userId));
    await tx.delete(pageViewsTable).where(eq(pageViewsTable.userId, userId));
    await tx.delete(feedbackTable).where(eq(feedbackTable.userId, userId));
    await tx.delete(onboardingEmailSendsTable).where(eq(onboardingEmailSendsTable.userId, userId));
    await tx.delete(orgMembersTable).where(eq(orgMembersTable.userId, userId));
    await tx.delete(orgMemberConsentsTable).where(eq(orgMemberConsentsTable.userId, userId));
    await tx.delete(publicProfilesTable).where(eq(publicProfilesTable.userId, userId));

    // Personal content.
    await tx.delete(journalEntriesTable).where(eq(journalEntriesTable.userId, userId));
    await tx.delete(impactRecordsTable).where(eq(impactRecordsTable.userId, userId));
    await tx.delete(recurringTemplatesTable).where(eq(recurringTemplatesTable.userId, userId));

    // Emails sent to them. The log is keyed by address, not user id.
    if (user?.email) await deleteEmailLogFor(user.email, tx);

    // Finally: delete the user row. Org-side rows that still reference this
    // user have their FK column set to NULL via ON DELETE SET NULL.
    // analytics_events.user_id is also ON DELETE SET NULL.
    await tx.delete(usersTable).where(eq(usersTable.id, userId));
  });

  return { attachmentsRemoved };
}
