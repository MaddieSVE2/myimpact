import {
  db,
  organisationsTable,
  orgMembersTable,
  orgRegistrationsTable,
  orgMemberConsentsTable,
  orgInvitesTable,
  orgMatchRatesTable,
  orgShareLinksTable,
  orgApiKeysTable,
  orgWebhooksTable,
  webhookDeliveriesTable,
  orgSubscriptionsTable,
  orgSsoConfigsTable,
  orgSurveysTable,
  orgSurveyResponsesTable,
  orgSurveyOptOutsTable,
  recordVerificationsTable,
  orgMigrationsTable,
  orgMigratedActivitiesTable,
  orgAuditLogTable,
  orgPurgeArchivesTable,
  challengesTable,
  challengeParticipantsTable,
  impactRecordsTable,
  attachmentsTable,
  type Organisation,
} from "@workspace/db";
import { and, eq, inArray, isNotNull, lt } from "drizzle-orm";
import { randomUUID } from "crypto";
import { deleteAttachment } from "./objectStorage.js";

/**
 * Retention window promised in the revocation email: a revoked organisation's
 * data is retained for 180 days from `revoked_at`, after which it becomes
 * eligible for deletion. This job enforces that promise.
 *
 * What gets purged (org-owned data):
 *   the organisations row, memberships, consents, invites, match rates,
 *   share links, API keys, webhooks (+ pending deliveries), subscriptions,
 *   SSO configs, surveys (+ responses and opt-outs), record verifications,
 *   migrations (+ migrated activities), the org audit log, org-scoped
 *   challenges (+ participant rows), and org twin impact records
 *   (source='member-submitted' with submitted_to_org_id = the org) together
 *   with their evidence attachments (rows + storage objects).
 *
 * What is NEVER touched (user-owned data):
 *   members' personal impact records (including the personal copies of
 *   member submissions — deleting the org twin makes the personal copy
 *   visible again per the twin/share model), journals, recurring templates,
 *   and user accounts themselves.
 *
 * Before deleting, the full row set is serialised into the
 * `org_purge_archives` table in the SAME transaction as the deletes, so a
 * purge can never delete data without archiving it first.
 */
export const ORG_DATA_RETENTION_DAYS = 180;

const PURGE_INTERVAL_MS = 24 * 60 * 60 * 1000; // daily
const STARTUP_DELAY_MS = 2 * 60 * 1000; // let the process settle first

export interface OrgPurgeResult {
  orgId: string;
  orgName: string;
  revokedAt: Date;
  dryRun: boolean;
  archiveId: string | null;
  counts: Record<string, number>;
}

/** Cutoff: orgs with revoked_at strictly before this are eligible for purge. */
export function purgeCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - ORG_DATA_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

/** Organisations revoked more than ORG_DATA_RETENTION_DAYS ago. */
export async function findPurgeableOrgs(now: Date = new Date()): Promise<Organisation[]> {
  return db
    .select()
    .from(organisationsTable)
    .where(and(isNotNull(organisationsTable.revokedAt), lt(organisationsTable.revokedAt, purgeCutoff(now))));
}

/**
 * Purge one organisation: snapshot every org-owned row into
 * org_purge_archives, then delete the rows in FK-safe order — all inside a
 * single transaction. With `dryRun` set, only counts are computed and logged;
 * nothing is written or deleted.
 */
