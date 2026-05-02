import { Router, type IRouter } from "express";
import { db, organisationsTable, orgMembersTable, impactRecordsTable, orgRegistrationsTable, orgMatchRatesTable, orgShareLinksTable, orgSsoConfigsTable } from "@workspace/db";
import { eq, and, inArray, gte, lte, asc, desc, isNull } from "drizzle-orm";
import { randomUUID, randomBytes } from "crypto";
import { authenticate, type AuthenticatedRequest } from "../middleware/authenticate.js";
import { getUncachableResendClient } from "../lib/resend.js";
import { renderToBuffer } from "@react-pdf/renderer";
import { buildOrgDocument } from "../lib/orgPdf.js";
import React from "react";
import { createRateLimiter } from "../lib/rateLimiter.js";
import { computeMatchesForRecords, type RecordForMatch } from "../lib/orgMatch.js";
import { enqueueOrgEvent } from "../lib/webhookDispatcher.js";
import { trackServerEvent } from "../lib/analytics.js";
import { featureCap } from "../lib/featureFlags.js";
import { configuredProviders, isProviderConfigured, normalizeDomain, type SsoProvider } from "../lib/oidc.js";

const router: IRouter = Router();

const orgRegisterRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Too many registration requests. Please wait before trying again.",
});

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
}

router.post("/register", orgRegisterRateLimit, async (req, res) => {
  const { orgName, type, contactName, contactEmail, size, purpose } = req.body;
  if (!orgName || !type || !contactName || !contactEmail) {
    res.status(400).json({ error: "Required fields missing" });
    return;
  }

  try {
    await db.insert(orgRegistrationsTable).values({
      id: randomUUID(),
      orgName,
      type,
      contactName,
      contactEmail,
      size: size || null,
      purpose: purpose || null,
      status: "pending",
    });
  } catch (dbErr) {
    console.error("Failed to save org registration to DB:", dbErr);
    res.status(500).json({ error: "Failed to save registration. Please try again." });
    return;
  }

  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const { error: sendError } = await client.emails.send({
      from: fromEmail,
      to: "hello@myimpact.uk",
      replyTo: contactEmail,
      subject: `New organisation registration: ${escHtml(orgName)}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;background:#f9f9f9;border-radius:8px;">
          <h2 style="color:#213547;margin-top:0;">New Organisation Registration Request</h2>
          <table style="width:100%;border-collapse:collapse;margin-top:16px;background:white;border-radius:8px;overflow:hidden;">
            <tr style="background:#f7f5ef;"><td style="padding:12px 16px;color:#555;width:160px;font-size:13px;"><strong>Organisation</strong></td><td style="padding:12px 16px;color:#213547;font-size:14px;">${escHtml(orgName)}</td></tr>
            <tr><td style="padding:12px 16px;color:#555;font-size:13px;"><strong>Type</strong></td><td style="padding:12px 16px;color:#213547;font-size:14px;">${escHtml(type)}</td></tr>
            <tr style="background:#f7f5ef;"><td style="padding:12px 16px;color:#555;font-size:13px;"><strong>Contact name</strong></td><td style="padding:12px 16px;color:#213547;font-size:14px;">${escHtml(contactName)}</td></tr>
            <tr><td style="padding:12px 16px;color:#555;font-size:13px;"><strong>Contact email</strong></td><td style="padding:12px 16px;font-size:14px;"><a href="mailto:${escHtml(contactEmail)}" style="color:#E8633A;">${escHtml(contactEmail)}</a></td></tr>
            <tr style="background:#f7f5ef;"><td style="padding:12px 16px;color:#555;font-size:13px;"><strong>Approx size</strong></td><td style="padding:12px 16px;color:#213547;font-size:14px;">${escHtml(size || "Not specified")}</td></tr>
            <tr><td style="padding:12px 16px;color:#555;font-size:13px;vertical-align:top;"><strong>Purpose</strong></td><td style="padding:12px 16px;color:#213547;font-size:14px;line-height:1.5;">${escHtml(purpose || "Not provided")}</td></tr>
          </table>
          <p style="color:#aaa;font-size:11px;margin-top:24px;">Sent from My Impact · myimpact.replit.com</p>
        </div>
      `,
    });
    if (sendError) {
      console.error("Resend error sending org registration:", sendError);
      res.status(500).json({ error: "Failed to send registration. Please try again." });
      return;
    }
  } catch (err) {
    console.error("Org registration email error:", err);
    res.status(500).json({ error: "Failed to send registration. Please try again." });
    return;
  }

  res.json({ ok: true });
});

router.get("/list", authenticate, async (_req: AuthenticatedRequest, res) => {
  const orgs = await db.query.organisationsTable.findMany({
    columns: { id: true, name: true },
    orderBy: (t, { asc }) => [asc(t.name)],
  });
  res.json({ orgs });
});

router.post("/validate-invite", authenticate, async (req: AuthenticatedRequest, res) => {
  const { inviteCode, orgId } = req.body;
  if (!inviteCode || typeof inviteCode !== "string") {
    res.status(400).json({ error: "Invite code is required" });
    return;
  }
  if (!orgId || typeof orgId !== "string") {
    res.status(400).json({ error: "Organisation selection is required" });
    return;
  }

  const org = await db.query.organisationsTable.findFirst({
    where: and(
      eq(organisationsTable.inviteCode, inviteCode.trim().toUpperCase()),
      eq(organisationsTable.id, orgId),
    ),
  });

  if (!org) {
    res.status(400).json({ error: "That code does not match the selected organisation. Please check with your admin and try again." });
    return;
  }

  const userId = req.user!.id;

  const otherMembership = await db.query.orgMembersTable.findFirst({
    where: eq(orgMembersTable.userId, userId),
  });
  if (otherMembership) {
    res.status(409).json({ error: "You're already a member of an organisation." });
    return;
  }

  res.json({ ok: true, orgName: org.name, orgId: org.id });
});

