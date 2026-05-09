import { Router, type IRouter, type Request, type Response } from "express";
import { db, organisationsTable, orgMembersTable, impactRecordsTable, orgShareLinksTable } from "@workspace/db";
import { eq, and, inArray, sql } from "drizzle-orm";
import { createRateLimiter } from "../lib/rateLimiter.js";

const router: IRouter = Router();

// Per-IP rate limit for the public share endpoint to prevent enumeration.
// 30 requests/minute mirrors the public-profile pattern.
const sharePublicRateLimit = createRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  message: "Too many requests. Please slow down.",
});

interface StoredActivityBreakdown {
  category: string;
  impactValue: number;
}
interface StoredResultJson {
  totalValue: number;
  totalHours: number;
  activityBreakdowns: StoredActivityBreakdown[];
}
function parseResultJson(raw: unknown): StoredResultJson {
  if (raw === null || typeof raw !== "object") return { totalValue: 0, totalHours: 0, activityBreakdowns: [] };
  const r = raw as Record<string, unknown>;
  return {
    totalValue: typeof r.totalValue === "number" ? r.totalValue : 0,
    totalHours: typeof r.totalHours === "number" ? r.totalHours : 0,
    activityBreakdowns: Array.isArray(r.activityBreakdowns)
      ? (r.activityBreakdowns as StoredActivityBreakdown[]).filter(
          b => typeof b.category === "string" && typeof b.impactValue === "number"
        )
      : [],
  };
}

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const ORG_COST_PER_VOLUNTEER = 475;

