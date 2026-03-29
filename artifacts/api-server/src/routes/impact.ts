import { Router, type IRouter } from "express";
import {
  CalculateImpactBody,
  GetActivitiesResponse,
  GetSuggestionsBody,
  SaveImpactBody,
} from "@workspace/api-zod";
import { db, impactRecordsTable, orgMembersTable } from "@workspace/db";
import { eq, desc, inArray, and, gte, lte } from "drizzle-orm";
import { ACTIVITIES, CATEGORIES, calculateImpact } from "../lib/impactData.js";
import { authenticate, type AuthenticatedRequest } from "../middleware/authenticate.js";
import { renderToBuffer } from "@react-pdf/renderer";
import { buildImpactDocument, parsePdfData } from "../lib/impactPdf.js";
import React from "react";

const router: IRouter = Router();

router.get("/activities", (_req, res) => {
  const data = GetActivitiesResponse.parse({
    activities: ACTIVITIES,
    categories: CATEGORIES,
  });
  res.json(data);
});

router.post("/calculate", (req, res) => {
  const body = CalculateImpactBody.parse(req.body);
  const result = calculateImpact(
    body.activities,
    body.donationsGBP,
    body.additionalVolunteerHours,
    body.customActivities ?? []
  );
  res.json(result);
});

router.post("/suggestions", (req, res) => {
  const body = GetSuggestionsBody.parse(req.body);
  const currentIds = new Set(body.currentActivities);

  // Map interest labels to categories
  const INTEREST_CATEGORY_MAP: Record<string, string> = {
    "The environment": "Environment",
    "Mental health": "Health",
    "My community": "Community",
    "Education": "Education",
    "Physical health": "Health",
    "Fairness & equality": "Community",
    "Animal welfare": "Environment",
    "Children & young people": "Education",
    "Older people": "Community",
    "Poverty & hunger": "Community",
    "Arts & culture": "Community",
    "Sport & fitness": "Health",
    "Housing & homelessness": "Community",
    "Digital skills": "Education",
    "Disability & accessibility": "Community",
    "International development": "Community",
    "Caring for family": "Health",
    "Military / Forces service": "Community",
    "Career break / Returning to work": "Community",
  };

  const preferredCategories = new Set(
    (body.interests ?? []).map((i) => INTEREST_CATEGORY_MAP[i]).filter(Boolean)
  );

  // Related activity pairs — used to generate "since you already do X" reasons
  const RELATED_PAIRS: Record<string, string[]> = {
    community_garden: ["tree_planting", "recycling", "eco_transport"],
    food_bank: ["charity_books", "fundraising", "veterans_breakfast"],
    veterans_breakfast: ["food_bank", "mental_health_volunteer", "elderly_befriending"],
    youth_mentoring: ["tutoring", "library_reading", "coding_clubs"],
    tutoring: ["youth_mentoring", "library_reading"],
    recycling: ["food_waste", "eco_transport", "tree_planting"],
    food_waste: ["recycling", "community_garden"],
    eco_transport: ["tree_planting", "community_garden"],
    tree_planting: ["community_garden", "eco_transport"],
    fundraising: ["charity_books", "food_bank"],
    charity_books: ["fundraising", "food_bank"],
    mental_health_volunteer: ["veterans_breakfast", "elderly_befriending", "youth_mentoring"],
    elderly_befriending: ["mental_health_volunteer", "veterans_breakfast"],
    blood_donation: ["organ_donation", "cpr_training"],
    organ_donation: ["blood_donation", "cpr_training"],
    cpr_training: ["blood_donation", "organ_donation"],
    coding_clubs: ["tutoring", "youth_mentoring"],
    library_reading: ["tutoring", "coding_clubs"],
  };

  // Find the best "since you already do X, consider Y" pairing
  function buildContextualReason(candidateId: string, category: string): string {
    // Check if any current activity is related to this candidate
    for (const currentId of currentIds) {
      const related = RELATED_PAIRS[currentId] || [];
      if (related.includes(candidateId)) {
        const currentName = ACTIVITIES.find((a) => a.id === currentId)?.name;
        if (currentName) {
          const shortName = currentName.length > 50
            ? currentName.substring(0, 47) + "…"
            : currentName;
          const categoryMessages: Record<string, string> = {
            Environment: `Since you're already involved in "${shortName}", this complements it well — together they have a compounding positive effect on the planet.`,
            Community: `Since you're already contributing through "${shortName}", adding this would strengthen your community impact significantly.`,
            Education: `Given your work with "${shortName}", this is a natural next step — both are about empowering others to reach their potential.`,
            Health: `Since you're already active with "${shortName}", this pairs naturally — both improve wellbeing in your local area.`,
          };
          return categoryMessages[category] ?? `Since you're already involved in "${shortName}", this is a great complementary activity.`;
        }
      }
    }

    // Fallback: interest-based or generic reasons
    if (preferredCategories.has(category)) {
      const interestMessages: Record<string, string> = {
        Environment: "Given your interest in the environment, this is a high-impact way to make a measurable difference to the planet.",
        Community: "Aligned with your focus on community — this directly helps people who need support most.",
        Education: "A great fit for your interest in education — it empowers others with knowledge that lasts a lifetime.",
        Health: "Suits your focus on health and wellbeing — this makes a real difference to people in your community.",
      };
      return interestMessages[category] ?? "A high-impact activity worth adding to your profile.";
    }

    const genericMessages: Record<string, string> = {
      Environment: "This directly reduces environmental harm and supports a more sustainable future.",
      Community: "Builds stronger communities and supports people who need it most.",
      Education: "Empowers others with knowledge and skills that create lasting change.",
      Health: "Improves physical or mental wellbeing for people in your local area.",
    };
    return genericMessages[category] ?? "A high-impact way to grow your social value.";
  }

  const availableActivities = ACTIVITIES.filter((a) => !currentIds.has(a.id));
  const weeklyHours = body.availableHoursPerWeek;

  const scored = availableActivities.map((a) => {
    const hoursNeeded = a.unit === "hour" ? weeklyHours : 1;
    const yearlyHours = hoursNeeded * 52;
    const estimatedImpact = a.unit === "hour" ? yearlyHours * a.valuePerUnit : a.valuePerUnit * hoursNeeded;
    const isPreferred = preferredCategories.has(a.category);

    const hasRelatedCurrent = Array.from(currentIds).some(
      (id) => (RELATED_PAIRS[id] || []).includes(a.id)
    );

    const reason = buildContextualReason(a.id, a.category);

    return {
      activityId: a.id,
      activityName: a.name,
      category: a.category,
      sdg: a.sdg,
      sdgColor: a.sdgColor,
      reason,
      estimatedImpactPerYear: Math.round(estimatedImpact * 100) / 100,
      recommendedHoursPerWeek: Math.min(weeklyHours, a.unit === "hour" ? weeklyHours : 1),
      estimatedImpact,
      isPreferred,
      hasRelatedCurrent,
    };
  });

  // When the user has stated interests, preferred-category activities always
  // fill the top slots. Non-preferred only appear to pad remaining space.
  const hasPreferences = preferredCategories.size > 0;

  const byImpactDesc = (a: typeof scored[0], b: typeof scored[0]) =>
    b.estimatedImpact - a.estimatedImpact;

  let suggestions: typeof scored;

  if (hasPreferences) {
    const related   = scored.filter((a) => a.hasRelatedCurrent).sort(byImpactDesc);
    const preferred = scored.filter((a) => !a.hasRelatedCurrent && a.isPreferred).sort(byImpactDesc);
    const other     = scored.filter((a) => !a.hasRelatedCurrent && !a.isPreferred).sort(byImpactDesc);
    suggestions = [...related, ...preferred, ...other].slice(0, 6);
  } else {
    // No stated interests — sort purely by impact
    suggestions = [...scored].sort(byImpactDesc).slice(0, 6);
  }

  const output = suggestions.map(({ estimatedImpact: _ei, isPreferred: _ip, hasRelatedCurrent: _hrc, ...rest }) => rest);

  res.json({ suggestions: output });
});