router.post("/join", authenticate, async (req: AuthenticatedRequest, res) => {
  const { inviteCode, orgId } = req.body;
  if (!inviteCode || typeof inviteCode !== "string") {
    res.status(400).json({ error: "Invite code is required" });
    return;
  }
  if (!orgId || typeof orgId !== "string") {
    res.status(400).json({ error: "Organisation selection is required" });
    return;
  }

  const org = await db.query.organisationsTable.findFirst({
    where: and(
      eq(organisationsTable.inviteCode, inviteCode.trim().toUpperCase()),
      eq(organisationsTable.id, orgId),
    ),
  });

  if (!org) {
    res.status(400).json({ error: "That code does not match the selected organisation. Please check with your admin and try again." });
    return;
  }

  const userId = req.user!.id;
  const userEmail = req.user!.email;

  const registration = await db.query.orgRegistrationsTable.findFirst({
    where: and(
      eq(orgRegistrationsTable.inviteCode, inviteCode.trim().toUpperCase()),
      eq(orgRegistrationsTable.status, "approved"),
    ),
    columns: { contactEmail: true },
  });

  const shouldBeManager = registration?.contactEmail?.toLowerCase() === userEmail.toLowerCase();
  const role = shouldBeManager ? "manager" : "member";

  const existing = await db.query.orgMembersTable.findFirst({
    where: (t, { and }) => and(eq(t.orgId, org.id), eq(t.userId, userId)),
  });

  if (existing) {
    if (shouldBeManager && existing.role !== "manager") {
      await db.update(orgMembersTable)
        .set({ role: "manager" })
        .where(and(eq(orgMembersTable.orgId, org.id), eq(orgMembersTable.userId, userId)));
    }
    res.json({ ok: true, orgName: org.name, alreadyMember: true });
    return;
  }

  const otherMembership = await db.query.orgMembersTable.findFirst({
    where: eq(orgMembersTable.userId, userId),
  });
  if (otherMembership) {
    res.status(409).json({ error: "You're already a member of an organisation." });
    return;
  }

  await db.insert(orgMembersTable).values({ orgId: org.id, userId, role });

  enqueueOrgEvent({
    orgId: org.id,
    eventType: "member.joined",
    payload: {
      member: { ref: userId, email: userEmail },
      role,
      joinedAt: new Date().toISOString(),
    },
  }).catch(err => console.error("[org.join] failed to enqueue member.joined:", err));

  trackServerEvent({
    eventName: "org_invite_accepted",
    userId,
    surface: "org",
    props: { role, orgType: org.type ?? "unknown" },
  });

  res.json({ ok: true, orgName: org.name, alreadyMember: false });
});

router.get("/my", authenticate, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;

  const membership = await db.query.orgMembersTable.findFirst({
    where: eq(orgMembersTable.userId, userId),
  });

  if (!membership) {
    res.json({ org: null });
    return;
  }

  const org = await db.query.organisationsTable.findFirst({
    where: eq(organisationsTable.id, membership.orgId),
  });

  if (!org) {
    res.json({ org: null });
    return;
  }

  res.json({ org: { id: org.id, name: org.name, type: org.type, role: membership.role } });
});

router.get("/my-join-link", authenticate, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;

  const membership = await db.query.orgMembersTable.findFirst({
    where: eq(orgMembersTable.userId, userId),
  });

  if (!membership) {
    res.status(404).json({ error: "You are not a member of any organisation." });
    return;
  }

  if (membership.role !== "manager") {
    res.status(403).json({ error: "Only organisation managers can access the join link." });
    return;
  }

  const org = await db.query.organisationsTable.findFirst({
    where: eq(organisationsTable.id, membership.orgId),
  });

  if (!org) {
    res.status(404).json({ error: "Organisation not found." });
    return;
  }

  res.json({ orgId: org.id, inviteCode: org.inviteCode, orgName: org.name });
});

interface StoredActivityBreakdownOrg {
  category: string;
  impactValue: number;
}

interface StoredSdgBreakdownOrg {
  sdg: string;
  sdgColor: string;
  value: number;
}

interface StoredResultJsonOrg {
  totalValue: number;
  totalHours: number;
  activityBreakdowns: StoredActivityBreakdownOrg[];
  sdgBreakdowns: StoredSdgBreakdownOrg[];
}

function parseResultJsonOrg(raw: unknown): StoredResultJsonOrg {
  if (raw === null || typeof raw !== "object") return { totalValue: 0, totalHours: 0, activityBreakdowns: [], sdgBreakdowns: [] };
  const r = raw as Record<string, unknown>;
  return {
    totalValue: typeof r.totalValue === "number" ? r.totalValue : 0,
    totalHours: typeof r.totalHours === "number" ? r.totalHours : 0,
    activityBreakdowns: Array.isArray(r.activityBreakdowns)
      ? (r.activityBreakdowns as StoredActivityBreakdownOrg[]).filter(
          b => typeof b.category === "string" && typeof b.impactValue === "number"
        )
      : [],
    sdgBreakdowns: Array.isArray(r.sdgBreakdowns)
      ? (r.sdgBreakdowns as StoredSdgBreakdownOrg[]).filter(
          b => typeof b.sdg === "string" && typeof b.value === "number"
        )
      : [],
  };
}

function endOfDay(d: Date): Date {
  const end = new Date(d);
  end.setHours(23, 59, 59, 999);
  return end;
}

