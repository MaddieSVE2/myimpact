import { Router, type IRouter } from "express";
import { db, organisationsTable, orgMembersTable, impactRecordsTable } from "@workspace/db";
import { eq, and, inArray, gte, lte } from "drizzle-orm";
import { authenticate, type AuthenticatedRequest } from "../middleware/authenticate.js";
import { getUncachableResendClient } from "../lib/resend.js";
import { renderToBuffer } from "@react-pdf/renderer";
import { buildOrgDocument } from "../lib/orgPdf.js";
import React from "react";

const router: IRouter = Router();

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
}

router.post("/register", async (req, res) => {
  const { orgName, type, contactName, contactEmail, size, purpose } = req.body;
  if (!orgName || !type || !contactName || !contactEmail) {
    res.status(400).json({ error: "Required fields missing" });
    return;
  }

  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const { error: sendError } = await client.emails.send({
      from: fromEmail,
      to: "maddie@socialvalueengine.com",
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

    // Send confirmation email to the registrant
    const { error: confirmError } = await client.emails.send({
      from: fromEmail,
      to: contactEmail,
      subject: `We've received your registration request — My Impact`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;background:#f9f9f9;border-radius:8px;">
          <h2 style="color:#213547;margin-top:0;">Thanks for registering, ${escHtml(contactName)}!</h2>
          <p style="color:#444;line-height:1.6;margin-top:0;">We've received your registration request for <strong>${escHtml(orgName)}</strong> and our team will review it shortly.</p>
          <div style="background:white;border-radius:8px;padding:20px 24px;margin:24px 0;">
            <h3 style="color:#213547;margin-top:0;font-size:15px;">Your submission details</h3>
            <table style="width:100%;border-collapse:collapse;">
              <tr style="background:#f7f5ef;"><td style="padding:10px 14px;color:#555;width:140px;font-size:13px;border-radius:4px 0 0 4px;"><strong>Organisation</strong></td><td style="padding:10px 14px;color:#213547;font-size:14px;">${escHtml(orgName)}</td></tr>
              <tr><td style="padding:10px 14px;color:#555;font-size:13px;"><strong>Type</strong></td><td style="padding:10px 14px;color:#213547;font-size:14px;">${escHtml(type)}</td></tr>
              <tr style="background:#f7f5ef;"><td style="padding:10px 14px;color:#555;font-size:13px;"><strong>Contact name</strong></td><td style="padding:10px 14px;color:#213547;font-size:14px;">${escHtml(contactName)}</td></tr>
              <tr><td style="padding:10px 14px;color:#555;font-size:13px;"><strong>Contact email</strong></td><td style="padding:10px 14px;color:#213547;font-size:14px;">${escHtml(contactEmail)}</td></tr>
              ${size ? `<tr style="background:#f7f5ef;"><td style="padding:10px 14px;color:#555;font-size:13px;"><strong>Approx size</strong></td><td style="padding:10px 14px;color:#213547;font-size:14px;">${escHtml(size)}</td></tr>` : ""}
              ${purpose ? `<tr><td style="padding:10px 14px;color:#555;font-size:13px;vertical-align:top;"><strong>Purpose</strong></td><td style="padding:10px 14px;color:#213547;font-size:14px;line-height:1.5;">${escHtml(purpose)}</td></tr>` : ""}
            </table>
          </div>
          <h3 style="color:#213547;font-size:15px;margin-bottom:8px;">What happens next?</h3>
          <ul style="color:#444;line-height:1.8;padding-left:20px;margin-top:0;">
            <li>Our team will review your request within <strong>2 working days</strong>.</li>
            <li>Once approved, we'll send you an <strong>invite code</strong> so your organisation can get started on My Impact.</li>
            <li>If we need any additional information, we'll reach out to you at this email address.</li>
          </ul>
          <p style="color:#444;line-height:1.6;">If you have any questions in the meantime, feel free to reply to this email.</p>
          <p style="color:#aaa;font-size:11px;margin-top:32px;border-top:1px solid #eee;padding-top:16px;">My Impact · <a href="https://myimpact.replit.app" style="color:#aaa;">myimpact.replit.app</a></p>
        </div>
      `,
    });
    if (confirmError) {
      console.error("Resend error sending org registration confirmation to registrant:", confirmError);
      // Don't fail the request — the admin notification was sent successfully
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

  const existing = await db.query.orgMembersTable.findFirst({
    where: (t, { and }) => and(eq(t.orgId, org.id), eq(t.userId, userId)),
  });

  if (existing) {
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

  await db.insert(orgMembersTable).values({ orgId: org.id, userId });

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

  res.json({ org: { id: org.id, name: org.name, type: org.type } });
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

export default router;