router.post("/save", authenticate, async (req: AuthenticatedRequest, res) => {
  const body = SaveImpactBody.parse(req.body);
  const userId = req.user!.id;
  const periodLabel = body.period ?? null;

  const newValues = {
    name: body.name,
    periodLabel,
    totalValue: String(body.impactResult.totalValue),
    impactValue: String(body.impactResult.impactValue),
    contributionValue: String(body.impactResult.contributionValue),
    donationsValue: String(body.impactResult.donationsValue),
    personalDevelopmentValue: String(body.impactResult.personalDevelopmentValue),
    totalHours: body.impactResult.totalHours,
    activitiesJson: body.activities,
    resultJson: body.impactResult,
    region: body.region ?? null,
    outwardCode: body.outwardCode ?? null,
    lat: body.lat != null ? String(body.lat) : null,
    lng: body.lng != null ? String(body.lng) : null,
  };

  let record;

  if (periodLabel !== null) {
    const existing = await db
      .select()
      .from(impactRecordsTable)
      .where(and(eq(impactRecordsTable.userId, userId), eq(impactRecordsTable.periodLabel, periodLabel)))
      .limit(1);

    if (existing.length > 0) {
      const [updated] = await db
        .update(impactRecordsTable)
        .set(newValues)
        .where(eq(impactRecordsTable.id, existing[0].id))
        .returning();
      record = updated;
    }
  }

  if (!record) {
    const [inserted] = await db
      .insert(impactRecordsTable)
      .values({ userId, ...newValues })
      .returning();
    record = inserted;
  }

  res.json({
    id: String(record.id),
    userId: record.userId,
    name: record.name,
    period: record.periodLabel ?? null,
    createdAt: record.createdAt.toISOString(),
    impactResult: body.impactResult,
  });
});