router.get("/report-pdf", authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;

    const membership = await db.query.orgMembersTable.findFirst({
      where: eq(orgMembersTable.userId, userId),
    });

    if (!membership) {
      res.status(404).json({ error: "You are not a member of any organisation." });
      return;
    }

    if (membership.role !== "manager") {
      res.status(403).json({ error: "Only organisation managers can download the report." });
      return;
    }

    const org = await db.query.organisationsTable.findFirst({
      where: eq(organisationsTable.id, membership.orgId),
    });

    if (!org) {
      res.status(404).json({ error: "Organisation not found." });
      return;
    }

    const fromParam = req.query.from;
    const toParam = req.query.to;
    const fromRaw = typeof fromParam === "string" && fromParam ? new Date(fromParam) : undefined;
    const toRaw = typeof toParam === "string" && toParam ? new Date(toParam) : undefined;
    if (fromRaw && isNaN(fromRaw.getTime())) {
      res.status(400).json({ error: "Invalid 'from' date" });
      return;
    }
    if (toRaw && isNaN(toRaw.getTime())) {
      res.status(400).json({ error: "Invalid 'to' date" });
      return;
    }
    const from = fromRaw;
    const to = toRaw ? endOfDay(toRaw) : undefined;

    const members = await db.query.orgMembersTable.findMany({
      where: eq(orgMembersTable.orgId, org.id),
    });

    const memberIds = members.map(m => m.userId);

    let records: typeof impactRecordsTable.$inferSelect[] = [];
    if (memberIds.length > 0) {
      const baseCondition = inArray(impactRecordsTable.userId, memberIds);
      const fromCondition = from ? gte(impactRecordsTable.createdAt, from) : undefined;
      const toCondition = to ? lte(impactRecordsTable.createdAt, to) : undefined;
      records = await db.select().from(impactRecordsTable).where(and(baseCondition, fromCondition, toCondition));
    }

    let totalSocialValue = 0;
    let totalHours = 0;
    const categoryValueMap: Record<string, number> = {};
    const sdgValueMap: Record<string, { sdg: string; sdgColor: string; value: number }> = {};

    for (const r of records) {
      const result = parseResultJsonOrg(r.resultJson);
      totalSocialValue += result.totalValue;
      totalHours += result.totalHours;
      for (const breakdown of result.activityBreakdowns) {
        categoryValueMap[breakdown.category] = (categoryValueMap[breakdown.category] ?? 0) + breakdown.impactValue;
      }
      for (const s of result.sdgBreakdowns) {
        if (!sdgValueMap[s.sdg]) {
          sdgValueMap[s.sdg] = { sdg: s.sdg, sdgColor: s.sdgColor || "#4C9F38", value: 0 };
        }
        sdgValueMap[s.sdg].value += s.value;
      }
    }

    const totalUsers = new Set(records.map(r => r.userId)).size;
    const valueByCategory = Object.entries(categoryValueMap)
      .map(([category, value]) => ({ category, value: Math.round(value * 100) / 100 }))
      .sort((a, b) => b.value - a.value);

    const sdgBreakdowns = Object.values(sdgValueMap)
      .map(s => ({ ...s, value: Math.round(s.value * 100) / 100 }))
      .sort((a, b) => b.value - a.value);

    let periodLabel = "All time";
    if (from && to) {
      periodLabel = `${from.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} – ${to.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
    } else if (from) {
      periodLabel = `From ${from.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
    } else if (to) {
      periodLabel = `Up to ${to.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
    }

    const doc = buildOrgDocument({
      orgName: org.name,
      orgType: org.type,
      period: periodLabel,
      totalSocialValue: Math.round(totalSocialValue * 100) / 100,
      totalHours: Math.round(totalHours * 100) / 100,
      totalMemberCount: memberIds.length,
      totalUsers,
      averageValuePerPerson: totalUsers > 0 ? Math.round((totalSocialValue / totalUsers) * 100) / 100 : 0,
      valueByCategory,
      sdgBreakdowns,
    });

    const buffer = await renderToBuffer(doc);

    const safeName = org.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}-impact-report.pdf"`);
    res.setHeader("Content-Length", buffer.length);
    res.end(buffer);
  } catch (err) {
    console.error("Org PDF generation error:", err);
    res.status(500).json({ error: "Failed to generate report" });
  }
});