export async function purgeOrganisation(org: Organisation, opts: { dryRun?: boolean } = {}): Promise<OrgPurgeResult> {
  const dryRun = opts.dryRun ?? false;

  const outcome = await db.transaction(async (tx) => {
    // ── Collect every org-owned row ─────────────────────────────────────
    const members = await tx.select().from(orgMembersTable).where(eq(orgMembersTable.orgId, org.id));
    // The approval flow stamps the registration with the org's invite code —
    // that row keeps the org's name/contact PII, so it is purged too.
    const registrations = await tx
      .select()
      .from(orgRegistrationsTable)
      .where(eq(orgRegistrationsTable.inviteCode, org.inviteCode));
    const consents = await tx.select().from(orgMemberConsentsTable).where(eq(orgMemberConsentsTable.orgId, org.id));
    const invites = await tx.select().from(orgInvitesTable).where(eq(orgInvitesTable.orgId, org.id));
    const matchRates = await tx.select().from(orgMatchRatesTable).where(eq(orgMatchRatesTable.orgId, org.id));
    const shareLinks = await tx.select().from(orgShareLinksTable).where(eq(orgShareLinksTable.orgId, org.id));
    const apiKeys = await tx.select().from(orgApiKeysTable).where(eq(orgApiKeysTable.orgId, org.id));
    const webhooks = await tx.select().from(orgWebhooksTable).where(eq(orgWebhooksTable.orgId, org.id));
    const webhookIds = webhooks.map((w) => w.id);
    const webhookDeliveries = webhookIds.length > 0
      ? await tx.select().from(webhookDeliveriesTable).where(inArray(webhookDeliveriesTable.webhookId, webhookIds))
      : [];
    const subscriptions = await tx.select().from(orgSubscriptionsTable).where(eq(orgSubscriptionsTable.orgId, org.id));
    const ssoConfigs = await tx.select().from(orgSsoConfigsTable).where(eq(orgSsoConfigsTable.orgId, org.id));
    const surveys = await tx.select().from(orgSurveysTable).where(eq(orgSurveysTable.orgId, org.id));
    const surveyIds = surveys.map((s) => s.id);
    const surveyResponses = surveyIds.length > 0
      ? await tx.select().from(orgSurveyResponsesTable).where(inArray(orgSurveyResponsesTable.surveyId, surveyIds))
      : [];
    const surveyOptOuts = await tx.select().from(orgSurveyOptOutsTable).where(eq(orgSurveyOptOutsTable.orgId, org.id));
    const verifications = await tx.select().from(recordVerificationsTable).where(eq(recordVerificationsTable.orgId, org.id));
    const migrations = await tx.select().from(orgMigrationsTable).where(eq(orgMigrationsTable.orgId, org.id));
    const migratedActivities = await tx.select().from(orgMigratedActivitiesTable).where(eq(orgMigratedActivitiesTable.orgId, org.id));
    const auditLog = await tx.select().from(orgAuditLogTable).where(eq(orgAuditLogTable.orgId, org.id));
    const challenges = await tx.select().from(challengesTable).where(eq(challengesTable.orgId, org.id));
    const challengeIds = challenges.map((c) => c.id);
    const challengeParticipants = challengeIds.length > 0
      ? await tx.select().from(challengeParticipantsTable).where(inArray(challengeParticipantsTable.challengeId, challengeIds))
      : [];
    // Org twin records only: member submissions addressed to this org.
    // Members' personal source records (source='user'/'retrospective', no
    // submitted_to_org_id) are user-owned and are deliberately untouched.
    const orgTwinRecords = await tx
      .select()
      .from(impactRecordsTable)
      .where(and(eq(impactRecordsTable.submittedToOrgId, org.id), eq(impactRecordsTable.source, "member-submitted")));
    // Evidence attachments linked to org twin records are part of the org
    // submission and must be purged with it (rows + storage objects).
    // Attachments on the member's personal records are untouched.
    const twinRecordIds = orgTwinRecords.map((r) => r.id);
    const twinAttachments = twinRecordIds.length > 0
      ? await tx.select().from(attachmentsTable).where(inArray(attachmentsTable.recordId, twinRecordIds))
      : [];

    const snapshot = {
      organisation: org,
      orgRegistrations: registrations,
      orgMembers: members,
      orgMemberConsents: consents,
      orgInvites: invites,
      orgMatchRates: matchRates,
      orgShareLinks: shareLinks,
      orgApiKeys: apiKeys,
      orgWebhooks: webhooks,
      webhookDeliveries,
      orgSubscriptions: subscriptions,
      orgSsoConfigs: ssoConfigs,
      orgSurveys: surveys,
      orgSurveyResponses: surveyResponses,
      orgSurveyOptOuts: surveyOptOuts,
      recordVerifications: verifications,
      orgMigrations: migrations,
      orgMigratedActivities: migratedActivities,
      orgAuditLog: auditLog,
      challenges,
      challengeParticipants,
      orgTwinImpactRecords: orgTwinRecords,
      orgTwinAttachments: twinAttachments,
    };

    const counts: Record<string, number> = Object.fromEntries(
      Object.entries(snapshot).map(([k, v]) => [k, Array.isArray(v) ? v.length : 1]),
    );

    if (dryRun) {
      console.log(
        `[org-purge] DRY RUN — would purge org ${org.id} ("${org.name}", revoked ${org.revokedAt!.toISOString()}):`,
        JSON.stringify(counts),
      );
      return {
        result: { orgId: org.id, orgName: org.name, revokedAt: org.revokedAt!, dryRun: true, archiveId: null, counts },
        storageKeys: [] as string[],
      };
    }

    // ── Archive first (same transaction as the deletes) ─────────────────
    const archiveId = randomUUID();
    await tx.insert(orgPurgeArchivesTable).values({
      id: archiveId,
      orgId: org.id,
      orgName: org.name,
      revokedAt: org.revokedAt!,
      snapshot,
      counts,
    });

    // ── Delete in FK-safe order (children before parents) ───────────────
    if (webhookIds.length > 0) {
      await tx.delete(webhookDeliveriesTable).where(inArray(webhookDeliveriesTable.webhookId, webhookIds));
    }
    await tx.delete(orgWebhooksTable).where(eq(orgWebhooksTable.orgId, org.id));
    await tx.delete(orgApiKeysTable).where(eq(orgApiKeysTable.orgId, org.id));
    await tx.delete(orgMatchRatesTable).where(eq(orgMatchRatesTable.orgId, org.id));
    await tx.delete(orgShareLinksTable).where(eq(orgShareLinksTable.orgId, org.id));
    await tx.delete(orgSsoConfigsTable).where(eq(orgSsoConfigsTable.orgId, org.id));
    if (surveyIds.length > 0) {
      await tx.delete(orgSurveyResponsesTable).where(inArray(orgSurveyResponsesTable.surveyId, surveyIds));
    }
    await tx.delete(orgSurveysTable).where(eq(orgSurveysTable.orgId, org.id));
    await tx.delete(orgSurveyOptOutsTable).where(eq(orgSurveyOptOutsTable.orgId, org.id));
    await tx.delete(orgInvitesTable).where(eq(orgInvitesTable.orgId, org.id));
    await tx.delete(orgMemberConsentsTable).where(eq(orgMemberConsentsTable.orgId, org.id));
    await tx.delete(orgMembersTable).where(eq(orgMembersTable.orgId, org.id));
    await tx.delete(orgAuditLogTable).where(eq(orgAuditLogTable.orgId, org.id));
    // Verifications reference impact records — delete them before the twins.
    await tx.delete(recordVerificationsTable).where(eq(recordVerificationsTable.orgId, org.id));
    if (twinRecordIds.length > 0) {
      await tx.delete(attachmentsTable).where(inArray(attachmentsTable.recordId, twinRecordIds));
    }
    await tx
      .delete(impactRecordsTable)
      .where(and(eq(impactRecordsTable.submittedToOrgId, org.id), eq(impactRecordsTable.source, "member-submitted")));
    if (challengeIds.length > 0) {
      await tx.delete(challengeParticipantsTable).where(inArray(challengeParticipantsTable.challengeId, challengeIds));
    }
    await tx.delete(challengesTable).where(eq(challengesTable.orgId, org.id));
    await tx.delete(orgMigratedActivitiesTable).where(eq(orgMigratedActivitiesTable.orgId, org.id));
    await tx.delete(orgMigrationsTable).where(eq(orgMigrationsTable.orgId, org.id));
    await tx.delete(orgSubscriptionsTable).where(eq(orgSubscriptionsTable.orgId, org.id));
    await tx.delete(orgRegistrationsTable).where(eq(orgRegistrationsTable.inviteCode, org.inviteCode));
    await tx.delete(organisationsTable).where(eq(organisationsTable.id, org.id));

    console.log(
      `[org-purge] Purged org ${org.id} ("${org.name}", revoked ${org.revokedAt!.toISOString()}); ` +
        `archive ${archiveId}; deleted:`,
      JSON.stringify(counts),
    );

    return {
      result: { orgId: org.id, orgName: org.name, revokedAt: org.revokedAt!, dryRun: false, archiveId, counts },
      // Evidence objects plus the org's uploaded branding logo (org-logos/…
      // prefix — not covered by the attachment GC, so it must go here).
      storageKeys: [
        ...twinAttachments.map((a) => a.storageKey),
        ...(org.logoKey ? [org.logoKey] : []),
      ],
    };
  });

  // Delete the evidence files themselves AFTER the transaction commits (so a
  // rollback never loses objects whose rows survived). Best-effort per file;
  // any object that slips through is unregistered once its row is gone, so
  // the recurring attachment GC sweep removes it as a durable backstop.
  for (const storageKey of outcome.storageKeys) {
    try {
      await deleteAttachment(storageKey);
    } catch (err) {
      console.error(`[org-purge] Failed to delete attachment object ${storageKey} (GC will sweep it):`, err);
    }
  }

  return outcome.result;
}