router.get("/:slug", sharePublicRateLimit, async (req: Request, res: Response) => {
  const slug = (req.params.slug ?? "").trim().toLowerCase();
  if (!slug) {
    res.status(404).json({ error: "Share link not found." });
    return;
  }

  const link = await db.query.orgShareLinksTable.findFirst({
    where: eq(orgShareLinksTable.slug, slug),
  });

  if (!link) {
    res.status(404).json({ error: "Share link not found." });
    return;
  }

  if (link.revokedAt) {
    res.status(410).json({ error: "This share link has been revoked." });
    return;
  }

  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) {
    res.status(410).json({ error: "This share link has expired." });
    return;
  }

  const org = await db.query.organisationsTable.findFirst({
    where: eq(organisationsTable.id, link.orgId),
  });
  if (!org) {
    res.status(404).json({ error: "Organisation not found." });
    return;
  }

  // Increment view counter (atomic, no caching).
  await db.update(orgShareLinksTable)
    .set({ viewCount: sql`${orgShareLinksTable.viewCount} + 1` })
    .where(eq(orgShareLinksTable.id, link.id));

  const members = await db.query.orgMembersTable.findMany({
    where: eq(orgMembersTable.orgId, link.orgId),
  });
  const memberIds = members.map(m => m.userId);

  const records = memberIds.length > 0
    ? await db.select().from(impactRecordsTable).where(inArray(impactRecordsTable.userId, memberIds))
    : [];

  // ── Summary ─────────────────────────────────────────────────────────────────
  let totalSocialValue = 0;
  let totalHours = 0;
  const categoryValueMap: Record<string, number> = {};
  for (const r of records) {
    const result = parseResultJson(r.resultJson);
    totalSocialValue += result.totalValue;
    totalHours += result.totalHours;
    for (const breakdown of result.activityBreakdowns) {
      categoryValueMap[breakdown.category] = (categoryValueMap[breakdown.category] ?? 0) + breakdown.impactValue;
    }
  }
  const totalUsers = new Set(records.map(r => r.userId)).size;
  const valueByCategory = Object.entries(categoryValueMap)
    .map(([category, value]) => ({ category, value: Math.round(value * 100) / 100 }))
    .sort((a, b) => b.value - a.value);

  const summary = {
    totalSocialValue: Math.round(totalSocialValue * 100) / 100,
    totalHours: Math.round(totalHours * 100) / 100,
    totalMemberCount: memberIds.length,
    totalUsers,
    averageValuePerPerson: totalUsers > 0 ? Math.round((totalSocialValue / totalUsers) * 100) / 100 : 0,
  };

  // ── Timeline (cumulative monthly social value) ─────────────────────────────
  const monthMap: Record<string, number> = {};
  for (const r of records) {
    const date = new Date(r.createdAt);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const result = parseResultJson(r.resultJson);
    monthMap[key] = (monthMap[key] ?? 0) + result.totalValue;
  }
  const timestamps = records.map(r => new Date(r.createdAt).getTime());
  const periodFrom = timestamps.length > 0 ? new Date(Math.min(...timestamps)) : new Date();
  const periodTo = new Date();
  const startYear = periodFrom.getFullYear();
  const startMonth = periodFrom.getMonth();
  const endYear = periodTo.getFullYear();
  const endMonth = periodTo.getMonth();
  const totalMonths = (endYear - startYear) * 12 + (endMonth - startMonth) + 1;
  const multiYear = startYear !== endYear || totalMonths > 12;

  const monthly: Array<{ month: string; value: number }> = [];
  let runningTotal = 0;
  if (records.length > 0) {
    for (let y = startYear; y <= endYear; y++) {
      const mStart = y === startYear ? startMonth : 0;
      const mEnd = y === endYear ? endMonth : 11;
      for (let m = mStart; m <= mEnd; m++) {
        const key = `${y}-${String(m + 1).padStart(2, "0")}`;
        runningTotal += monthMap[key] ?? 0;
        const label = multiYear ? `${MONTH_SHORT[m]} '${String(y).slice(2)}` : MONTH_SHORT[m]!;
        monthly.push({ month: label, value: Math.round(runningTotal * 100) / 100 });
      }
    }
  }

  // ── Regions ────────────────────────────────────────────────────────────────
  const regionMap: Record<string, { userIds: Set<string>; hours: number; value: number }> = {};
  for (const r of records) {
    const regionName = r.region ?? "Other";
    if (!regionMap[regionName]) regionMap[regionName] = { userIds: new Set(), hours: 0, value: 0 };
    regionMap[regionName].userIds.add(r.userId);
    const result = parseResultJson(r.resultJson);
    regionMap[regionName].hours += result.totalHours;
    regionMap[regionName].value += result.totalValue;
  }
  const totalRegionMembers = Object.values(regionMap).reduce((sum, r) => sum + r.userIds.size, 0) || 1;
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
        pct: Math.round((data.userIds.size / totalRegionMembers) * 100),
      };
    })
    .sort((a, b) => b.members - a.members);

  // ── Decide which sections to include based on scope ─────────────────────────
  const scope = link.scope;
  const includeSummary = scope === "all" || scope === "summary";
  const includeTimeline = scope === "all" || scope === "timeline";
  const includeCategories = scope === "all" || scope === "categories";
  const includeRegions = scope === "all" || scope === "regions";

  const costBreakdown = (
    org.sroiCostRecruitment !== null ||
    org.sroiCostOnboarding !== null ||
    org.sroiCostSupport !== null ||
    org.sroiCostAdmin !== null
  ) ? {
    recruitment: org.sroiCostRecruitment ?? null,
    onboarding: org.sroiCostOnboarding ?? null,
    support: org.sroiCostSupport ?? null,
    admin: org.sroiCostAdmin ?? null,
  } : null;

  res.json({
    share: {
      slug: link.slug,
      scope: link.scope,
      funderLabel: link.funderLabel,
      expiresAt: link.expiresAt ? link.expiresAt.toISOString() : null,
      orgName: org.name,
      orgType: org.type,
      sroiCostPerVolunteer: org.sroiCostPerVolunteer ?? null,
      sroiCostBreakdown: costBreakdown,
    },
    sections: {
      summary: includeSummary ? summary : null,
      monthly: includeTimeline ? monthly : null,
      valueByCategory: includeCategories ? valueByCategory : null,
      regions: includeRegions ? regions : null,
    },
  });
});

export default router;