router.get("/stats/monthly", authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;

    const membership = await db.query.orgMembersTable.findFirst({
      where: eq(orgMembersTable.userId, userId),
    });
    if (!membership) {
      res.status(404).json({ error: "You are not a member of any organisation." });
      return;
    }

    if (membership.role !== "manager") {
      res.status(403).json({ error: "Only organisation managers can access analytics." });
      return;
    }

    const members = await db.query.orgMembersTable.findMany({
      where: eq(orgMembersTable.orgId, membership.orgId),
    });
    const memberIds = members.map(m => m.userId);

    if (memberIds.length === 0) {
      res.json({ monthly: [] });
      return;
    }

    const fromParam = req.query.from;
    const toParam = req.query.to;
    const fromRaw = typeof fromParam === "string" && fromParam ? new Date(fromParam) : undefined;
    const toRaw = typeof toParam === "string" && toParam ? new Date(toParam) : undefined;
    const from = fromRaw && !isNaN(fromRaw.getTime()) ? fromRaw : undefined;
    const to = toRaw && !isNaN(toRaw.getTime()) ? endOfDay(toRaw) : undefined;

    const baseCondition = inArray(impactRecordsTable.userId, memberIds);
    const fromCondition = from ? gte(impactRecordsTable.createdAt, from) : undefined;
    const toCondition = to ? lte(impactRecordsTable.createdAt, to) : undefined;

    const records = await db.select({
      createdAt: impactRecordsTable.createdAt,
      resultJson: impactRecordsTable.resultJson,
    }).from(impactRecordsTable).where(and(baseCondition, fromCondition, toCondition));

    const monthMap: Record<string, number> = {};
    for (const r of records) {
      const date = new Date(r.createdAt);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const result = parseResultJsonOrg(r.resultJson);
      monthMap[key] = (monthMap[key] ?? 0) + result.totalValue;
    }

    const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    const periodFrom = from ?? (records.length > 0
      ? new Date(Math.min(...records.map(r => new Date(r.createdAt).getTime())))
      : new Date());
    const periodTo = to ?? new Date();

    const startYear = periodFrom.getFullYear();
    const startMonth = periodFrom.getMonth();
    const endYear = periodTo.getFullYear();
    const endMonth = periodTo.getMonth();

    const totalMonths = (endYear - startYear) * 12 + (endMonth - startMonth) + 1;
    const multiYear = startYear !== endYear || totalMonths > 12;

    const monthly: Array<{ month: string; value: number }> = [];
    let runningTotal = 0;
    for (let y = startYear; y <= endYear; y++) {
      const mStart = y === startYear ? startMonth : 0;
      const mEnd = y === endYear ? endMonth : 11;
      for (let m = mStart; m <= mEnd; m++) {
        const key = `${y}-${String(m + 1).padStart(2, "0")}`;
        runningTotal += monthMap[key] ?? 0;
        const label = multiYear ? `${MONTH_SHORT[m]} '${String(y).slice(2)}` : MONTH_SHORT[m]!;
        monthly.push({
          month: label,
          value: Math.round(runningTotal * 100) / 100,
        });
      }
    }

    res.json({ monthly });
  } catch (err) {
    console.error("Org monthly stats error:", err);
    res.status(500).json({ error: "Failed to load monthly data" });
  }
});

// ── Share-link management (manager-only) ──────────────────────────────────────

const VALID_SHARE_SCOPES = new Set(["all", "summary", "timeline", "categories", "regions"]);

const shareLinkCreateRateLimit = createRateLimiter({
  windowMs: 60 * 1000,
  max: 20,
  message: "Too many share-link requests. Please slow down.",
});

function generateShareSlug(): string {
  // 12 hex chars (~48 bits) is plenty against guessing while staying short.
  return randomBytes(6).toString("hex");
}

async function requireManager(userId: string) {
  const membership = await db.query.orgMembersTable.findFirst({
    where: eq(orgMembersTable.userId, userId),
  });
  if (!membership) return { error: { status: 404, message: "You are not a member of any organisation." } as const };
  if (membership.role !== "manager") return { error: { status: 403, message: "Only organisation managers can manage share links." } as const };
  return { membership };
}

router.get("/share-links", authenticate, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const result = await requireManager(userId);
  if ("error" in result) {
    res.status(result.error.status).json({ error: result.error.message });
    return;
  }

  const links = await db
    .select()
    .from(orgShareLinksTable)
    .where(eq(orgShareLinksTable.orgId, result.membership.orgId))
    .orderBy(desc(orgShareLinksTable.createdAt));

  res.json({
    links: links.map(l => ({
      id: l.id,
      slug: l.slug,
      scope: l.scope,
      funderLabel: l.funderLabel,
      expiresAt: l.expiresAt ? l.expiresAt.toISOString() : null,
      revokedAt: l.revokedAt ? l.revokedAt.toISOString() : null,
      viewCount: l.viewCount,
      createdAt: l.createdAt.toISOString(),
    })),
  });
});

router.post("/share-links", authenticate, shareLinkCreateRateLimit, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const result = await requireManager(userId);
  if ("error" in result) {
    res.status(result.error.status).json({ error: result.error.message });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const scopeInput = typeof body.scope === "string" ? body.scope : "all";
  if (!VALID_SHARE_SCOPES.has(scopeInput)) {
    res.status(400).json({ error: "Invalid scope. Must be one of: all, summary, timeline, categories, regions." });
    return;
  }

  let funderLabel: string | null = null;
  if (typeof body.funderLabel === "string") {
    const trimmed = body.funderLabel.trim().slice(0, 80);
    if (trimmed.length > 0) funderLabel = trimmed;
  }

  let expiresAt: Date | null = null;
  if (body.expiresAt !== undefined && body.expiresAt !== null && body.expiresAt !== "") {
    if (typeof body.expiresAt !== "string") {
      res.status(400).json({ error: "Invalid expiresAt." });
      return;
    }
    const parsed = new Date(body.expiresAt);
    if (isNaN(parsed.getTime())) {
      res.status(400).json({ error: "Invalid expiresAt date." });
      return;
    }
    // Treat date-only inputs (YYYY-MM-DD) as end-of-day so a "valid until X" link includes that day.
    if (/^\d{4}-\d{2}-\d{2}$/.test(body.expiresAt)) {
      parsed.setHours(23, 59, 59, 999);
    }
    if (parsed.getTime() <= Date.now()) {
      res.status(400).json({ error: "Expiry date must be in the future." });
      return;
    }
    expiresAt = parsed;
  }

  // Enforce the per-tier share-link cap (only enforced once PRICING_ENABLED
  // is on — see featureCap). Counts only links that are still usable.
  const cap = await featureCap(result.membership.orgId, "shareLinkCap");
  if (cap !== null) {
    const existingLinks = await db.select().from(orgShareLinksTable).where(eq(orgShareLinksTable.orgId, result.membership.orgId));
    const activeCount = existingLinks.filter(l => !l.revokedAt && (!l.expiresAt || l.expiresAt.getTime() > Date.now())).length;
    if (activeCount >= cap) {
      res.status(402).json({ error: `You've reached your plan's limit of ${cap} active share link${cap === 1 ? "" : "s"}. Upgrade or revoke an existing link to create a new one.` });
      return;
    }
  }

  // Generate a unique slug (collisions are vanishingly rare but loop a few times).
  let slug = generateShareSlug();
  for (let i = 0; i < 5; i++) {
    const existing = await db.query.orgShareLinksTable.findFirst({
      where: eq(orgShareLinksTable.slug, slug),
    });
    if (!existing) break;
    slug = generateShareSlug();
  }

  const [created] = await db.insert(orgShareLinksTable).values({
    id: randomUUID(),
    slug,
    orgId: result.membership.orgId,
    createdByUserId: userId,
    scope: scopeInput,
    funderLabel,
    expiresAt,
  }).returning();

  res.json({
    link: {
      id: created.id,
      slug: created.slug,
      scope: created.scope,
      funderLabel: created.funderLabel,
      expiresAt: created.expiresAt ? created.expiresAt.toISOString() : null,
      revokedAt: created.revokedAt ? created.revokedAt.toISOString() : null,
      viewCount: created.viewCount,
      createdAt: created.createdAt.toISOString(),
    },
  });
});