/**
 * Find and purge all organisations past the retention window. Idempotent —
 * a purged org's row is gone, so a re-run finds nothing to do. Failures on
 * one org don't block the others.
 */
export async function runOrgPurge(opts: { dryRun?: boolean; now?: Date } = {}): Promise<OrgPurgeResult[]> {
  const dryRun = opts.dryRun ?? process.env.ORG_PURGE_DRY_RUN === "true";
  const orgs = await findPurgeableOrgs(opts.now ?? new Date());
  const results: OrgPurgeResult[] = [];
  for (const org of orgs) {
    try {
      results.push(await purgeOrganisation(org, { dryRun }));
    } catch (err) {
      console.error(`[org-purge] Failed to purge org ${org.id} ("${org.name}"):`, err);
    }
  }
  return results;
}

/**
 * Schedule the daily revoked-org purge. Runs shortly after startup and then
 * every 24 hours; timers are unref'd so they never block shutdown. Set
 * ORG_PURGE_DRY_RUN=true to log what would be deleted without deleting.
 */
export function startOrgPurgeJob(): void {
  const startup = setTimeout(() => {
    runOrgPurge().catch((err) => console.error("[org-purge] run failed:", err));
    const recurring = setInterval(() => {
      runOrgPurge().catch((err) => console.error("[org-purge] run failed:", err));
    }, PURGE_INTERVAL_MS);
    recurring.unref?.();
  }, STARTUP_DELAY_MS);
  startup.unref?.();
  console.log(
    `[org-purge] scheduled daily purge of orgs revoked over ${ORG_DATA_RETENTION_DAYS} days ago` +
      (process.env.ORG_PURGE_DRY_RUN === "true" ? " (DRY RUN mode)" : ""),
  );
}
