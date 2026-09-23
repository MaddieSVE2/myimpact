import { Router, type IRouter } from "express";
import { db, usersTable, pageViewsTable, orgRegistrationsTable, organisationsTable, orgMembersTable, orgMemberConsentsTable, orgAuditLogTable, challengesTable, voiceUsageTable, emailSuppressionsTable, sidekickTemplateOverridesTable, proxiesTable, localCharitySubmissionsTable, localCharityOverridesTable, type StoredCharityPlace } from "@workspace/db";
import { eq, desc, and, inArray, sql, asc, ilike, count } from "drizzle-orm";
import { invalidateProxyCache } from "../lib/proxyStore.js";
import { normalizeDashboardSections, parseDashboardSectionsInput } from "../lib/orgSharing.js";
import { authenticate, type AuthenticatedRequest } from "../middleware/authenticate.js";
import { getUncachableResendClient, removeFromResendSuppressionList } from "../lib/resend.js";
import { randomUUID } from "crypto";
import {
  TRANSCRIBE_SECONDS_CAP,
  TTS_CHARACTERS_CAP,
  PENCE_PER_TRANSCRIBE_SECOND,
  PENCE_PER_TTS_CHAR,
  currentMonthKey,
  estimateTranscribeCostPence,
  estimateTtsCostPence,
  voiceUsageCostPenceExpr,
} from "../lib/voiceUsage.js";
import { getMonthlyUsageReport, AI_BUDGET_ALERT_USD } from "../lib/aiUsage.js";
import { isAdminEmail } from "../lib/adminEmails.js";
import { normalizeSubmittedUrl } from "../lib/charitySubmissionVerification.js";

const router: IRouter = Router();

// Admin allowlist lives in `lib/adminEmails.ts` and is shared with the
// AI spend-alert recipients. See that module for env-var configuration.
const isAdmin = isAdminEmail;

router.post("/track", authenticate, async (req: AuthenticatedRequest, res) => {
  const { page } = req.body;
  if (!page || typeof page !== "string") {
    res.status(400).json({ error: "page is required" });
    return;
  }

  await db.insert(pageViewsTable).values({
    userId: req.user!.id,
    page: page.trim().slice(0, 100),
  });

  res.json({ ok: true });
});