router.post("/share-links/:id/revoke", authenticate, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const result = await requireManager(userId);
  if ("error" in result) {
    res.status(result.error.status).json({ error: result.error.message });
    return;
  }

  const id = req.params.id;
  const link = await db.query.orgShareLinksTable.findFirst({
    where: eq(orgShareLinksTable.id, id),
  });
  if (!link || link.orgId !== result.membership.orgId) {
    res.status(404).json({ error: "Share link not found." });
    return;
  }

  if (link.revokedAt) {
    res.json({ ok: true, alreadyRevoked: true });
    return;
  }

  await db.update(orgShareLinksTable)
    .set({ revokedAt: new Date() })
    .where(eq(orgShareLinksTable.id, id));

  res.json({ ok: true });
});

router.get("/stats/regions", authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;

    const membership = await db.query.orgMembersTable.findFirst({
      where: eq(orgMembersTable.userId, userId),
    });
    if (!membership) {
      res.status(404).json({ error: "You are not a member of any organisation." });
      return;
    }

    if (membership.role !== "manager") {
      res.status(403).json({ error: "Only organisation managers can access analytics." });
      return;
    }

    const members = await db.query.orgMembersTable.findMany({
      where: eq(orgMembersTable.orgId, membership.orgId),
    });
    const memberIds = members.map(m => m.userId);

    if (memberIds.length === 0) {
      res.json({ regions: [] });
      return;
    }

    const fromParam = req.query.from;
    const toParam = req.query.to;
    const fromRaw = typeof fromParam === "string" && fromParam ? new Date(fromParam) : undefined;
    const toRaw = typeof toParam === "string" && toParam ? new Date(toParam) : undefined;
    const from = fromRaw && !isNaN(fromRaw.getTime()) ? fromRaw : undefined;
    const to = toRaw && !isNaN(toRaw.getTime()) ? endOfDay(toRaw) : undefined;

    const baseCondition = inArray(impactRecordsTable.userId, memberIds);
    const fromCondition = from ? gte(impactRecordsTable.createdAt, from) : undefined;
    const toCondition = to ? lte(impactRecordsTable.createdAt, to) : undefined;

    const records = await db.select({
      userId: impactRecordsTable.userId,
      region: impactRecordsTable.region,
      resultJson: impactRecordsTable.resultJson,
    }).from(impactRecordsTable).where(and(baseCondition, fromCondition, toCondition));

    const regionMap: Record<string, { userIds: Set<string>; hours: number; value: number }> = {};
    for (const r of records) {
      const regionName = r.region ?? "Other";
      if (!regionMap[regionName]) regionMap[regionName] = { userIds: new Set(), hours: 0, value: 0 };
      regionMap[regionName].userIds.add(r.userId);
      const result = parseResultJsonOrg(r.resultJson);
      regionMap[regionName].hours += result.totalHours;
      regionMap[regionName].value += result.totalValue;
    }

    const ORG_COST_PER_VOLUNTEER = 475;
    const totalMembers = Object.values(regionMap).reduce((sum, r) => sum + r.userIds.size, 0) || 1;
    const regions = Object.entries(regionMap)
      .map(([region, data]) => {
        const investment = data.userIds.size * ORG_COST_PER_VOLUNTEER;
        const sroi = investment > 0 ? Math.round((data.value / investment) * 100) / 100 : null;
        return {
          region,
          members: data.userIds.size,
          hours: Math.round(data.hours),
          value: Math.round(data.value * 100) / 100,
          sroi,
          pct: Math.round((data.userIds.size / totalMembers) * 100),
        };
      })
      .sort((a, b) => b.members - a.members);

    res.json({ regions });
  } catch (err) {
    console.error("Org regions stats error:", err);
    res.status(500).json({ error: "Failed to load region data" });
  }
});

// ---------------------------------------------------------------------------
// Manager-only helper — used by both the Match programme and Enterprise SSO
// admin endpoints below. Returns the full membership row so callers can read
// `.orgId`, `.role`, etc.
// ---------------------------------------------------------------------------