router.patch("/:id", authenticate, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const recordId = parseInt(req.params.id as string, 10);
  if (isNaN(recordId)) {
    res.status(400).json({ error: "Invalid record ID" });
    return;
  }

  const { periodLabel } = req.body as { periodLabel?: string };
  if (typeof periodLabel !== "string") {
    res.status(400).json({ error: "periodLabel is required" });
    return;
  }

  const [record] = await db
    .select()
    .from(impactRecordsTable)
    .where(and(eq(impactRecordsTable.id, recordId), eq(impactRecordsTable.userId, userId)))
    .limit(1);

  if (!record) {
    res.status(404).json({ error: "Record not found" });
    return;
  }

  const [updated] = await db
    .update(impactRecordsTable)
    .set({ periodLabel: periodLabel || null })
    .where(and(eq(impactRecordsTable.id, recordId), eq(impactRecordsTable.userId, userId)))
    .returning();

  res.json({
    id: String(updated.id),
    userId: updated.userId,
    name: updated.name,
    period: updated.periodLabel ?? null,
    createdAt: updated.createdAt.toISOString(),
  });
});

router.delete("/all", authenticate, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  await db.delete(impactRecordsTable).where(eq(impactRecordsTable.userId, userId));
  res.json({ success: true });
});

router.delete("/:id", authenticate, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const recordId = parseInt(req.params.id as string, 10);
  if (isNaN(recordId)) {
    res.status(400).json({ error: "Invalid record ID" });
    return;
  }

  const [record] = await db
    .select()
    .from(impactRecordsTable)
    .where(and(eq(impactRecordsTable.id, recordId), eq(impactRecordsTable.userId, userId)))
    .limit(1);

  if (!record) {
    res.status(404).json({ error: "Record not found" });
    return;
  }

  await db
    .delete(impactRecordsTable)
    .where(and(eq(impactRecordsTable.id, recordId), eq(impactRecordsTable.userId, userId)));

  res.json({ success: true });
});