router.get("/users", authenticate, async (req: AuthenticatedRequest, res) => {
  if (!isAdmin(req.user!.email)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const page = Math.max(1, Math.floor(Number(req.query.page ?? 1)) || 1);
  const limit = Math.min(100, Math.max(1, Math.floor(Number(req.query.limit ?? 50)) || 50));
  const offset = (page - 1) * limit;

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(usersTable);

  const users = await db
    .select()
    .from(usersTable)
    .orderBy(desc(usersTable.createdAt))
    .limit(limit)
    .offset(offset);

  // Summarise "Pages Visited" as distinct-page and total-visit counts for
  // just the users on this page, instead of loading every page_views row.
  const userIds = users.map((u) => u.id);
  const viewSummaries =
    userIds.length > 0
      ? await db
          .select({
            userId: pageViewsTable.userId,
            distinctPages: sql<number>`count(distinct ${pageViewsTable.page})::int`,
            totalViews: sql<number>`count(*)::int`,
            lastVisit: sql<string>`max(${pageViewsTable.visitedAt})`,
          })
          .from(pageViewsTable)
          .where(inArray(pageViewsTable.userId, userIds))
          .groupBy(pageViewsTable.userId)
      : [];

  const summaryByUser = new Map(viewSummaries.map((v) => [v.userId, v]));

  const result = users.map((user) => {
    const s = summaryByUser.get(user.id);
    return {
      id: user.id,
      displayName: user.displayName ?? null,
      email: user.email,
      createdAt: user.createdAt,
      distinctPagesVisited: s?.distinctPages ?? 0,
      totalPageViews: s?.totalViews ?? 0,
      lastVisit: s?.lastVisit ?? null,
    };
  });

  res.json({
    users: result,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
});

router.get("/org-requests", authenticate, async (req: AuthenticatedRequest, res) => {
  if (!isAdmin(req.user!.email)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const page = Math.max(1, Math.floor(Number(req.query.page ?? 1)) || 1);
  const limit = Math.min(100, Math.max(1, Math.floor(Number(req.query.limit ?? 20)) || 20));
  const offset = (page - 1) * limit;

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(orgRegistrationsTable);

  const requests = await db
    .select()
    .from(orgRegistrationsTable)
    .orderBy(desc(orgRegistrationsTable.createdAt))
    .limit(limit)
    .offset(offset);

  res.json({
    requests,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
});

function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function escHtmlAdmin(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
}

router.post("/org-requests/:id/approve", authenticate, async (req: AuthenticatedRequest, res) => {
  if (!isAdmin(req.user!.email)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const id = String(req.params.id);

  const registration = await db.query.orgRegistrationsTable.findFirst({
    where: eq(orgRegistrationsTable.id, id),
  });

  if (!registration) {
    res.status(404).json({ error: "Registration not found" });
    return;
  }

  if (registration.status !== "pending") {
    res.status(400).json({ error: `Registration is already ${registration.status}` });
    return;
  }

  let inviteCode = generateInviteCode();
  const orgId = randomUUID();

  let committed = false;
  for (let attempt = 0; attempt < 5 && !committed; attempt++) {
    if (attempt > 0) inviteCode = generateInviteCode();
    try {
      await db.transaction(async (tx) => {
        await tx.insert(organisationsTable).values({
          id: orgId,
          name: registration.orgName,
          type: registration.type,
          inviteCode,
        });

        const updated = await tx.update(orgRegistrationsTable)
          .set({ status: "approved", inviteCode })
          .where(and(eq(orgRegistrationsTable.id, id), eq(orgRegistrationsTable.status, "pending")))
          .returning({ id: orgRegistrationsTable.id });

        if (updated.length === 0) {
          throw new Error("ALREADY_PROCESSED");
        }
      });
      committed = true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "ALREADY_PROCESSED") {
        res.status(400).json({ error: "Registration has already been processed" });
        return;
      }
      if (attempt < 4 && msg.includes("unique")) {
        continue;
      }
      throw err;
    }
  }

  if (!committed) {
    res.status(500).json({ error: "Failed to generate a unique invite code. Please try again." });
    return;
  }

  let emailWarning: string | undefined;
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    await client.emails.send({
      from: fromEmail,
      to: registration.contactEmail,
      subject: `Your organisation has been approved — My Impact`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;background:#f9f9f9;border-radius:8px;">
          <h2 style="color:#213547;margin-top:0;">Great news, ${escHtmlAdmin(registration.contactName)}!</h2>
          <p style="color:#444;line-height:1.6;margin-top:0;">Your registration for <strong>${escHtmlAdmin(registration.orgName)}</strong> has been approved. You can now invite members to join your organisation on My Impact using the invite code below.</p>
          <div style="background:white;border-radius:8px;padding:24px;margin:24px 0;text-align:center;border:2px solid #E8633A;">
            <p style="color:#555;font-size:13px;margin:0 0 8px;">Your organisation invite code</p>
            <p style="color:#E8633A;font-size:32px;font-weight:bold;letter-spacing:4px;margin:0;">${escHtmlAdmin(inviteCode)}</p>
          </div>
          <p style="color:#444;line-height:1.6;">Share this code with members of <strong>${escHtmlAdmin(registration.orgName)}</strong> so they can join your organisation when they sign up to My Impact.</p>
          <p style="color:#aaa;font-size:11px;margin-top:32px;border-top:1px solid #eee;padding-top:16px;">My Impact · <a href="https://myimpact.uk" style="color:#aaa;">myimpact.uk</a></p>
        </div>
      `,
    });
  } catch (emailErr) {
    console.error("Failed to send approval email:", emailErr);
    emailWarning = "Organisation approved but notification email could not be sent. Please contact the registrant manually.";
  }

  res.json({ ok: true, inviteCode, orgId, ...(emailWarning ? { warning: emailWarning } : {}) });
});

/**
 * Top voice users for the current month, with estimated spend in pence.
 * Used by the admin panel to spot heavy or abusive usage early.
 */
router.get("/voice-usage", authenticate, async (req: AuthenticatedRequest, res) => {
  if (!isAdmin(req.user!.email)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const page = Math.max(1, Math.floor(Number(req.query.page ?? 1)) || 1);
  const limit = Math.min(100, Math.max(1, Math.floor(Number(req.query.limit ?? 50)) || 50));
  const offset = (page - 1) * limit;

  const yearMonth = currentMonthKey();

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(voiceUsageTable)
    .where(eq(voiceUsageTable.yearMonth, yearMonth));

  // Order by estimated cost in SQL so pagination matches the display sort.
  // voiceUsageCostPenceExpr casts the decimal multipliers to numeric —
  // without the cast Postgres throws 22P02 (invalid input syntax for type
  // integer: "0.004"). Regression-tested in tests/voiceUsageCostQuery.test.ts.
  const costExpr = voiceUsageCostPenceExpr();
  const rows = await db
    .select({
      userId: voiceUsageTable.userId,
      yearMonth: voiceUsageTable.yearMonth,
      transcribeSeconds: voiceUsageTable.transcribeSeconds,
      ttsCharacters: voiceUsageTable.ttsCharacters,
      updatedAt: voiceUsageTable.updatedAt,
      email: usersTable.email,
      displayName: usersTable.displayName,
    })
    .from(voiceUsageTable)
    .innerJoin(usersTable, eq(voiceUsageTable.userId, usersTable.id))
    .where(eq(voiceUsageTable.yearMonth, yearMonth))
    .orderBy(desc(costExpr), desc(voiceUsageTable.transcribeSeconds), desc(voiceUsageTable.ttsCharacters))
    .limit(limit)
    .offset(offset);

  const users = rows.map((r) => ({
    userId: r.userId,
    email: r.email,
    displayName: r.displayName,
    yearMonth: r.yearMonth,
    transcribeSeconds: r.transcribeSeconds,
    ttsCharacters: r.ttsCharacters,
    estimatedCostPence:
      estimateTranscribeCostPence(r.transcribeSeconds) +
      estimateTtsCostPence(r.ttsCharacters),
    updatedAt: r.updatedAt,
  }));

  res.json({
    yearMonth,
    transcribeSecondsCap: TRANSCRIBE_SECONDS_CAP,
    ttsCharactersCap: TTS_CHARACTERS_CAP,
    users,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
});

router.post("/org-requests/:id/reject", authenticate, async (req: AuthenticatedRequest, res) => {
  if (!isAdmin(req.user!.email)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const id = String(req.params.id);

  const registration = await db.query.orgRegistrationsTable.findFirst({
    where: eq(orgRegistrationsTable.id, id),
  });

  if (!registration) {
    res.status(404).json({ error: "Registration not found" });
    return;
  }

  if (registration.status !== "pending") {
    res.status(400).json({ error: `Registration is already ${registration.status}` });
    return;
  }

  await db.update(orgRegistrationsTable)
    .set({ status: "rejected" })
    .where(eq(orgRegistrationsTable.id, id));

  res.json({ ok: true });
});

/**
 * Admin-only Sidekick AI usage report for the current UTC month. Returns
 * one row per `user_key` (signed-in users plus anonymous ip:/sess: keys)
 * with question count, tool calls, token totals and an estimated USD
 * cost based on the configured per-1K prices. Sorted descending by cost.
 */
router.get("/ai-usage", authenticate, async (req: AuthenticatedRequest, res) => {
  if (!isAdmin(req.user!.email)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const page = Math.max(1, Math.floor(Number(req.query.page ?? 1)) || 1);
  const limit = Math.min(100, Math.max(1, Math.floor(Number(req.query.limit ?? 50)) || 50));
  const sort = String(req.query.sort ?? "cost");
  const filter = String(req.query.filter ?? "all");

  const report = await getMonthlyUsageReport();

  const callerCount = report.rows.length;
  const signedInCallers = report.rows.filter((r) => r.userKey.startsWith("user:")).length;

  let rows = report.rows;
  if (filter === "user") rows = rows.filter((r) => r.userKey.startsWith("user:"));
  else if (filter === "anon") rows = rows.filter((r) => !r.userKey.startsWith("user:"));

  rows = [...rows].sort((a, b) => {
    if (sort === "questions") return b.questionCount - a.questionCount;
    if (sort === "tokens") return (b.inputTokens + b.outputTokens) - (a.inputTokens + a.outputTokens);
    return b.estimatedCostUsd - a.estimatedCostUsd;
  });

  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const paged = rows.slice((page - 1) * limit, (page - 1) * limit + limit);

  res.json({
    monthStart: report.monthStart,
    monthEnd: report.monthEnd,
    totals: report.totals,
    rows: paged,
    callerCount,
    signedInCallers,
    total,
    page,
    limit,
    totalPages,
    budgetAlertUsd: AI_BUDGET_ALERT_USD,
  });
});

// ── Super-admin organisation management ──────────────────────────────────────

function serializeAdminOrg(org: typeof organisationsTable.$inferSelect, memberCount = 0, totalMembershipCount = memberCount, managerCount = 0) {
  return {
    id: org.id,
    name: org.name,
    type: org.type,
    dataSharingMode: org.dataSharingMode,
    contactName: org.contactName ?? null,
    contactEmail: org.contactEmail ?? null,
    inviteCode: org.inviteCode,
    dashboardSections: normalizeDashboardSections(org.dashboardSections),
    fullTierEnabled: org.fullTierEnabled ?? false,
    revokedAt: org.revokedAt ? org.revokedAt.toISOString() : null,
    createdAt: org.createdAt.toISOString(),
    memberCount,
    totalMembershipCount,
    managerCount,
    hasManager: managerCount > 0,
  };
}

async function fetchOrgMembershipStats(orgId: string) {
  const [row] = await db
    .select({
      count: sql<number>`count(*) FILTER (WHERE ${orgMembersTable.status} = 'active')::int`,
      totalCount: sql<number>`count(*)::int`,
      managerCount: sql<number>`count(*) FILTER (WHERE ${orgMembersTable.status} = 'active' AND ${orgMembersTable.role} = 'manager')::int`,
    })
    .from(orgMembersTable)
    .where(eq(orgMembersTable.orgId, orgId));
  return {
    memberCount: row?.count ?? 0,
    totalMembershipCount: row?.totalCount ?? 0,
    managerCount: row?.managerCount ?? 0,
  };
}

async function serializeAdminOrgWithStats(org: typeof organisationsTable.$inferSelect) {
  const stats = await fetchOrgMembershipStats(org.id);
  return serializeAdminOrg(org, stats.memberCount, stats.totalMembershipCount, stats.managerCount);
}

async function sendActivationEmail(opts: { name: string; contactName: string; contactEmail: string; inviteCode: string }) {
  const { client, fromEmail } = await getUncachableResendClient();
  const appUrl = process.env.APP_URL ?? "https://myimpact.uk";
  await client.emails.send({
    from: fromEmail,
    to: opts.contactEmail,
    subject: `Your organisation is active on My Impact`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;background:#f9f9f9;border-radius:8px;">
        <h2 style="color:#213547;margin-top:0;">Great news, ${escHtmlAdmin(opts.contactName)}!</h2>
        <p style="color:#444;line-height:1.6;margin-top:0;"><strong>${escHtmlAdmin(opts.name)}</strong> is now active on My Impact. Sign in with this email address (${escHtmlAdmin(opts.contactEmail)}) and enter the invite code below to claim your manager seat and start inviting members.</p>
        <div style="background:white;border-radius:8px;padding:24px;margin:24px 0;text-align:center;border:2px solid #E8633A;">
          <p style="color:#555;font-size:13px;margin:0 0 8px;">Your organisation invite code</p>
          <p style="color:#E8633A;font-size:32px;font-weight:bold;letter-spacing:4px;margin:0;">${escHtmlAdmin(opts.inviteCode)}</p>
        </div>
        <p style="color:#444;line-height:1.6;">1. Go to <a href="${appUrl}/org" style="color:#E8633A;">${escHtmlAdmin(appUrl.replace(/^https?:\/\//, ""))}/org</a> and sign in with this email address.<br/>2. Enter the invite code to join as a manager.<br/>3. Share the code with members of <strong>${escHtmlAdmin(opts.name)}</strong> so they can join too.</p>
        <p style="color:#aaa;font-size:11px;margin-top:32px;border-top:1px solid #eee;padding-top:16px;">My Impact · <a href="${appUrl}" style="color:#aaa;">${escHtmlAdmin(appUrl.replace(/^https?:\/\//, ""))}</a></p>
      </div>
    `,
  });
}

router.get("/orgs", authenticate, async (req: AuthenticatedRequest, res) => {
  if (!isAdmin(req.user!.email)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const orgs = await db.select().from(organisationsTable).orderBy(desc(organisationsTable.createdAt));
  const counts = orgs.length > 0
    ? await db
        .select({
          orgId: orgMembersTable.orgId,
          count: sql<number>`count(*) FILTER (WHERE ${orgMembersTable.status} = 'active')::int`,
          totalCount: sql<number>`count(*)::int`,
          managerCount: sql<number>`count(*) FILTER (WHERE ${orgMembersTable.status} = 'active' AND ${orgMembersTable.role} = 'manager')::int`,
        })
        .from(orgMembersTable)
        .where(inArray(orgMembersTable.orgId, orgs.map(o => o.id)))
        .groupBy(orgMembersTable.orgId)
    : [];
  const countMap = new Map(counts.map(c => [c.orgId, c.count]));
  const totalCountMap = new Map(counts.map(c => [c.orgId, c.totalCount]));
  const managerCountMap = new Map(counts.map(c => [c.orgId, c.managerCount]));
  res.json({ orgs: orgs.map(o => serializeAdminOrg(o, countMap.get(o.id) ?? 0, totalCountMap.get(o.id) ?? 0, managerCountMap.get(o.id) ?? 0)) });
});

router.post("/orgs", authenticate, async (req: AuthenticatedRequest, res) => {
  if (!isAdmin(req.user!.email)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const type = typeof body.type === "string" ? body.type.trim() : "";
  const contactName = typeof body.contactName === "string" ? body.contactName.trim() : "";
  const contactEmail = typeof body.contactEmail === "string" ? body.contactEmail.trim().toLowerCase() : "";
  const dataSharingMode = body.dataSharingMode;

  if (!name || !type || !contactName || !contactEmail) {
    res.status(400).json({ error: "name, type, contactName and contactEmail are required" });
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    res.status(400).json({ error: "contactEmail must be a valid email address" });
    return;
  }
  if (dataSharingMode !== "explicit_submission" && dataSharingMode !== "consented_logging") {
    res.status(400).json({ error: "dataSharingMode must be 'explicit_submission' or 'consented_logging'" });
    return;
  }
  const sections = parseDashboardSectionsInput(body.dashboardSections);
  if (sections === "invalid") {
    res.status(400).json({ error: "dashboardSections must be an object of booleans" });
    return;
  }

  const orgId = randomUUID();
  let inviteCode = generateInviteCode();
  let created: typeof organisationsTable.$inferSelect | null = null;
  for (let attempt = 0; attempt < 5 && !created; attempt++) {
    if (attempt > 0) inviteCode = generateInviteCode();
    try {
      const [row] = await db.insert(organisationsTable).values({
        id: orgId,
        name,
        type,
        inviteCode,
        dataSharingMode,
        contactName,
        contactEmail,
        dashboardSections: sections,
      }).returning();
      created = row ?? null;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < 4 && msg.includes("unique")) continue;
      throw err;
    }
  }
  if (!created) {
    res.status(500).json({ error: "Failed to generate a unique invite code. Please try again." });
    return;
  }

  let emailWarning: string | undefined;
  try {
    await sendActivationEmail({ name, contactName, contactEmail, inviteCode: created.inviteCode });
  } catch (emailErr) {
    console.error("[admin.orgs] Failed to send organisation-active email:", emailErr);
    emailWarning = "Organisation created but the notification email could not be sent. Please contact the organisation contact manually.";
  }

  res.json({ ok: true, org: serializeAdminOrg(created), ...(emailWarning ? { warning: emailWarning } : {}) });
});

// Edit name, contact details and dashboard sections. The data-sharing mode is
// deliberately NOT editable after creation.
router.patch("/orgs/:id", authenticate, async (req: AuthenticatedRequest, res) => {
  if (!isAdmin(req.user!.email)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const id = String(req.params.id);
  const body = (req.body ?? {}) as Record<string, unknown>;

  const updates: Partial<{ name: string; contactName: string; contactEmail: string; dashboardSections: unknown; fullTierEnabled: boolean }> = {};
  if ("name" in body) {
    if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 200) {
      res.status(400).json({ error: "name must be between 1 and 200 characters" });
      return;
    }
    updates.name = body.name.trim();
  }
  if ("contactName" in body) {
    if (typeof body.contactName !== "string" || !body.contactName.trim()) {
      res.status(400).json({ error: "contactName must be a non-empty string" });
      return;
    }
    updates.contactName = body.contactName.trim();
  }
  if ("contactEmail" in body) {
    const v = typeof body.contactEmail === "string" ? body.contactEmail.trim().toLowerCase() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
      res.status(400).json({ error: "contactEmail must be a valid email address" });
      return;
    }
    updates.contactEmail = v;
  }
  if ("dashboardSections" in body) {
    const sections = parseDashboardSectionsInput(body.dashboardSections);
    if (sections === "invalid") {
      res.status(400).json({ error: "dashboardSections must be an object of booleans" });
      return;
    }
    updates.dashboardSections = sections;
  }
  if ("fullTierEnabled" in body) {
    if (typeof body.fullTierEnabled !== "boolean") {
      res.status(400).json({ error: "fullTierEnabled must be a boolean" });
      return;
    }
    updates.fullTierEnabled = body.fullTierEnabled;
  }
  if ("dataSharingMode" in body) {
    res.status(400).json({ error: "An organisation's data-sharing type cannot be changed after creation." });
    return;
  }
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No valid fields to update" });
    return;
  }

  const [updated] = await db.update(organisationsTable).set(updates).where(eq(organisationsTable.id, id)).returning();
  if (!updated) {
    res.status(404).json({ error: "Organisation not found" });
    return;
  }
  res.json({ ok: true, org: await serializeAdminOrgWithStats(updated) });
});

// Superadmin cleanup of a single organisation's test challenges. The
// org-scoped route never permits deleting a challenge from another org.
router.get("/orgs/:id/challenges", authenticate, async (req: AuthenticatedRequest, res) => {
  if (!isAdmin(req.user!.email)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const orgId = String(req.params.id);
  const [org] = await db.select({ id: organisationsTable.id }).from(organisationsTable)
    .where(eq(organisationsTable.id, orgId)).limit(1);
  if (!org) {
    res.status(404).json({ error: "Organisation not found" });
    return;
  }
  const challenges = await db.select({
    id: challengesTable.id,
    name: challengesTable.name,
    startDate: challengesTable.startDate,
    endDate: challengesTable.endDate,
  }).from(challengesTable)
    .where(and(eq(challengesTable.orgId, orgId), eq(challengesTable.scope, "org")))
    .orderBy(desc(challengesTable.createdAt));
  res.json({ challenges });
});

router.delete("/orgs/:id/challenges/:challengeId", authenticate, async (req: AuthenticatedRequest, res) => {
  if (!isAdmin(req.user!.email)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const orgId = String(req.params.id);
  const challengeId = String(req.params.challengeId);
  const removed = await db.transaction(async tx => {
    const [challenge] = await tx.delete(challengesTable)
      .where(and(eq(challengesTable.id, challengeId), eq(challengesTable.orgId, orgId), eq(challengesTable.scope, "org")))
      .returning({ id: challengesTable.id, name: challengesTable.name });
    if (challenge) {
      await tx.insert(orgAuditLogTable).values({
        orgId,
        actorUserId: req.user!.id,
        action: "challenge.deleted_by_admin",
        targetType: "challenge",
        targetId: challenge.id,
        metadata: { name: challenge.name },
      });
    }
    return challenge;
  });
  if (!removed) {
    res.status(404).json({ error: "Challenge not found in this organisation" });
    return;
  }
  res.json({ ok: true });
});

// Superadmin: list an organisation's members (all statuses) with user details.
router.get("/orgs/:id/members", authenticate, async (req: AuthenticatedRequest, res) => {
  if (!isAdmin(req.user!.email)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const orgId = String(req.params.id);
  const org = await db.query.organisationsTable.findFirst({ where: eq(organisationsTable.id, orgId) });
  if (!org) {
    res.status(404).json({ error: "Organisation not found" });
    return;
  }

  const rows = await db
    .select({
      userId: orgMembersTable.userId,
      role: orgMembersTable.role,
      status: orgMembersTable.status,
      joinedAt: orgMembersTable.joinedAt,
      email: usersTable.email,
      displayName: usersTable.displayName,
    })
    .from(orgMembersTable)
    .leftJoin(usersTable, eq(orgMembersTable.userId, usersTable.id))
    .where(eq(orgMembersTable.orgId, orgId))
    .orderBy(asc(orgMembersTable.joinedAt));

  res.json({
    members: rows.map(r => ({
      userId: r.userId,
      name: r.displayName ?? r.email ?? r.userId,
      email: r.email ?? "",
      role: r.role,
      status: r.status,
      joinedAt: r.joinedAt.toISOString(),
    })),
  });
});

// Superadmin: remove a member (any role) from an organisation. Org data is
// left intact; any active data-sharing consent is marked withdrawn.
router.delete("/orgs/:id/members/:userId", authenticate, async (req: AuthenticatedRequest, res) => {
  if (!isAdmin(req.user!.email)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const orgId = String(req.params.id);
  const userId = String(req.params.userId);

  const org = await db.query.organisationsTable.findFirst({ where: eq(organisationsTable.id, orgId) });
  if (!org) {
    res.status(404).json({ error: "Organisation not found" });
    return;
  }
  const membership = await db.query.orgMembersTable.findFirst({
    where: and(eq(orgMembersTable.orgId, orgId), eq(orgMembersTable.userId, userId)),
  });
  if (!membership) {
    res.status(404).json({ error: "Member not found in this organisation" });
    return;
  }

  await db.delete(orgMembersTable).where(
    and(eq(orgMembersTable.orgId, orgId), eq(orgMembersTable.userId, userId)),
  );

  const consent = await db.query.orgMemberConsentsTable.findFirst({
    where: and(eq(orgMemberConsentsTable.orgId, orgId), eq(orgMemberConsentsTable.userId, userId)),
  });
  if (consent && consent.status === "active") {
    await db.update(orgMemberConsentsTable)
      .set({ status: "withdrawn", withdrawnAt: new Date() })
      .where(eq(orgMemberConsentsTable.id, consent.id));
  }

  await db.insert(orgAuditLogTable).values({
    orgId,
    actorUserId: req.user!.id,
    action: "member.removed_by_admin",
    targetType: "member",
    targetId: userId,
    metadata: { role: membership.role, status: membership.status },
  }).catch(err => console.error("[admin.orgs] failed to write audit log:", err));

  const updated = await db.query.organisationsTable.findFirst({ where: eq(organisationsTable.id, orgId) });
  res.json({ ok: true, org: updated ? await serializeAdminOrgWithStats(updated) : null });
});

router.post("/orgs/:id/revoke", authenticate, async (req: AuthenticatedRequest, res) => {
  if (!isAdmin(req.user!.email)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const id = String(req.params.id);
  const org = await db.query.organisationsTable.findFirst({ where: eq(organisationsTable.id, id) });
  if (!org) {
    res.status(404).json({ error: "Organisation not found" });
    return;
  }
  if (org.revokedAt) {
    res.status(400).json({ error: "Organisation is already revoked" });
    return;
  }

  const revokedAt = new Date();
  const [updated] = await db.update(organisationsTable)
    .set({ revokedAt })
    .where(eq(organisationsTable.id, id))
    .returning();

  let emailWarning: string | undefined;
  if (org.contactEmail && process.env.E2E_TEST_MODE !== "1") {
    const deletionDate = new Date(revokedAt.getTime() + 180 * 24 * 60 * 60 * 1000);
    const deletionDateStr = deletionDate.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    try {
      const { client, fromEmail } = await getUncachableResendClient();
      await client.emails.send({
        from: fromEmail,
        to: org.contactEmail,
        subject: `Your organisation's My Impact access has been revoked`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;background:#f9f9f9;border-radius:8px;">
            <h2 style="color:#213547;margin-top:0;">Access revoked for ${escHtmlAdmin(org.name)}</h2>
            <p style="color:#444;line-height:1.6;">Hello${org.contactName ? " " + escHtmlAdmin(org.contactName) : ""},</p>
            <p style="color:#444;line-height:1.6;">Access to the My Impact organisation dashboard and API for <strong>${escHtmlAdmin(org.name)}</strong> has been revoked. Your managers can no longer sign in to the organisation dashboard.</p>
            <div style="background:white;border-radius:8px;padding:20px;margin:24px 0;border:2px solid #E8633A;">
              <p style="color:#213547;font-size:14px;line-height:1.6;margin:0;"><strong>Your data is retained for 180 days.</strong> You can request a copy of your organisation's data at any time before <strong>${deletionDateStr}</strong>, after which it becomes eligible for deletion.</p>
            </div>
            <p style="color:#444;line-height:1.6;">To request your data or if you believe this was a mistake, reply to this email or contact <a href="mailto:hello@myimpact.uk" style="color:#E8633A;">hello@myimpact.uk</a>.</p>
            <p style="color:#aaa;font-size:11px;margin-top:32px;border-top:1px solid #eee;padding-top:16px;">My Impact · <a href="https://myimpact.uk" style="color:#aaa;">myimpact.uk</a></p>
          </div>
        `,
      });
    } catch (emailErr) {
      console.error("Failed to send revocation email:", emailErr);
      emailWarning = "Organisation revoked but the notification email could not be sent. Please contact the organisation manually.";
    }
  } else if (!org.contactEmail) {
    emailWarning = "Organisation revoked, but no contact email is on file — please notify them manually.";
  }

  res.json({ ok: true, org: updated ? await serializeAdminOrgWithStats(updated) : null, ...(emailWarning ? { warning: emailWarning } : {}) });
});

// Re-send the "your organisation is active" activation email — used to chase
// up organisations whose contact hasn't yet claimed their manager seat.
router.post("/orgs/:id/resend-activation", authenticate, async (req: AuthenticatedRequest, res) => {
  if (!isAdmin(req.user!.email)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const id = String(req.params.id);
  const org = await db.query.organisationsTable.findFirst({ where: eq(organisationsTable.id, id) });
  if (!org) {
    res.status(404).json({ error: "Organisation not found" });
    return;
  }
  if (org.revokedAt) {
    res.status(400).json({ error: "This organisation has been revoked, so the activation email can't be re-sent." });
    return;
  }
  if (!org.contactEmail) {
    res.status(400).json({ error: "No contact email is on file for this organisation." });
    return;
  }
  const [managers] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(orgMembersTable)
    .where(and(
      eq(orgMembersTable.orgId, id),
      eq(orgMembersTable.status, "active"),
      eq(orgMembersTable.role, "manager"),
    ));
  if ((managers?.count ?? 0) > 0) {
    res.status(400).json({ error: "This organisation already has an active manager, so the activation email doesn't need re-sending." });
    return;
  }

  try {
    await sendActivationEmail({
      name: org.name,
      contactName: org.contactName ?? "there",
      contactEmail: org.contactEmail,
      inviteCode: org.inviteCode,
    });
  } catch (emailErr) {
    console.error("[admin.orgs] Failed to re-send organisation-active email:", emailErr);
    res.status(502).json({ error: "The activation email could not be sent. Please try again or contact the organisation manually." });
    return;
  }

  res.json({ ok: true, sentTo: org.contactEmail });
});

// ── Suppressed email addresses ──────────────────────────────────────────────
// Resend reports bounces/complaints/suppressions via webhook; the addresses
// land in email_suppressions and block future magic-link sends. These routes
// give the site owner visibility and a way to clear an address once the
// underlying issue (typo, full mailbox, etc.) is fixed.

router.get("/suppressed-emails", authenticate, async (req: AuthenticatedRequest, res) => {
  if (!isAdmin(req.user!.email)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const rows = await db
    .select()
    .from(emailSuppressionsTable)
    .orderBy(desc(emailSuppressionsTable.lastEventAt));
  res.json({
    suppressions: rows.map((r) => ({
      email: r.email,
      eventType: r.eventType,
      reason: r.reason,
      firstEventAt: r.firstEventAt,
      lastEventAt: r.lastEventAt,
    })),
  });
});

router.delete("/suppressed-emails/:email", authenticate, async (req: AuthenticatedRequest, res) => {
  if (!isAdmin(req.user!.email)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const email = String(req.params.email ?? "").trim().toLowerCase();
  if (!email.includes("@")) {
    res.status(400).json({ error: "A valid email address is required" });
    return;
  }
  const existing = await db.query.emailSuppressionsTable.findFirst({
    where: eq(emailSuppressionsTable.email, email),
  });
  if (!existing) {
    res.status(404).json({ error: "This address is not on the suppression list." });
    return;
  }

  // Remove from Resend's suppression list FIRST — if that fails we keep the
  // local record so the admin sees the address is still blocked upstream.
  const result = await removeFromResendSuppressionList(email);
  if (!result.ok) {
    console.error(`[admin] failed to clear Resend suppression for ${email}:`, result.error);
    res.status(502).json({
      error:
        "Couldn't remove this address from Resend's suppression list. Please try again or clear it in the Resend dashboard.",
    });
    return;
  }

  await db.delete(emailSuppressionsTable).where(eq(emailSuppressionsTable.email, email));
  res.json({ ok: true });
});

// ---- Sidekick template copy overrides -----------------------------------
//
// Defaults live in the web app's `sidekick-templates.ts`. Admins can override
// the label / description / persona prompt copy per template; rows here are
// merged over the defaults at runtime. Deleting a row resets to default.

const SIDEKICK_TEMPLATE_IDS = new Set([
  "ucas_paragraph",
  "linkedin_post",
  "cv_bullets",
  "cover_letter_line",
  "employer_one_liner",
  "dofe_writeup",
]);

const SIDEKICK_PERSONAS = new Set([
  "default",
  "veteran",
  "carer",
  "student",
  "apprenticeship",
  "career_break",
  "org_manager",
]);

const MAX_COPY_LENGTH = 4000;

router.get("/sidekick-templates", authenticate, async (req: AuthenticatedRequest, res) => {
  if (!isAdmin(req.user!.email)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const rows = await db.select().from(sidekickTemplateOverridesTable);
  res.json({ overrides: rows });
});

router.put("/sidekick-templates/:id", authenticate, async (req: AuthenticatedRequest, res) => {
  if (!isAdmin(req.user!.email)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const templateId = String(req.params.id ?? "");
  if (!SIDEKICK_TEMPLATE_IDS.has(templateId)) {
    res.status(404).json({ error: "Unknown template id" });
    return;
  }

  const { label, description, personaPrompts } = req.body ?? {};

  const cleanText = (value: unknown, field: string): string | null => {
    if (value == null || value === "") return null;
    if (typeof value !== "string") throw new Error(`${field} must be a string`);
    if (value.length > MAX_COPY_LENGTH) throw new Error(`${field} is too long (max ${MAX_COPY_LENGTH} characters)`);
    return value;
  };

  let cleanLabel: string | null;
  let cleanDescription: string | null;
  let cleanPrompts: Record<string, string> | null = null;
  try {
    cleanLabel = cleanText(label, "label");
    cleanDescription = cleanText(description, "description");
    if (personaPrompts != null) {
      if (typeof personaPrompts !== "object" || Array.isArray(personaPrompts)) {
        throw new Error("personaPrompts must be an object");
      }
      const entries: Record<string, string> = {};
      for (const [persona, prompt] of Object.entries(personaPrompts)) {
        if (!SIDEKICK_PERSONAS.has(persona)) continue;
        const cleaned = cleanText(prompt, `personaPrompts.${persona}`);
        if (cleaned && cleaned.trim().length > 0) entries[persona] = cleaned;
      }
      cleanPrompts = Object.keys(entries).length > 0 ? entries : null;
    }
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Invalid input" });
    return;
  }

  if (cleanLabel == null && cleanDescription == null && cleanPrompts == null) {
    // Nothing overridden — treat as a reset.
    await db
      .delete(sidekickTemplateOverridesTable)
      .where(eq(sidekickTemplateOverridesTable.templateId, templateId));
    res.json({ ok: true, override: null });
    return;
  }

  const values = {
    templateId,
    label: cleanLabel,
    description: cleanDescription,
    personaPrompts: cleanPrompts,
    updatedBy: req.user!.email,
    updatedAt: new Date(),
  };
  const [row] = await db
    .insert(sidekickTemplateOverridesTable)
    .values(values)
    .onConflictDoUpdate({
      target: sidekickTemplateOverridesTable.templateId,
      set: {
        label: values.label,
        description: values.description,
        personaPrompts: values.personaPrompts,
        updatedBy: values.updatedBy,
        updatedAt: values.updatedAt,
      },
    })
    .returning();
  res.json({ ok: true, override: row });
});

router.delete("/sidekick-templates/:id", authenticate, async (req: AuthenticatedRequest, res) => {
  if (!isAdmin(req.user!.email)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const templateId = String(req.params.id ?? "");
  if (!SIDEKICK_TEMPLATE_IDS.has(templateId)) {
    res.status(404).json({ error: "Unknown template id" });
    return;
  }
  await db
    .delete(sidekickTemplateOverridesTable)
    .where(eq(sidekickTemplateOverridesTable.templateId, templateId));
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Financial proxy management (super-admin)
// ---------------------------------------------------------------------------

const VALID_HORIZONS = new Set(["per_instance", "annual", "multi_year", "lifetime"]);
const VALID_UNITS = new Set(["hour", "session", "person", "item", "household"]);

router.get("/proxies", authenticate, async (req: AuthenticatedRequest, res) => {
  if (!isAdmin(req.user!.email)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const search = String(req.query.search ?? "").trim();
  const horizon = String(req.query.horizon ?? "").trim();
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10) || 50));

  const conditions = [];
  if (search) conditions.push(ilike(proxiesTable.title, `%${search}%`));
  if (horizon && VALID_HORIZONS.has(horizon)) conditions.push(eq(proxiesTable.horizon, horizon));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [proxies, [{ total }]] = await Promise.all([
    db
      .select()
      .from(proxiesTable)
      .where(where)
      .orderBy(asc(sql`lower(${proxiesTable.title})`))
      .limit(limit)
      .offset((page - 1) * limit),
    db.select({ total: count() }).from(proxiesTable).where(where),
  ]);

  res.json({ proxies, total, page, limit });
});

router.put("/proxies/:id", authenticate, async (req: AuthenticatedRequest, res) => {
  if (!isAdmin(req.user!.email)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const updates: Record<string, unknown> = {};
  const { deflationFactor, allowedUnits, enabled, value, horizon } = req.body ?? {};

  if (deflationFactor !== undefined) {
    const f = Number(deflationFactor);
    if (!Number.isFinite(f) || f <= 0 || f > 1) {
      res.status(400).json({ error: "deflationFactor must be a number in (0, 1]" });
      return;
    }
    updates.deflationFactor = f;
  }
  if (allowedUnits !== undefined) {
    if (!Array.isArray(allowedUnits) || allowedUnits.length === 0 || !allowedUnits.every((u) => typeof u === "string" && VALID_UNITS.has(u))) {
      res.status(400).json({ error: `allowedUnits must be a non-empty array of: ${[...VALID_UNITS].join(", ")}` });
      return;
    }
    updates.allowedUnits = allowedUnits;
  }
  if (enabled !== undefined) {
    if (typeof enabled !== "boolean") {
      res.status(400).json({ error: "enabled must be a boolean" });
      return;
    }
    updates.enabled = enabled;
  }
  if (value !== undefined) {
    const v = Number(value);
    if (!Number.isFinite(v) || v <= 0) {
      res.status(400).json({ error: "value must be a positive number" });
      return;
    }
    updates.value = String(v);
  }
  if (horizon !== undefined) {
    if (typeof horizon !== "string" || !VALID_HORIZONS.has(horizon)) {
      res.status(400).json({ error: `horizon must be one of: ${[...VALID_HORIZONS].join(", ")}` });
      return;
    }
    updates.horizon = horizon;
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No valid fields to update" });
    return;
  }

  updates.updatedBy = req.user!.email;
  updates.updatedAt = new Date();

  const [row] = await db.update(proxiesTable).set(updates).where(eq(proxiesTable.id, id)).returning();
  if (!row) {
    res.status(404).json({ error: "Proxy not found" });
    return;
  }
  invalidateProxyCache();
  res.json({ ok: true, proxy: row });
});

// ── Local charity submissions review queue ──────────────────────────────────

router.get("/charity-submissions", authenticate, async (req: AuthenticatedRequest, res) => {
  if (!isAdmin(req.user!.email)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const page = Math.max(1, Math.floor(Number(req.query.page ?? 1)) || 1);
  const limit = Math.min(100, Math.max(1, Math.floor(Number(req.query.limit ?? 20)) || 20));
  const offset = (page - 1) * limit;

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(localCharitySubmissionsTable);

  const rows = await db
    .select({
      submission: localCharitySubmissionsTable,
      reporterEmail: usersTable.email,
      reporterName: usersTable.displayName,
    })
    .from(localCharitySubmissionsTable)
    .leftJoin(usersTable, eq(localCharitySubmissionsTable.userId, usersTable.id))
    .orderBy(
      // Pending reviews first, then newest first.
      sql`case when ${localCharitySubmissionsTable.status} = 'needs_review' then 0 else 1 end`,
      desc(localCharitySubmissionsTable.createdAt),
    )
    .limit(limit)
    .offset(offset);

  res.json({
    submissions: rows.map((r) => ({
      id: r.submission.id,
      type: r.submission.type,
      localAuthority: r.submission.localAuthority,
      country: r.submission.country,
      category: r.submission.category,
      charityName: r.submission.charityName,
      issueType: r.submission.issueType,
      submittedWebsite: r.submission.submittedWebsite,
      note: r.submission.note,
      status: r.submission.status,
      verificationDetail: r.submission.verificationDetail,
      createdAt: r.submission.createdAt,
      reporterEmail: r.reporterEmail ?? null,
      reporterName: r.reporterName ?? null,
    })),
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
});

/**
 * Approve a needs-review charity submission. Applies the correction or
 * suggestion as an override (same mechanism the auto-verification path
 * uses), then marks the submission approved.
 */
router.post("/charity-submissions/:id/approve", authenticate, async (req: AuthenticatedRequest, res) => {
  if (!isAdmin(req.user!.email)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  try {
    const [submission] = await db
      .select()
      .from(localCharitySubmissionsTable)
      .where(eq(localCharitySubmissionsTable.id, req.params.id))
      .limit(1);

    if (!submission) {
      res.status(404).json({ error: "Submission not found" });
      return;
    }
    if (submission.status !== "needs_review") {
      res.status(409).json({ error: `Submission has already been ${submission.status.replace("_", " ")}` });
      return;
    }

    // Work out what change (if any) approval applies, then write the
    // override and the status update atomically in one transaction.
    let appliedChange = "";
    let overrideValues: typeof localCharityOverridesTable.$inferInsert | null = null;

    if (submission.type === "correction") {
      if (submission.issueType === "wrong_website" && submission.submittedWebsite) {
        const url = normalizeSubmittedUrl(submission.submittedWebsite);
        if (!url) {
          res.status(400).json({ error: "Submitted website is not a valid web address, so it cannot be applied. Reject the submission instead." });
          return;
        }
        overrideValues = {
          localAuthority: submission.localAuthority,
          targetName: submission.charityName,
          kind: "patch",
          patch: { website: url },
        };
        appliedChange = `Website updated to ${url}`;
      } else if (submission.issueType === "closed") {
        overrideValues = {
          localAuthority: submission.localAuthority,
          targetName: submission.charityName,
          kind: "remove",
        };
        appliedChange = "Charity removed from suggestions";
      } else if (submission.issueType === "wrong_description" && submission.note) {
        overrideValues = {
          localAuthority: submission.localAuthority,
          targetName: submission.charityName,
          kind: "patch",
          patch: { description: submission.note.slice(0, 140) },
        };
        appliedChange = "Description updated from the reporter's note";
      } else {
        // No automatic change is derivable (e.g. issue type "other" or a
        // description report with no note); the decision is still recorded.
        appliedChange = "";
      }
    } else if (submission.type === "suggestion") {
      const website = submission.submittedWebsite
        ? (normalizeSubmittedUrl(submission.submittedWebsite) ?? undefined)
        : undefined;
      const place: StoredCharityPlace = {
        name: submission.charityName,
        description: submission.note
          ? submission.note.slice(0, 140)
          : "Suggested by a local volunteer.",
        howToJoin: "Contact them to ask about volunteering opportunities.",
        website,
        source: "community",
        verified: false,
      };
      overrideValues = {
        localAuthority: submission.localAuthority,
        category: submission.category || "Community",
        kind: "add",
        place,
      };
      appliedChange = "Charity added to local suggestions";
    } else {
      res.status(400).json({ error: `Unknown submission type: ${submission.type}` });
      return;
    }

    const detailSuffix = appliedChange
      ? `Approved by admin — ${appliedChange}`
      : "Approved by admin — no automatic change applied";
    await db.transaction(async (tx) => {
      if (overrideValues) {
        await tx.insert(localCharityOverridesTable).values(overrideValues);
      }
      await tx
        .update(localCharitySubmissionsTable)
        .set({
          status: "approved",
          verificationDetail: submission.verificationDetail
            ? `${submission.verificationDetail}. ${detailSuffix}`
            : detailSuffix,
        })
        .where(eq(localCharitySubmissionsTable.id, submission.id));
    });

    res.json({
      ok: true,
      status: "approved",
      appliedChange: appliedChange || null,
      warning: appliedChange
        ? undefined
        : "Approved, but no automatic change could be applied for this issue type — apply any fix manually if needed.",
    });
  } catch (err) {
    console.error("[admin] charity submission approve error:", err);
    res.status(500).json({ error: "Failed to approve submission" });
  }
});

/** Reject a needs-review charity submission (records the decision, changes nothing else). */
router.post("/charity-submissions/:id/reject", authenticate, async (req: AuthenticatedRequest, res) => {
  if (!isAdmin(req.user!.email)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  try {
    const [submission] = await db
      .select()
      .from(localCharitySubmissionsTable)
      .where(eq(localCharitySubmissionsTable.id, req.params.id))
      .limit(1);

    if (!submission) {
      res.status(404).json({ error: "Submission not found" });
      return;
    }
    if (submission.status !== "needs_review") {
      res.status(409).json({ error: `Submission has already been ${submission.status.replace("_", " ")}` });
      return;
    }

    await db
      .update(localCharitySubmissionsTable)
      .set({
        status: "rejected",
        verificationDetail: submission.verificationDetail
          ? `${submission.verificationDetail}. Rejected by admin`
          : "Rejected by admin",
      })
      .where(eq(localCharitySubmissionsTable.id, submission.id));

    res.json({ ok: true, status: "rejected" });
  } catch (err) {
    console.error("[admin] charity submission reject error:", err);
    res.status(500).json({ error: "Failed to reject submission" });
  }
});

export default router;
