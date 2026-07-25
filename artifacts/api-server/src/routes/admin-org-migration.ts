import { Router, type IRouter } from "express";
import {
  db,
  usersTable,
  organisationsTable,
  orgMembersTable,
  orgMemberConsentsTable,
  orgMatchRatesTable,
  orgSurveysTable,
  orgSurveyResponsesTable,
  orgApiKeysTable,
  orgAuditLogTable,
  orgMigrationsTable,
  orgMigratedActivitiesTable,
  impactRecordsTable,
  recordVerificationsTable,
} from "@workspace/db";
import { eq, desc, and, inArray, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { z } from "zod";
import { authenticate, type AuthenticatedRequest } from "../middleware/authenticate.js";
import { isAdminEmail } from "../lib/adminEmails.js";
import { getOrgSharingContext, sharedRecordsCondition, normalizeDashboardSections } from "../lib/orgSharing.js";

const router: IRouter = Router();

export const ORG_EXPORT_FORMAT = "my-impact-org-export";
export const ORG_EXPORT_VERSION = 1;

// Settings copied onto the target organisation on import. Deliberately
// excludes identity/access fields: id, name, type, inviteCode, contact*,
// dataSharingMode (fixed at creation), revokedAt and createdAt.
const TRANSFERABLE_SETTINGS = [
  "aiSidekickEnabled",
  "challengeLeaderboardEnabled",
  "logoKey",
  "brandPrimary",
  "brandAccent",
  "sroiCostPerVolunteer",
  "sroiCostRecruitment",
  "sroiCostOnboarding",
  "sroiCostSupport",
  "sroiCostAdmin",
  "summaryYearStart",
  "autoVerifyActivities",
  "dashboardSections",
] as const;

// Fail-closed: if the audit entry cannot be written, the caller's operation
// must fail too (every export/import must be audit-logged).
async function writeOrgAudit(executor: typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0], orgId: string, actorUserId: string, action: string, targetType: string, targetId: string, metadata?: Record<string, unknown>) {
  await executor.insert(orgAuditLogTable).values({ orgId, actorUserId, action, targetType, targetId, metadata: metadata ?? null });
}

/**
 * Assemble the full structured export for an organisation. Includes revoked
 * organisations (that's the point — data requests during the 180-day
 * retention window).
 */
