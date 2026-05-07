import {
  db,
  usersTable,
  userProfilesTable,
  impactRecordsTable,
  journalEntriesTable,
  recurringTemplatesTable,
  attachmentsTable,
  publicProfilesTable,
  pushPreferencesTable,
  pushSubscriptionsTable,
  challengeParticipantsTable,
  calendarSourcesTable,
  calendarEventsTable,
  voiceUsageTable,
  textAiUsageTable,
  orgMembersTable,
  organisationsTable,
  userAuditLogTable,
  pageViewsTable,
  feedbackTable,
  onboardingEmailSendsTable,
  analyticsEventsTable,
  orgSurveyResponsesTable,
  orgSurveyOptOutsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { getDownloadURL } from "./objectStorage.js";

/**
 * Build a complete machine-readable export of every piece of personal data
 * we hold for the given user. Returned as a plain object so callers can
 * stringify and stream as application/json.
 */
export async function buildUserExport(userId: string): Promise<Record<string, unknown>> {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    throw new Error("User not found");
  }

  const [profile] = await db
    .select()
    .from(userProfilesTable)
    .where(eq(userProfilesTable.userId, userId));

  const impactRecords = await db
    .select()
    .from(impactRecordsTable)
    .where(eq(impactRecordsTable.userId, userId));

  const journalEntries = await db
    .select()
    .from(journalEntriesTable)
    .where(eq(journalEntriesTable.userId, userId));

  const recurringTemplates = await db
    .select()
    .from(recurringTemplatesTable)
    .where(eq(recurringTemplatesTable.userId, userId));

  const attachmentRows = await db
    .select()
    .from(attachmentsTable)
    .where(eq(attachmentsTable.userId, userId));
  // GDPR portability: mint a short-lived signed download URL per attachment
  // so the export blob is self-contained and can be opened with any HTTP
  // client. Best-effort: if signing fails (storage outage, etc.) fall back
  // to the in-app authenticated download endpoint so nothing is silently
  // dropped from the export.
  const attachments = await Promise.all(
    attachmentRows.map(async (a) => {
      let signedUrl: string | null = null;
      try {
        signedUrl = await getDownloadURL(a.storageKey);
      } catch (err) {
        console.error("[userExport] sign URL failed", { id: a.id, err });
      }
      return {
        ...a,
        signedUrl,
        signedUrlExpiresAt: signedUrl
          ? new Date(Date.now() + 60 * 60 * 1000).toISOString()
          : null,
        downloadPath: `/api/attachments/${a.id}/file`,
        signedUrlPath: `/api/attachments/${a.id}/signed-url`,
      };
    }),
  );

  const [publicProfile] = await db
    .select()
    .from(publicProfilesTable)
    .where(eq(publicProfilesTable.userId, userId));

  const [pushPrefs] = await db
    .select()
    .from(pushPreferencesTable)
    .where(eq(pushPreferencesTable.userId, userId));

  const pushSubs = await db
    .select({
      id: pushSubscriptionsTable.id,
      endpoint: pushSubscriptionsTable.endpoint,
      createdAt: pushSubscriptionsTable.createdAt,
    })
    .from(pushSubscriptionsTable)
    .where(eq(pushSubscriptionsTable.userId, userId));

  const challenges = await db
    .select()
    .from(challengeParticipantsTable)
    .where(eq(challengeParticipantsTable.userId, userId));

  const calendarSources = await db
    .select()
    .from(calendarSourcesTable)
    .where(eq(calendarSourcesTable.userId, userId));

  const calendarEvents = await db
    .select()
    .from(calendarEventsTable)
    .where(eq(calendarEventsTable.userId, userId));

  const voiceUsage = await db
    .select()
    .from(voiceUsageTable)
    .where(eq(voiceUsageTable.userId, userId));

  const textAiUsage = await db
    .select()
    .from(textAiUsageTable)
    .where(eq(textAiUsageTable.userId, userId));

  const memberships = await db
    .select({
      orgId: orgMembersTable.orgId,
      role: orgMembersTable.role,
      orgName: organisationsTable.name,
      orgType: organisationsTable.type,
    })
    .from(orgMembersTable)
    .leftJoin(organisationsTable, eq(orgMembersTable.orgId, organisationsTable.id))
    .where(eq(orgMembersTable.userId, userId));

  const auditLog = await db
    .select()
    .from(userAuditLogTable)
    .where(eq(userAuditLogTable.userId, userId));

  // Additional personal-data domains required for full GDPR portability.
  const pageViews = await db
    .select()
    .from(pageViewsTable)
    .where(eq(pageViewsTable.userId, userId));

  const feedback = await db
    .select()
    .from(feedbackTable)
    .where(eq(feedbackTable.userId, userId));

  const onboardingEmailSends = await db
    .select()
    .from(onboardingEmailSendsTable)
    .where(eq(onboardingEmailSendsTable.userId, userId));

  const analyticsEvents = await db
    .select()
    .from(analyticsEventsTable)
    .where(eq(analyticsEventsTable.userId, userId));

  const pulseSurveyResponses = await db
    .select()
    .from(orgSurveyResponsesTable)
    .where(eq(orgSurveyResponsesTable.userId, userId));

  const pulseSurveyOptOuts = await db
    .select()
    .from(orgSurveyOptOutsTable)
    .where(eq(orgSurveyOptOutsTable.userId, userId));

  return {
    meta: {
      exportedAt: new Date().toISOString(),
      schemaVersion: 1,
      notes:
        "This file contains every piece of personal data My Impact stores about your account. " +
        "Each attachment includes a signedUrl (~1 hour TTL, signedUrlExpiresAt) you can fetch " +
        "with any HTTP client, plus an in-app downloadPath that works while you remain signed in.",
    },
    account: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      preferredLocale: user.preferredLocale,
      emailDigestOptIn: user.emailDigestOptIn,
      voiceEnabled: user.voiceEnabled,
      voicePersona: user.voicePersona,
      gamificationEnabled: user.gamificationEnabled,
      createdAt: user.createdAt,
    },
    profile: profile
      ? {
          situation: profile.situation,
          interests: profile.interests,
          postcode: profile.postcode,
          emailOptIn: profile.emailOptIn,
          marketingConsentAt: profile.marketingConsentAt,
          marketingConsentSource: profile.marketingConsentSource,
          updatedAt: profile.updatedAt,
        }
      : null,
    publicProfile: publicProfile ?? null,
    impactRecords,
    journalEntries,
    recurringTemplates,
    attachments,
    pushPreferences: pushPrefs ?? null,
    pushSubscriptions: pushSubs,
    challenges,
    calendarSources,
    calendarEvents,
    voiceUsage,
    textAiUsage,
    organisationMemberships: memberships,
    pulseSurveyResponses,
    pulseSurveyOptOuts,
    pageViews,
    feedback,
    onboardingEmailSends,
    analyticsEvents,
    auditLog,
  };
}