async function requireOrgManager(req: AuthenticatedRequest, res: import("express").Response) {
  const userId = req.user!.id;
  const membership = await db.query.orgMembersTable.findFirst({
    where: eq(orgMembersTable.userId, userId),
  });
  if (!membership) {
    res.status(404).json({ error: "You are not a member of any organisation." });
    return null;
  }
  if (membership.role !== "manager") {
    res.status(403).json({ error: "Only organisation managers can perform this action." });
    return null;
  }
  return membership;
}

function parseOptionalNonNegativeNumber(value: unknown, label: string): { ok: true; value: number | null } | { ok: false; error: string } {
  if (value === null || value === undefined || value === "") return { ok: true, value: null };
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  if (!Number.isFinite(n) || n < 0) return { ok: false, error: `${label} must be a non-negative number.` };
  return { ok: true, value: n };
}

function parseDate(value: unknown, label: string): { ok: true; value: Date } | { ok: false; error: string } {
  if (typeof value !== "string" || !value) return { ok: false, error: `${label} is required.` };
  const d = new Date(value);
  if (isNaN(d.getTime())) return { ok: false, error: `${label} is not a valid date.` };
  return { ok: true, value: d };
}

router.get("/match/rates", authenticate, async (req: AuthenticatedRequest, res) => {
  const membership = await requireOrgManager(req, res);
  if (!membership) return;

  const rates = await db.query.orgMatchRatesTable.findMany({
    where: eq(orgMatchRatesTable.orgId, membership.orgId),
    orderBy: (t, { desc }) => [desc(t.effectiveFrom)],
  });

  res.json({
    rates: rates.map(r => ({
      id: r.id,
      hourlyRate: r.hourlyRate !== null ? Number(r.hourlyRate) : null,
      donationMultiplier: r.donationMultiplier !== null ? Number(r.donationMultiplier) : null,
      monthlyCapPerMember: r.monthlyCapPerMember !== null ? Number(r.monthlyCapPerMember) : null,
      onlyVerifiedHours: r.onlyVerifiedHours,
      effectiveFrom: r.effectiveFrom.toISOString(),
      effectiveTo: r.effectiveTo ? r.effectiveTo.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    })),
  });
});

router.post("/match/rates", authenticate, async (req: AuthenticatedRequest, res) => {
  const membership = await requireOrgManager(req, res);
  if (!membership) return;

  const userId = req.user!.id;

  const hourlyResult = parseOptionalNonNegativeNumber(req.body?.hourlyRate, "Hourly rate");
  if (!hourlyResult.ok) { res.status(400).json({ error: hourlyResult.error }); return; }

  const donationResult = parseOptionalNonNegativeNumber(req.body?.donationMultiplier, "Donation multiplier");
  if (!donationResult.ok) { res.status(400).json({ error: donationResult.error }); return; }

  const capResult = parseOptionalNonNegativeNumber(req.body?.monthlyCapPerMember, "Monthly cap");
  if (!capResult.ok) { res.status(400).json({ error: capResult.error }); return; }

  if (hourlyResult.value === null && donationResult.value === null) {
    res.status(400).json({ error: "Set at least one of: hourly rate or donation multiplier." });
    return;
  }

  const fromResult = parseDate(req.body?.effectiveFrom, "Effective from");
  if (!fromResult.ok) { res.status(400).json({ error: fromResult.error }); return; }

  const onlyVerified = req.body?.onlyVerifiedHours === true;

  // End-date the previous active rate at this new rate's effective_from (if any overlap).
  const previousActive = await db.query.orgMatchRatesTable.findFirst({
    where: and(eq(orgMatchRatesTable.orgId, membership.orgId), isNull(orgMatchRatesTable.effectiveTo)),
  });
  if (previousActive) {
    const newFrom = fromResult.value;
    if (newFrom <= previousActive.effectiveFrom) {
      res.status(400).json({ error: "New rate must start after the previous active rate's start date." });
      return;
    }
    await db.update(orgMatchRatesTable)
      .set({ effectiveTo: newFrom })
      .where(eq(orgMatchRatesTable.id, previousActive.id));
  }

  const id = randomUUID();
  await db.insert(orgMatchRatesTable).values({
    id,
    orgId: membership.orgId,
    hourlyRate: hourlyResult.value !== null ? String(hourlyResult.value) : null,
    donationMultiplier: donationResult.value !== null ? String(donationResult.value) : null,
    monthlyCapPerMember: capResult.value !== null ? String(capResult.value) : null,
    onlyVerifiedHours: onlyVerified,
    effectiveFrom: fromResult.value,
    effectiveTo: null,
    createdBy: userId,
  });

  res.json({ ok: true, id });
});

router.post("/match/rates/end", authenticate, async (req: AuthenticatedRequest, res) => {
  const membership = await requireOrgManager(req, res);
  if (!membership) return;

  const endDate = req.body?.effectiveTo ? parseDate(req.body.effectiveTo, "End date") : { ok: true as const, value: new Date() };
  if (!endDate.ok) { res.status(400).json({ error: endDate.error }); return; }

  const active = await db.query.orgMatchRatesTable.findFirst({
    where: and(eq(orgMatchRatesTable.orgId, membership.orgId), isNull(orgMatchRatesTable.effectiveTo)),
  });
  if (!active) {
    res.status(404).json({ error: "No active match rate to end." });
    return;
  }
  if (endDate.value <= active.effectiveFrom) {
    res.status(400).json({ error: "End date must be after the rate's start date." });
    return;
  }

  await db.update(orgMatchRatesTable)
    .set({ effectiveTo: endDate.value })
    .where(eq(orgMatchRatesTable.id, active.id));

  res.json({ ok: true });
});

interface ResultJsonForMatch {
  totalHours: number;
  donationsValue: number;
}