async function buildOrgExport(orgId: string) {
  const org = await db.query.organisationsTable.findFirst({ where: eq(organisationsTable.id, orgId) });
  if (!org) return null;

  // Members (all statuses) with user identity.
  const memberRows = await db
    .select({
      userId: orgMembersTable.userId,
      role: orgMembersTable.role,
      status: orgMembersTable.status,
      joinedAt: orgMembersTable.joinedAt,
      displayName: usersTable.displayName,
      email: usersTable.email,
    })
    .from(orgMembersTable)
    .innerJoin(usersTable, eq(orgMembersTable.userId, usersTable.id))
    .where(eq(orgMembersTable.orgId, orgId));

  // Consents (consented-logging orgs).
  const consentRows = await db
    .select()
    .from(orgMemberConsentsTable)
    .where(eq(orgMemberConsentsTable.orgId, orgId));

  // Match rates.
  const matchRates = await db
    .select()
    .from(orgMatchRatesTable)
    .where(eq(orgMatchRatesTable.orgId, orgId));

  // Shared/submitted/attested activity records.
  const orgApiKeyRows = await db
    .select({ id: orgApiKeysTable.id })
    .from(orgApiKeysTable)
    .where(eq(orgApiKeysTable.orgId, orgId));
  const apiKeyIdList = orgApiKeyRows.map((k) => k.id);

  const memberCond = eq(impactRecordsTable.submittedToOrgId, orgId);
  const attestedCond = apiKeyIdList.length > 0
    ? inArray(impactRecordsTable.attestedByApiKeyId, apiKeyIdList)
    : sql`FALSE`;
  const sharingCtx = await getOrgSharingContext(orgId);
  const consentedCond = sharingCtx.mode === "consented_logging" ? sharedRecordsCondition(sharingCtx) : undefined;

  const records = await db
    .select()
    .from(impactRecordsTable)
    .where(consentedCond
      ? sql`(${memberCond}) OR (${attestedCond}) OR (${consentedCond})`
      : sql`(${memberCond}) OR (${attestedCond})`)
    .orderBy(desc(impactRecordsTable.entryDate));

  // Verification history for this org.
  const verifications = await db
    .select()
    .from(recordVerificationsTable)
    .where(eq(recordVerificationsTable.orgId, orgId));
  const verificationByRecord = new Map(verifications.map((v) => [v.recordId, v]));

  // Member identity for activity rows.
  const userIds = Array.from(new Set(records.map((r) => r.userId)));
  const users = userIds.length > 0
    ? await db
        .select({ id: usersTable.id, displayName: usersTable.displayName, email: usersTable.email })
        .from(usersTable)
        .where(inArray(usersTable.id, userIds))
    : [];
  const userMap = new Map(users.map((u) => [u.id, u]));

  const activities = records.map((r) => {
    const u = userMap.get(r.userId);
    const v = verificationByRecord.get(r.id);
    const attested = !!r.attestedAt;
    return {
      sourceRecordId: String(r.id),
      memberName: u?.displayName ?? null,
      memberEmail: u?.email ?? null,
      name: r.name,
      entryDate: (r.entryDate ?? r.createdAt).toISOString(),
      totalValue: String(r.totalValue),
      totalHours: r.totalHours,
      source: r.source,
      verified: attested || v?.status === "approved",
      verificationStatus: attested ? "org-attested" : (v?.status ?? null),
      verificationDecidedAt: v?.decidedAt ? v.decidedAt.toISOString() : null,
      activitiesJson: r.activitiesJson,
    };
  });

  // Survey aggregates (never raw responses — those are member PII).
  const surveys = await db.query.orgSurveysTable.findMany({ where: eq(orgSurveysTable.orgId, orgId) });
  const surveyIds = surveys.map((s) => s.id);
  const responses = surveyIds.length > 0
    ? await db
        .select({
          surveyId: orgSurveyResponsesTable.surveyId,
          windowKey: orgSurveyResponsesTable.windowKey,
          rating: orgSurveyResponsesTable.rating,
        })
        .from(orgSurveyResponsesTable)
        .where(inArray(orgSurveyResponsesTable.surveyId, surveyIds))
    : [];
  const grouped = new Map<string, Map<string, number[]>>();
  for (const r of responses) {
    if (!grouped.has(r.surveyId)) grouped.set(r.surveyId, new Map());
    const byWindow = grouped.get(r.surveyId)!;
    if (!byWindow.has(r.windowKey)) byWindow.set(r.windowKey, []);
    byWindow.get(r.windowKey)!.push(r.rating);
  }
  const surveyAggregates = surveys.map((s) => ({
    surveyId: s.id,
    template: s.template,
    question: s.question,
    schedule: s.schedule,
    anonymous: s.anonymous,
    createdAt: s.createdAt.toISOString(),
    archivedAt: s.archivedAt ? s.archivedAt.toISOString() : null,
    windows: Array.from((grouped.get(s.id) ?? new Map<string, number[]>()).entries()).map(([windowKey, ratings]) => ({
      windowKey,
      responseCount: ratings.length,
      averageRating: Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 100) / 100,
    })),
  }));

  const settings: Record<string, unknown> = {};
  for (const key of TRANSFERABLE_SETTINGS) {
    settings[key] = key === "dashboardSections"
      ? normalizeDashboardSections(org.dashboardSections)
      : (org as unknown as Record<string, unknown>)[key];
  }

  const exportedAt = new Date().toISOString();
  const totalValue = activities.reduce((a, r) => a + Number(r.totalValue), 0);
  const totalHours = activities.reduce((a, r) => a + r.totalHours, 0);
  const verifiedCount = activities.filter((a) => a.verified).length;

  const humanReadableSummary = [
    `My Impact — organisation data export`,
    ``,
    `Organisation: ${org.name} (${org.type})`,
    `Data-sharing type: ${org.dataSharingMode === "consented_logging" ? "Consented logging" : "Explicit submission"}`,
    `Created: ${org.createdAt.toISOString().slice(0, 10)}`,
    org.revokedAt ? `Revoked: ${org.revokedAt.toISOString().slice(0, 10)} (data retained 180 days from this date)` : `Status: active`,
    `Exported: ${exportedAt}`,
    ``,
    `Members: ${memberRows.length} (${memberRows.filter((m) => m.status === "active").length} active)`,
    `Shared activity records: ${activities.length} (${verifiedCount} verified)`,
    `Total social value shared: £${totalValue.toFixed(2)}`,
    `Total hours shared: ${totalHours}`,
    `Verification decisions on file: ${verifications.length}`,
    `Surveys: ${surveys.length} (aggregate results only — individual responses are never exported)`,
    ``,
    `Notes:`,
    `- This file can be imported into a freshly created organisation by a My Impact super-admin.`,
    `- Member accounts are not transferred; members re-join the new organisation through the normal join flow.`,
    `- Imported activity records are clearly marked as migrated in the new organisation.`,
  ].join("\n");

  return {
    format: ORG_EXPORT_FORMAT,
    version: ORG_EXPORT_VERSION,
    exportedAt,
    org: {
      id: org.id,
      name: org.name,
      type: org.type,
      dataSharingMode: org.dataSharingMode,
      contactName: org.contactName,
      contactEmail: org.contactEmail,
      createdAt: org.createdAt.toISOString(),
      revokedAt: org.revokedAt ? org.revokedAt.toISOString() : null,
      settings,
    },
    members: memberRows.map((m) => ({
      name: m.displayName ?? null,
      email: m.email,
      role: m.role,
      status: m.status,
      joinedAt: m.joinedAt.toISOString(),
    })),
    consents: consentRows.map((c) => ({
      userId: c.userId,
      status: c.status,
      shareFrom: c.shareFrom.toISOString(),
      shareScope: c.shareScope,
      grantedAt: c.grantedAt.toISOString(),
      withdrawnAt: c.withdrawnAt ? c.withdrawnAt.toISOString() : null,
    })),
    matchRates: matchRates.map((m) => ({
      hourlyRate: m.hourlyRate,
      donationMultiplier: m.donationMultiplier,
      monthlyCapPerMember: m.monthlyCapPerMember,
      onlyVerifiedHours: m.onlyVerifiedHours,
      effectiveFrom: m.effectiveFrom.toISOString(),
      effectiveTo: m.effectiveTo ? m.effectiveTo.toISOString() : null,
    })),
    activities,
    verifications: verifications.map((v) => ({
      recordId: String(v.recordId),
      status: v.status,
      decidedAt: v.decidedAt ? v.decidedAt.toISOString() : null,
      reason: v.reason,
      createdAt: v.createdAt.toISOString(),
    })),
    surveyAggregates,
    humanReadableSummary,
  };
}