router.get("/history", authenticate, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;

  const records = await db
    .select()
    .from(impactRecordsTable)
    .where(eq(impactRecordsTable.userId, userId))
    .orderBy(desc(impactRecordsTable.createdAt));

  const formatted = records.map((r) => ({
    id: String(r.id),
    userId: r.userId,
    name: r.name,
    period: r.periodLabel ?? null,
    createdAt: r.createdAt.toISOString(),
    impactResult: r.resultJson,
    activities: r.activitiesJson,
  }));

  res.json({ records: formatted });
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

async function computeOrgStats(orgId: string, from?: Date, to?: Date) {
  const members = await db.query.orgMembersTable.findMany({
    where: eq(orgMembersTable.orgId, orgId),
  });

  const memberIds = members.map(m => m.userId);

  let records: typeof impactRecordsTable.$inferSelect[] = [];
  if (memberIds.length > 0) {
    const baseCondition = inArray(impactRecordsTable.userId, memberIds);
    const fromCondition = from ? gte(impactRecordsTable.createdAt, from) : undefined;
    const toCondition = to ? lte(impactRecordsTable.createdAt, to) : undefined;
    records = await db.select().from(impactRecordsTable).where(and(baseCondition, fromCondition, toCondition));
  }

  const totalRecords = records.length;
  const totalUsers = new Set(records.map(r => r.userId)).size;

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

  const valueByCategory = Object.entries(categoryValueMap)
    .map(([category, value]) => ({ category, value: Math.round(value * 100) / 100 }))
    .sort((a, b) => b.value - a.value);

  return {
    totalRecords,
    totalUsers,
    totalMemberCount: memberIds.length,
    totalSocialValue: Math.round(totalSocialValue * 100) / 100,
    totalHours: Math.round(totalHours * 100) / 100,
    averageValuePerPerson: totalUsers > 0 ? Math.round((totalSocialValue / totalUsers) * 100) / 100 : 0,
    valueByCategory,
  };
}

router.get("/org-stats", authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;

    const membership = await db.query.orgMembersTable.findFirst({
      where: eq(orgMembersTable.userId, userId),
    });

    if (!membership) {
      res.status(404).json({ error: "You are not a member of any organisation." });
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
    const to = toRaw ? (() => { const d = new Date(toRaw); d.setHours(23, 59, 59, 999); return d; })() : undefined;

    const stats = await computeOrgStats(membership.orgId, from, to);

    res.json({ ...stats, recentActivity: [] });
  } catch (err) {
    res.status(500).json({ error: "Failed to compute org stats" });
  }
});

async function renderPdf(impactResult: unknown, userName: string, date: string): Promise<Buffer> {
  const pdfData = parsePdfData(impactResult, userName, date);
  const doc = buildImpactDocument(pdfData);
  return await renderToBuffer(doc);
}

function sendPdfBuffer(res: import("express").Response, buffer: Buffer): void {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="my-impact-report.pdf"`);
  res.setHeader("Content-Length", buffer.length);
  res.end(buffer);
}

router.post("/pdf", async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;

    if (!body.impactResult) {
      res.status(400).json({ error: "impactResult is required" });
      return;
    }

    const userName = typeof body.name === "string" ? body.name : "Anonymous";
    const date =
      typeof body.date === "string"
        ? body.date
        : new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

    const buffer = await renderPdf(body.impactResult, userName, date);
    sendPdfBuffer(res, buffer);
  } catch (err) {
    console.error("PDF generation error:", err);
    res.status(500).json({ error: "Failed to generate PDF" });
  }
});

router.get("/pdf", authenticate, async (req: AuthenticatedRequest, res) => {
  const recordIdParam = req.query.recordId;

  if (!recordIdParam || typeof recordIdParam !== "string") {
    res.status(400).json({ error: "recordId query parameter is required" });
    return;
  }

  try {
    const recordId = parseInt(recordIdParam, 10);
    if (isNaN(recordId)) {
      res.status(400).json({ error: "Invalid record ID" });
      return;
    }

    const userId = req.user!.id;

    const [record] = await db
      .select()
      .from(impactRecordsTable)
      .where(and(eq(impactRecordsTable.id, recordId), eq(impactRecordsTable.userId, userId)))
      .limit(1);

    if (!record) {
      res.status(404).json({ error: "Record not found" });
      return;
    }

    const userName = record.name ?? "My Impact";
    const date = record.createdAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

    const buffer = await renderPdf(record.resultJson, userName, date);
    sendPdfBuffer(res, buffer);
  } catch (err) {
    console.error("PDF generation error:", err);
    res.status(500).json({ error: "Failed to generate PDF" });
  }
});

export default router;