function parseRecordForMatch(raw: unknown): ResultJsonForMatch {
  if (raw === null || typeof raw !== "object") return { totalHours: 0, donationsValue: 0 };
  const r = raw as Record<string, unknown>;
  return {
    totalHours: typeof r.totalHours === "number" ? r.totalHours : 0,
    donationsValue: typeof r.donationsValue === "number" ? r.donationsValue : 0,
  };
}

async function loadOrgMatchSet(orgId: string, from?: Date, to?: Date) {
  const members = await db.query.orgMembersTable.findMany({
    where: eq(orgMembersTable.orgId, orgId),
  });
  const memberIds = members.map(m => m.userId);

  const rates = await db.query.orgMatchRatesTable.findMany({
    where: eq(orgMatchRatesTable.orgId, orgId),
    orderBy: (t) => [asc(t.effectiveFrom)],
  });

  let records: typeof impactRecordsTable.$inferSelect[] = [];
  if (memberIds.length > 0) {
    const baseCondition = inArray(impactRecordsTable.userId, memberIds);
    const fromCondition = from ? gte(impactRecordsTable.createdAt, from) : undefined;
    const toCondition = to ? lte(impactRecordsTable.createdAt, to) : undefined;
    records = await db.select().from(impactRecordsTable).where(and(baseCondition, fromCondition, toCondition));
  }

  const recordsForMatch: RecordForMatch[] = records.map(r => {
    const parsed = parseRecordForMatch(r.resultJson);
    return {
      id: r.id,
      userId: r.userId,
      createdAt: r.createdAt,
      totalHours: parsed.totalHours,
      donationsValue: parsed.donationsValue,
    };
  });

  const matches = computeMatchesForRecords(recordsForMatch, rates);
  return { records, recordsForMatch, matches, memberIds };
}

router.get("/match/summary", authenticate, async (req: AuthenticatedRequest, res) => {
  const membership = await requireOrgManager(req, res);
  if (!membership) return;

  const fromParam = req.query.from;
  const toParam = req.query.to;
  const fromRaw = typeof fromParam === "string" && fromParam ? new Date(fromParam) : undefined;
  const toRaw = typeof toParam === "string" && toParam ? new Date(toParam) : undefined;
  const from = fromRaw && !isNaN(fromRaw.getTime()) ? fromRaw : undefined;
  const to = toRaw && !isNaN(toRaw.getTime()) ? endOfDay(toRaw) : undefined;

  const { matches, recordsForMatch } = await loadOrgMatchSet(membership.orgId, from, to);

  const totalCommitment = matches.reduce((s, m) => s + m.matchedValue, 0);
  const totalHoursMatched = matches.reduce((s, m) => s + m.hoursMatched, 0);
  const totalDonationsMatched = matches.reduce((s, m) => s + m.donationsMatched, 0);
  const matchedRecordsCount = matches.filter(m => m.matchedValue > 0).length;
  const matchedMembersCount = new Set(
    matches.filter(m => m.matchedValue > 0).map(m => m.userId),
  ).size;

  // Monthly series (capped totals per month)
  const monthly: Record<string, number> = {};
  for (const m of matches) {
    const rec = recordsForMatch.find(r => String(r.id) === m.recordId);
    if (!rec) continue;
    const key = `${rec.createdAt.getFullYear()}-${String(rec.createdAt.getMonth() + 1).padStart(2, "0")}`;
    monthly[key] = (monthly[key] ?? 0) + m.matchedValue;
  }

  res.json({
    totalCommitment: Math.round(totalCommitment * 100) / 100,
    totalHoursMatched: Math.round(totalHoursMatched * 100) / 100,
    totalDonationsMatched: Math.round(totalDonationsMatched * 100) / 100,
    matchedRecordsCount,
    matchedMembersCount,
    monthly: Object.entries(monthly)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, value]) => ({ month, value: Math.round(value * 100) / 100 })),
  });
});

function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

router.get("/match/csv", authenticate, async (req: AuthenticatedRequest, res) => {
  const membership = await requireOrgManager(req, res);
  if (!membership) return;

  const fromParam = req.query.from;
  const toParam = req.query.to;
  const fromRaw = typeof fromParam === "string" && fromParam ? new Date(fromParam) : undefined;
  const toRaw = typeof toParam === "string" && toParam ? new Date(toParam) : undefined;
  const from = fromRaw && !isNaN(fromRaw.getTime()) ? fromRaw : undefined;
  const to = toRaw && !isNaN(toRaw.getTime()) ? endOfDay(toRaw) : undefined;

  const { matches, recordsForMatch, memberIds } = await loadOrgMatchSet(membership.orgId, from, to);

  // Group by member-month
  type Bucket = { userId: string; month: string; hours: number; donations: number; matched: number; logged: number };
  const buckets: Record<string, Bucket> = {};
  for (const m of matches) {
    const rec = recordsForMatch.find(r => String(r.id) === m.recordId);
    if (!rec) continue;
    const month = `${rec.createdAt.getFullYear()}-${String(rec.createdAt.getMonth() + 1).padStart(2, "0")}`;
    const key = `${rec.userId}::${month}`;
    if (!buckets[key]) buckets[key] = { userId: rec.userId, month, hours: 0, donations: 0, matched: 0, logged: 0 };
    buckets[key].hours += rec.totalHours;
    buckets[key].donations += rec.donationsValue;
    buckets[key].matched += m.matchedValue;
  }

  // Get member emails for the CSV (anonymised: we use a member index instead of email, to preserve member privacy)
  const memberOrder = new Map<string, number>();
  memberIds.forEach((id, idx) => memberOrder.set(id, idx + 1));

  const rows = [
    ["Member #", "Month", "Hours logged", "Donations logged (£)", "Matched amount (£)"],
    ...Object.values(buckets)
      .sort((a, b) => a.month.localeCompare(b.month) || (memberOrder.get(a.userId) ?? 0) - (memberOrder.get(b.userId) ?? 0))
      .map(b => [
        String(memberOrder.get(b.userId) ?? "?"),
        b.month,
        (Math.round(b.hours * 100) / 100).toFixed(2),
        (Math.round(b.donations * 100) / 100).toFixed(2),
        (Math.round(b.matched * 100) / 100).toFixed(2),
      ]),
  ];

  const csv = rows.map(r => r.map(csvEscape).join(",")).join("\r\n");

  const org = await db.query.organisationsTable.findFirst({
    where: eq(organisationsTable.id, membership.orgId),
  });
  const safeName = (org?.name ?? "org").replace(/[^a-z0-9]+/gi, "-").toLowerCase();

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${safeName}-match-export.csv"`);
  res.send(csv);
});