// ── GET /api/admin/orgs/:id/export ──────────────────────────────────────────
router.get("/orgs/:id/export", authenticate, async (req: AuthenticatedRequest, res) => {
  if (!isAdminEmail(req.user!.email)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const orgId = String(req.params.id);
  const exportData = await buildOrgExport(orgId);
  if (!exportData) {
    res.status(404).json({ error: "Organisation not found" });
    return;
  }
  await writeOrgAudit(db, orgId, req.user!.id, "admin.data_export", "organisation", orgId, {
    activities: exportData.activities.length,
    members: exportData.members.length,
    revokedOrg: !!exportData.org.revokedAt,
  });
  res.setHeader("Content-Disposition", `attachment; filename="my-impact-org-export-${req.params.id}.json"`);
  res.json(exportData);
});

// ── POST /api/admin/orgs/:id/import ──────────────────────────────────────────
// Body: { dryRun: boolean, export: <org export file> }
// dryRun=true validates + returns a preview of what will be created without
// committing. dryRun=false performs the import inside a transaction.

const exportFileSchema = z.object({
  format: z.literal(ORG_EXPORT_FORMAT),
  version: z.literal(ORG_EXPORT_VERSION),
  exportedAt: z.string().refine((s) => !Number.isNaN(Date.parse(s)), "exportedAt must be an ISO date"),
  org: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    type: z.string().min(1),
    dataSharingMode: z.string().min(1),
    settings: z.object({
      aiSidekickEnabled: z.boolean().optional(),
      challengeLeaderboardEnabled: z.boolean().optional(),
      autoVerifyActivities: z.boolean().optional(),
      logoKey: z.string().nullable().optional(),
      brandPrimary: z.string().nullable().optional(),
      brandAccent: z.string().nullable().optional(),
      sroiCostPerVolunteer: z.union([z.string(), z.number()]).nullable().optional(),
      sroiCostRecruitment: z.union([z.string(), z.number()]).nullable().optional(),
      sroiCostOnboarding: z.union([z.string(), z.number()]).nullable().optional(),
      sroiCostSupport: z.union([z.string(), z.number()]).nullable().optional(),
      sroiCostAdmin: z.union([z.string(), z.number()]).nullable().optional(),
      summaryYearStart: z.union([z.string(), z.number()]).nullable().optional(),
      dashboardSections: z.record(z.string(), z.unknown()).nullable().optional(),
    }).passthrough(),
  }).passthrough(),
  members: z.array(z.object({
    name: z.string().nullable(),
    email: z.string(),
    role: z.string(),
    status: z.string(),
    joinedAt: z.string(),
  }).passthrough()),
  activities: z.array(z.object({
    sourceRecordId: z.string().min(1),
    memberName: z.string().nullable(),
    memberEmail: z.string().nullable(),
    name: z.string(),
    entryDate: z.string().refine((s) => !Number.isNaN(Date.parse(s)), "entryDate must be an ISO date"),
    totalValue: z.string().refine((s) => Number.isFinite(Number(s)), "totalValue must be numeric"),
    totalHours: z.number().int(),
    source: z.string(),
    verified: z.boolean(),
    verificationStatus: z.string().nullable(),
    activitiesJson: z.unknown().optional(),
  }).passthrough()),
  surveyAggregates: z.array(z.unknown()),
}).passthrough();

