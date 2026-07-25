import { Router, type IRouter } from "express";
import { db, usersTable, pageViewsTable, orgRegistrationsTable, organisationsTable, voiceUsageTable } from "@workspace/db";
import { eq, desc, and, sql, inArray } from "drizzle-orm";
import { authenticate, type AuthenticatedRequest } from "../middleware/authenticate.js";
import { getUncachableResendClient } from "../lib/resend.js";
import { randomUUID } from "crypto";
import {
  TRANSCRIBE_SECONDS_CAP,
  TTS_CHARACTERS_CAP,
  currentMonthKey,
  estimateTranscribeCostPence,
  estimateTtsCostPence,
} from "../lib/voiceUsage.js";
import { getMonthlyUsageReport, AI_BUDGET_ALERT_USD } from "../lib/aiUsage.js";
import { isAdminEmail } from "../lib/adminEmails.js";

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

  const requests = await db.select().from(orgRegistrationsTable).orderBy(desc(orgRegistrationsTable.createdAt));
  res.json({ requests });
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

  const { id } = req.params;

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
          <p style="color:#aaa;font-size:11px;margin-top:32px;border-top:1px solid #eee;padding-top:16px;">My Impact · <a href="https://myimpact.replit.app" style="color:#aaa;">myimpact.replit.app</a></p>
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

  const yearMonth = currentMonthKey();
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
    .orderBy(desc(voiceUsageTable.transcribeSeconds), desc(voiceUsageTable.ttsCharacters))
    .limit(50);

  const users = rows
    .map((r) => ({
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
    }))
    .sort((a, b) => b.estimatedCostPence - a.estimatedCostPence);

  res.json({
    yearMonth,
    transcribeSecondsCap: TRANSCRIBE_SECONDS_CAP,
    ttsCharactersCap: TTS_CHARACTERS_CAP,
    users,
  });
});

router.post("/org-requests/:id/reject", authenticate, async (req: AuthenticatedRequest, res) => {
  if (!isAdmin(req.user!.email)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { id } = req.params;

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
  const report = await getMonthlyUsageReport();
  res.json({ ...report, budgetAlertUsd: AI_BUDGET_ALERT_USD });
});

export default router;