// ────────────────────────────────────────────────────────────────────
// Enterprise SSO admin endpoints (manager-only)
//
// Each org may configure at most one SSO provider per domain. The
// `enforceSSO` flag, when true, blocks magic-link sign-ups on that
// domain and forces users through the OIDC flow.
// ────────────────────────────────────────────────────────────────────

router.get("/sso/config", authenticate, async (req: AuthenticatedRequest, res) => {
  const membership = await requireOrgManager(req, res);
  if (!membership) return;

  const configs = await db.query.orgSsoConfigsTable.findMany({
    where: eq(orgSsoConfigsTable.orgId, membership.orgId),
    orderBy: (t, { asc }) => [asc(t.createdAt)],
  });

  res.json({
    configs: configs.map(c => ({
      id: c.id,
      provider: c.provider,
      domain: c.domain,
      tenantId: c.tenantId,
      enforceSSO: c.enforceSSO,
      status: c.status,
      lastTestAt: c.lastTestAt,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    })),
    availableProviders: configuredProviders(),
  });
});

router.post("/sso/config", authenticate, async (req: AuthenticatedRequest, res) => {
  const membership = await requireOrgManager(req, res);
  if (!membership) return;

  const { provider, domain, tenantId, enforceSSO } = req.body ?? {};
  if (provider !== "google" && provider !== "microsoft") {
    res.status(400).json({ error: "provider must be 'google' or 'microsoft'" });
    return;
  }
  if (!isProviderConfigured(provider as SsoProvider)) {
    res.status(503).json({ error: "This SSO provider isn't enabled on the platform yet. Please contact My Impact support." });
    return;
  }
  const cleanedDomain = typeof domain === "string" ? normalizeDomain(domain) : null;
  if (!cleanedDomain) {
    res.status(400).json({ error: "A valid email domain is required (e.g. acmecharity.org)" });
    return;
  }
  const cleanTenantId = typeof tenantId === "string" && tenantId.trim() ? tenantId.trim() : null;
  if (provider === "microsoft" && !cleanTenantId) {
    res.status(400).json({ error: "Microsoft Entra requires a tenant ID (or 'common' for any tenant)." });
    return;
  }
  const enforce = !!enforceSSO;

  // Domain uniqueness across the platform
  const existingForDomain = await db.query.orgSsoConfigsTable.findFirst({
    where: eq(orgSsoConfigsTable.domain, cleanedDomain),
  });
  if (existingForDomain && existingForDomain.orgId !== membership.orgId) {
    res.status(409).json({ error: `Domain ${cleanedDomain} is already configured by another organisation. Contact My Impact support if this is yours.` });
    return;
  }

  const id = randomUUID();
  const now = new Date();

  if (existingForDomain && existingForDomain.orgId === membership.orgId) {
    // Update in place
    const [updated] = await db
      .update(orgSsoConfigsTable)
      .set({
        provider,
        tenantId: cleanTenantId,
        enforceSSO: enforce,
        // Changing provider/tenant invalidates any previous verification
        status: existingForDomain.provider !== provider || existingForDomain.tenantId !== cleanTenantId
          ? "pending"
          : existingForDomain.status,
        updatedAt: now,
      })
      .where(eq(orgSsoConfigsTable.id, existingForDomain.id))
      .returning();
    res.json({ config: serializeConfig(updated) });
    return;
  }

  const [created] = await db
    .insert(orgSsoConfigsTable)
    .values({
      id,
      orgId: membership.orgId,
      provider,
      domain: cleanedDomain,
      tenantId: cleanTenantId,
      enforceSSO: enforce,
      status: "pending",
    })
    .returning();
  res.json({ config: serializeConfig(created) });
});

router.delete("/sso/config/:id", authenticate, async (req: AuthenticatedRequest, res) => {
  const membership = await requireOrgManager(req, res);
  if (!membership) return;

  const id = String(req.params.id);
  const existing = await db.query.orgSsoConfigsTable.findFirst({
    where: and(eq(orgSsoConfigsTable.id, id), eq(orgSsoConfigsTable.orgId, membership.orgId)),
  });
  if (!existing) {
    res.status(404).json({ error: "SSO config not found." });
    return;
  }
  await db.delete(orgSsoConfigsTable).where(eq(orgSsoConfigsTable.id, id));
  res.json({ ok: true });
});

function serializeConfig(c: typeof orgSsoConfigsTable.$inferSelect) {
  return {
    id: c.id,
    provider: c.provider,
    domain: c.domain,
    tenantId: c.tenantId,
    enforceSSO: c.enforceSSO,
    status: c.status,
    lastTestAt: c.lastTestAt,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

export default router;