router.post("/orgs/:id/import", authenticate, async (req: AuthenticatedRequest, res) => {
  if (!isAdminEmail(req.user!.email)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const targetOrgId = String(req.params.id);
  const body = (req.body ?? {}) as Record<string, unknown>;
  const dryRun = body.dryRun !== false; // default to preview — commit must be explicit

  const parsed = exportFileSchema.safeParse(body.export);
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
    res.status(400).json({ error: `Export file is invalid — nothing was imported. ${issues.join("; ")}` });
    return;
  }
  const file = parsed.data;

  const target = await db.query.organisationsTable.findFirst({ where: eq(organisationsTable.id, targetOrgId) });
  if (!target) {
    res.status(404).json({ error: "Target organisation not found" });
    return;
  }
  if (target.revokedAt) {
    res.status(400).json({ error: "Cannot import into a revoked organisation" });
    return;
  }
  if (file.org.id === targetOrgId) {
    res.status(400).json({ error: "Cannot import an organisation's export into itself. Create a fresh organisation first." });
    return;
  }

  // Target must be a fresh organisation: no members, no shared activity data
  // (submitted OR attested via the org's API keys), no verifications, no
  // surveys, no previous migration.
  const targetApiKeyRows = await db
    .select({ id: orgApiKeysTable.id })
    .from(orgApiKeysTable)
    .where(eq(orgApiKeysTable.orgId, targetOrgId));
  const targetApiKeyIds = targetApiKeyRows.map((k) => k.id);
  const [memberCount, submittedCount, attestedCount, verificationCount, surveyCount, migrationCount] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(orgMembersTable).where(eq(orgMembersTable.orgId, targetOrgId)).then((r) => r[0].n),
    db.select({ n: sql<number>`count(*)::int` }).from(impactRecordsTable).where(eq(impactRecordsTable.submittedToOrgId, targetOrgId)).then((r) => r[0].n),
    targetApiKeyIds.length > 0
      ? db.select({ n: sql<number>`count(*)::int` }).from(impactRecordsTable).where(inArray(impactRecordsTable.attestedByApiKeyId, targetApiKeyIds)).then((r) => r[0].n)
      : Promise.resolve(0),
    db.select({ n: sql<number>`count(*)::int` }).from(recordVerificationsTable).where(eq(recordVerificationsTable.orgId, targetOrgId)).then((r) => r[0].n),
    db.select({ n: sql<number>`count(*)::int` }).from(orgSurveysTable).where(eq(orgSurveysTable.orgId, targetOrgId)).then((r) => r[0].n),
    db.select({ n: sql<number>`count(*)::int` }).from(orgMigrationsTable).where(eq(orgMigrationsTable.orgId, targetOrgId)).then((r) => r[0].n),
  ]);
  const blockers: string[] = [];
  if (memberCount > 0) blockers.push(`${memberCount} member(s)`);
  if (submittedCount > 0) blockers.push(`${submittedCount} submitted activity record(s)`);
  if (attestedCount > 0) blockers.push(`${attestedCount} API-attested activity record(s)`);
  if (verificationCount > 0) blockers.push(`${verificationCount} verification record(s)`);
  if (surveyCount > 0) blockers.push(`${surveyCount} survey(s)`);
  if (migrationCount > 0) blockers.push(`a previous import`);
  if (blockers.length > 0) {
    res.status(400).json({ error: `Import target must be a freshly created organisation, but "${target.name}" already has ${blockers.join(", ")}. Nothing was imported.` });
    return;
  }

  // Build the settings patch from the export's transferable settings.
  const settingsApplied: Record<string, unknown> = {};
  for (const key of TRANSFERABLE_SETTINGS) {
    if (key in file.org.settings) settingsApplied[key] = file.org.settings[key];
  }

  const preview = {
    sourceOrg: {
      id: file.org.id,
      name: file.org.name,
      type: file.org.type,
      dataSharingMode: file.org.dataSharingMode,
      exportedAt: file.exportedAt,
    },
    targetOrg: { id: target.id, name: target.name, dataSharingMode: target.dataSharingMode },
    willCreate: {
      migratedActivities: file.activities.length,
      settingsApplied: Object.keys(settingsApplied),
      surveyAggregatesPreserved: file.surveyAggregates.length,
    },
    membersInSource: file.members.length,
    membersNote: "Members are never carried over automatically — they re-join the new organisation through its normal join flow" +
      (target.dataSharingMode === "consented_logging" ? " (including the consent step)." : "."),
  };

  if (dryRun) {
    res.json({ ok: true, dryRun: true, preview });
    return;
  }

  const migrationId = randomUUID();
  await db.transaction(async (tx) => {
    // Apply transferable settings onto the fresh org.
    if (Object.keys(settingsApplied).length > 0) {
      await tx.update(organisationsTable)
        .set(settingsApplied as Record<string, never>)
        .where(eq(organisationsTable.id, targetOrgId));
    }
    await tx.insert(orgMigrationsTable).values({
      id: migrationId,
      orgId: targetOrgId,
      sourceOrgId: file.org.id,
      sourceOrgName: file.org.name,
      sourceDataSharingMode: file.org.dataSharingMode,
      exportedAt: new Date(file.exportedAt),
      importedBy: req.user!.id,
      membersInSource: file.members.length,
      activitiesImported: file.activities.length,
      surveyAggregates: file.surveyAggregates,
      settingsApplied,
    });
    if (file.activities.length > 0) {
      const rows = file.activities.map((a) => ({
        id: randomUUID(),
        orgId: targetOrgId,
        migrationId,
        sourceRecordId: a.sourceRecordId,
        memberName: a.memberName,
        memberEmail: a.memberEmail,
        entryDate: new Date(a.entryDate),
        name: a.name,
        totalValue: a.totalValue,
        totalHours: a.totalHours,
        source: a.source,
        verified: a.verified,
        verificationStatus: a.verificationStatus,
        activitiesJson: a.activitiesJson ?? null,
      }));
      for (let i = 0; i < rows.length; i += 500) {
        await tx.insert(orgMigratedActivitiesTable).values(rows.slice(i, i + 500));
      }
    }
    await writeOrgAudit(tx, targetOrgId, req.user!.id, "admin.data_import", "organisation", targetOrgId, {
      migrationId,
      sourceOrgId: file.org.id,
      sourceOrgName: file.org.name,
      activitiesImported: file.activities.length,
      membersInSource: file.members.length,
    });
  });

  res.json({ ok: true, dryRun: false, migrationId, imported: preview.willCreate, preview });
});

export default router;
