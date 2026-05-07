import { Router, type IRouter } from "express";
import {
  CalculateImpactBody,
  GetActivitiesResponse,
  GetSuggestionsBody,
  SaveImpactBody,
} from "@workspace/api-zod";
import { db, impactRecordsTable, orgMembersTable, organisationsTable, orgMatchRatesTable, journalEntriesTable, recurringTemplatesTable, userProfilesTable, recordVerificationsTable } from "@workspace/db";
import { eq, desc, inArray, and, gte, lte, sql, asc, isNotNull, ilike, or } from "drizzle-orm";
import { getVerifiedTotalsForOrg } from "./org.js";
import { ACTIVITIES, CATEGORIES, calculateImpact } from "../lib/impactData.js";
import { authenticate, type AuthenticatedRequest } from "../middleware/authenticate.js";
import { calculateStreak } from "../lib/streak.js";
import { renderToBuffer } from "@react-pdf/renderer";
import { buildImpactDocument, parsePdfData } from "../lib/impactPdf.js";
import { buildEvidencePackDocument } from "../lib/evidencePackPdf.js";
import React from "react";
import { computeMatchesForRecords, type RecordForMatch } from "../lib/orgMatch.js";
import { enqueueOrgEvent } from "../lib/webhookDispatcher.js";
import { trackServerEvent } from "../lib/analytics.js";
import { recordAuditEvent } from "../lib/auditLog.js";
import {
  deleteAttachmentsForRecord,
  deleteAllAttachmentsForUser,
} from "../lib/attachmentCleanup.js";

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
    const yearlyHours = weeklyHours * 52;
    const estimatedImpact =
      a.unit === "hour"
        ? yearlyHours * a.valuePerUnit
        : a.defaultQuantity * a.valuePerUnit;
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
    // No stated interests — still surface related activities first, then sort remaining by impact
    const related = scored.filter((a) => a.hasRelatedCurrent).sort(byImpactDesc);
    const other   = scored.filter((a) => !a.hasRelatedCurrent).sort(byImpactDesc);
    suggestions = [...related, ...other].slice(0, 6);
  }

  const output = suggestions.map(({ estimatedImpact: _ei, isPreferred: _ip, hasRelatedCurrent: _hrc, ...rest }) => rest);

  res.json({ suggestions: output });
});

router.post("/save", authenticate, async (req: AuthenticatedRequest, res) => {
  const body = SaveImpactBody.parse(req.body);
  const userId = req.user!.id;
  const periodLabel = body.period ?? null;

  // Recompute impact server-side from the submitted activities so that
  // client-supplied totals in body.impactResult are never trusted or stored.
  const serverImpactResult = calculateImpact(
    body.activities,
    body.donationsGBP,
    body.additionalVolunteerHours,
    body.customActivities ?? []
  );

  // Snapshot the user's existing record count BEFORE writing so we can
  // emit `first_record_logged` on the very first save.
  const priorCountRows = await db
    .select({ id: impactRecordsTable.id })
    .from(impactRecordsTable)
    .where(eq(impactRecordsTable.userId, userId))
    .limit(1);
  const isFirstRecord = priorCountRows.length === 0;

  const newValues = {
    name: body.name,
    periodLabel,
    totalValue: String(serverImpactResult.totalValue),
    impactValue: String(serverImpactResult.impactValue),
    contributionValue: String(serverImpactResult.contributionValue),
    donationsValue: String(serverImpactResult.donationsValue),
    personalDevelopmentValue: String(serverImpactResult.personalDevelopmentValue),
    totalHours: serverImpactResult.totalHours,
    activitiesJson: body.activities,
    resultJson: serverImpactResult,
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
        .set({ ...newValues, createdAt: sql`now()` })
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

  if (isFirstRecord) {
    trackServerEvent({
      eventName: "first_record_logged",
      userId,
      surface: "member",
      props: {
        totalValue: Math.round(serverImpactResult.totalValue),
        totalHours: Math.round(serverImpactResult.totalHours),
        activityCount: body.activities?.length ?? 0,
      },
    });
  }

  // Fire `hours.logged` to any org webhooks subscribed for this user's org.
  // Non-blocking — failures here must not affect the user-facing save.
  (async () => {
    try {
      const membership = await db.query.orgMembersTable.findFirst({
        where: eq(orgMembersTable.userId, userId),
      });
      if (!membership) return;
      await enqueueOrgEvent({
        orgId: membership.orgId,
        eventType: "hours.logged",
        payload: {
          recordId: String(record.id),
          member: { ref: userId, email: req.user!.email },
          name: record.name,
          period: record.periodLabel ?? null,
          hours: serverImpactResult.totalHours,
          socialValueGBP: Math.round(serverImpactResult.totalValue * 100) / 100,
          attested: false,
          loggedAt: new Date().toISOString(),
        },
      });
    } catch (err) {
      console.error("[impact.save] failed to enqueue hours.logged:", err);
    }
  })();

  res.json({
    id: String(record.id),
    userId: record.userId,
    name: record.name,
    period: record.periodLabel ?? null,
    createdAt: record.createdAt.toISOString(),
    impactResult: serverImpactResult,
  });
});

router.patch("/:id", authenticate, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const recordId = parseInt(req.params.id as string, 10);
  if (isNaN(recordId)) {
    res.status(400).json({ error: "Invalid record ID" });
    return;
  }

  const body = req.body as { periodLabel?: string; tags?: unknown };
  const { periodLabel } = body;

  const updates: Record<string, unknown> = {};
  if (typeof periodLabel === "string") {
    updates.periodLabel = periodLabel || null;
  }
  if (Array.isArray(body.tags)) {
    const tags = body.tags
      .filter((t): t is string => typeof t === "string")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    updates.tags = Array.from(new Set(tags));
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "Provide periodLabel or tags" });
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
    .set(updates)
    .where(and(eq(impactRecordsTable.id, recordId), eq(impactRecordsTable.userId, userId)))
    .returning();

  res.json({
    id: String(updated.id),
    userId: updated.userId,
    name: updated.name,
    period: updated.periodLabel ?? null,
    createdAt: updated.createdAt.toISOString(),
    tags: updated.tags ?? [],
  });
});

router.delete("/all", authenticate, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const userEmail = req.user!.email;
  // Count what we're about to wipe so the audit row is meaningful and
  // matches what the Settings copy promises (impact records + journal
  // entries + recurring templates + every linked attachment).
  const [{ recordCount }] = await db
    .select({ recordCount: sql<number>`count(*)::int` })
    .from(impactRecordsTable)
    .where(eq(impactRecordsTable.userId, userId));
  const [{ journalCount }] = await db
    .select({ journalCount: sql<number>`count(*)::int` })
    .from(journalEntriesTable)
    .where(eq(journalEntriesTable.userId, userId));
  const [{ recurringCount }] = await db
    .select({ recurringCount: sql<number>`count(*)::int` })
    .from(recurringTemplatesTable)
    .where(eq(recurringTemplatesTable.userId, userId));
  // Remove every linked attachment (DB row + GCS object) for both
  // records AND journal entries before dropping the parents so storage
  // is fully reclaimed.
  const attachmentsRemoved = await deleteAllAttachmentsForUser(userId);
  await db.delete(journalEntriesTable).where(eq(journalEntriesTable.userId, userId));
  await db.delete(recurringTemplatesTable).where(eq(recurringTemplatesTable.userId, userId));
  await db.delete(impactRecordsTable).where(eq(impactRecordsTable.userId, userId));
  await recordAuditEvent({
    userId,
    userEmail,
    action: "impact_data_wipe",
    req,
    metadata: {
      recordsRemoved: recordCount,
      journalEntriesRemoved: journalCount,
      recurringTemplatesRemoved: recurringCount,
      attachmentsRemoved,
    },
  });
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

  // Drop linked attachments (DB rows + GCS objects) before deleting the
  // record itself so files don't get orphaned in object storage.
  await deleteAttachmentsForRecord(userId, recordId);

  await db
    .delete(impactRecordsTable)
    .where(and(eq(impactRecordsTable.id, recordId), eq(impactRecordsTable.userId, userId)));

  res.json({ success: true });
});

router.get("/history", authenticate, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;

  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const tagsParam = typeof req.query.tags === "string" ? req.query.tags : "";
  const tagFilters = tagsParam
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const conditions = [eq(impactRecordsTable.userId, userId)];

  if (q) {
    const like = `%${q}%`;
    const searchClause = or(
      ilike(impactRecordsTable.name, like),
      ilike(impactRecordsTable.periodLabel, like),
      sql`${impactRecordsTable.activitiesJson}::text ILIKE ${like}`,
    );
    if (searchClause) conditions.push(searchClause);
  }

  if (tagFilters.length > 0) {
    conditions.push(sql`${impactRecordsTable.tags} @> ARRAY[${sql.join(tagFilters.map((t) => sql`${t}`), sql`, `)}]::text[]`);
  }

  const records = await db
    .select()
    .from(impactRecordsTable)
    .where(and(...conditions))
    .orderBy(desc(impactRecordsTable.createdAt));

  const profile = await db.query.userProfilesTable.findFirst({
    where: eq(userProfilesTable.userId, userId),
  });
  const streakInfo = calculateStreak(records.map((r) => r.createdAt));
  const streak = { ...streakInfo, lastAckedMilestone: profile?.lastAckedStreakMilestone ?? 0 };

  const recordIds = records.map(r => r.id);
  let verifMap = new Map<number, { status: string; reason: string | null; orgName: string; decidedAt: string | null }>();
  if (recordIds.length > 0) {
    const verifs = await db
      .select({
        recordId: recordVerificationsTable.recordId,
        status: recordVerificationsTable.status,
        reason: recordVerificationsTable.reason,
        decidedAt: recordVerificationsTable.decidedAt,
        orgName: organisationsTable.name,
      })
      .from(recordVerificationsTable)
      .innerJoin(organisationsTable, eq(organisationsTable.id, recordVerificationsTable.orgId))
      .where(inArray(recordVerificationsTable.recordId, recordIds));
    for (const v of verifs) {
      verifMap.set(v.recordId, {
        status: v.status,
        reason: v.reason,
        orgName: v.orgName,
        decidedAt: v.decidedAt ? v.decidedAt.toISOString() : null,
      });
    }
  }

  const formatted = records.map((r) => ({
    id: String(r.id),
    userId: r.userId,
    name: r.name,
    period: r.periodLabel ?? null,
    createdAt: r.createdAt.toISOString(),
    impactResult: r.resultJson,
    activities: r.activitiesJson,
    region: r.region ?? null,
    outwardCode: r.outwardCode ?? null,
    lat: r.lat != null ? Number(r.lat) : null,
    lng: r.lng != null ? Number(r.lng) : null,
    verification: verifMap.get(r.id) ?? null,
    tags: r.tags ?? [],
  }));

  res.json({ records: formatted, streak });
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

    if (membership.role !== "manager") {
      res.status(403).json({ error: "Only organisation managers can access org statistics." });
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

    const [stats, verified] = await Promise.all([
      computeOrgStats(membership.orgId, from, to),
      getVerifiedTotalsForOrg(membership.orgId, from, to),
    ]);

    res.json({ ...stats, ...verified, recentActivity: [] });
  } catch (err) {
    res.status(500).json({ error: "Failed to compute org stats" });
  }
});

interface RecapBreakdownEntry {
  activityId?: string;
  activityName?: string;
  category?: string;
  sdg?: string;
  sdgColor?: string;
  impactValue?: number;
  hours?: number;
}

interface RecapResultJson {
  totalValue?: number;
  totalHours?: number;
  donationsValue?: number;
  activityBreakdowns?: RecapBreakdownEntry[];
}

function parseRecapResult(raw: unknown): RecapResultJson {
  if (raw === null || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  return {
    totalValue: typeof r.totalValue === "number" ? r.totalValue : 0,
    totalHours: typeof r.totalHours === "number" ? r.totalHours : 0,
    donationsValue: typeof r.donationsValue === "number" ? r.donationsValue : 0,
    activityBreakdowns: Array.isArray(r.activityBreakdowns) ? (r.activityBreakdowns as RecapBreakdownEntry[]) : [],
  };
}

router.get("/recap/:year", authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const yearParam = parseInt(req.params.year as string, 10);
    if (isNaN(yearParam) || yearParam < 2000 || yearParam > 2100) {
      res.status(400).json({ error: "Invalid year" });
      return;
    }

    const start = new Date(Date.UTC(yearParam, 0, 1, 0, 0, 0));
    const end = new Date(Date.UTC(yearParam + 1, 0, 1, 0, 0, 0));

    const yearRecords = await db
      .select()
      .from(impactRecordsTable)
      .where(
        and(
          eq(impactRecordsTable.userId, userId),
          gte(impactRecordsTable.createdAt, start),
          lte(impactRecordsTable.createdAt, end),
        ),
      )
      .orderBy(desc(impactRecordsTable.createdAt));

    const lifetimeRecords = await db
      .select()
      .from(impactRecordsTable)
      .where(eq(impactRecordsTable.userId, userId))
      .orderBy(impactRecordsTable.createdAt);

    let totalValue = 0;
    let totalHours = 0;
    let totalDonations = 0;

    const activityMap = new Map<string, { activityId: string; activityName: string; category: string; sdg: string; sdgColor: string; impactValue: number; hours: number }>();
    const sdgMap = new Map<string, { sdg: string; sdgColor: string; value: number }>();
    const categories = new Set<string>();

    let biggestSession: { recordId: string; name: string; period: string | null; totalValue: number; totalHours: number; createdAt: string } | null = null;

    for (const r of yearRecords) {
      const result = parseRecapResult(r.resultJson);
      const rTotal = result.totalValue ?? 0;
      const rHours = result.totalHours ?? 0;
      totalValue += rTotal;
      totalHours += rHours;
      totalDonations += result.donationsValue ?? 0;

      if (!biggestSession || rTotal > biggestSession.totalValue) {
        biggestSession = {
          recordId: String(r.id),
          name: r.name,
          period: r.periodLabel ?? null,
          totalValue: Math.round(rTotal * 100) / 100,
          totalHours: rHours,
          createdAt: r.createdAt.toISOString(),
        };
      }

      for (const b of result.activityBreakdowns ?? []) {
        const aId = b.activityId ?? b.activityName ?? "unknown";
        const aName = b.activityName ?? aId;
        const cat = b.category ?? "Other";
        const sdg = b.sdg ?? "";
        const sdgColor = b.sdgColor ?? "#999";
        const impactValue = typeof b.impactValue === "number" ? b.impactValue : 0;
        const hours = typeof b.hours === "number" ? b.hours : 0;

        if (cat) categories.add(cat);

        const existing = activityMap.get(aId);
        if (existing) {
          existing.impactValue += impactValue;
          existing.hours += hours;
        } else {
          activityMap.set(aId, {
            activityId: aId,
            activityName: aName,
            category: cat,
            sdg,
            sdgColor,
            impactValue,
            hours,
          });
        }

        if (sdg) {
          const sdgEntry = sdgMap.get(sdg);
          if (sdgEntry) {
            sdgEntry.value += impactValue;
          } else {
            sdgMap.set(sdg, { sdg, sdgColor, value: impactValue });
          }
        }
      }
    }

    const topActivityRaw = Array.from(activityMap.values()).sort((a, b) => b.impactValue - a.impactValue)[0] ?? null;
    const topActivity = topActivityRaw
      ? {
          ...topActivityRaw,
          impactValue: Math.round(topActivityRaw.impactValue * 100) / 100,
          hours: Math.round(topActivityRaw.hours * 100) / 100,
        }
      : null;

    const topSdgRaw = Array.from(sdgMap.values()).sort((a, b) => b.value - a.value)[0] ?? null;
    const topSdg = topSdgRaw
      ? { ...topSdgRaw, value: Math.round(topSdgRaw.value * 100) / 100 }
      : null;

    // Journal highlight — pick the longest reflection or entry text from the year
    const yearJournals = await db
      .select()
      .from(journalEntriesTable)
      .where(
        and(
          eq(journalEntriesTable.userId, userId),
          gte(journalEntriesTable.createdAt, start),
          lte(journalEntriesTable.createdAt, end),
          isNotNull(journalEntriesTable.text),
        ),
      );

    type JournalRow = typeof journalEntriesTable.$inferSelect;
    const journalsRanked: JournalRow[] = yearJournals
      .filter((j: JournalRow) => (j.text ?? "").trim().length >= 30)
      .sort((a: JournalRow, b: JournalRow) => (b.text?.length ?? 0) - (a.text?.length ?? 0));

    let journalHighlight: { id: string; text: string; prompt: string | null; createdAt: string } | null = null;
    const picked = journalsRanked[0];
    if (picked) {
      const rawText = picked.text ?? "";
      const truncated = rawText.length > 320 ? rawText.slice(0, 317).trimEnd() + "…" : rawText;
      journalHighlight = {
        id: String(picked.id),
        text: truncated,
        prompt: picked.prompt ?? null,
        createdAt: picked.createdAt.toISOString(),
      };
    }

    let lifetimeTotalValue = 0;
    for (const r of lifetimeRecords) {
      const result = parseRecapResult(r.resultJson);
      lifetimeTotalValue += result.totalValue ?? 0;
    }
    const firstRecord = lifetimeRecords[0] ?? null;

    const milestonesEarnedCount = computeMilestoneCount(totalValue, totalHours, categories.size);

    const hasEnoughActivity = yearRecords.length > 0 && totalValue > 0;

    res.json({
      year: yearParam,
      hasEnoughActivity,
      recordCount: yearRecords.length,
      totalValue: Math.round(totalValue * 100) / 100,
      totalHours: Math.round(totalHours * 100) / 100,
      totalDonations: Math.round(totalDonations * 100) / 100,
      categoriesCount: categories.size,
      sdgsCount: sdgMap.size,
      topActivity,
      topSdg,
      biggestSession,
      journalHighlight,
      milestonesEarnedCount,
      firstRecordAt: firstRecord ? firstRecord.createdAt.toISOString() : null,
      lifetimeRecordCount: lifetimeRecords.length,
      lifetimeTotalValue: Math.round(lifetimeTotalValue * 100) / 100,
    });
  } catch (err) {
    console.error("Recap generation error:", err);
    res.status(500).json({ error: "Failed to generate recap" });
  }
});

function computeMilestoneCount(totalValue: number, totalHours: number, categoryCount: number): number {
  let count = 0;
  if (totalValue >= 100) count++;
  if (totalValue >= 500) count++;
  if (totalValue >= 1000) count++;
  if (totalValue >= 5000) count++;
  if (totalValue >= 10000) count++;
  if (totalHours >= 10) count++;
  if (totalHours >= 50) count++;
  if (totalHours >= 100) count++;
  if (categoryCount >= 3) count++;
  if (categoryCount >= 4) count++;
  return count;
}

// ============================================================================
// Recurring activity templates
// ============================================================================

type Cadence = "weekly" | "fortnightly" | "monthly";

function isValidCadence(value: unknown): value is Cadence {
  return value === "weekly" || value === "fortnightly" || value === "monthly";
}

function startOfDayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Compute the next due date (>= today, in UTC) for a template based on its
 * cadence and dayOfPeriod. Skipping does not break the schedule because we
 * always compute relative to today's calendar.
 *
 * weekly:      dayOfPeriod = 0–6 (Sun=0). Returns the next occurrence today or
 *              within the next 6 days.
 * fortnightly: dayOfPeriod = 0–6. Returns the next occurrence whose week
 *              parity (relative to anchorDate) matches.
 * monthly:     dayOfPeriod = 1–28. Returns this month's day if it hasn't
 *              passed, otherwise next month's.
 */
function computeNextDueDate(cadence: Cadence, dayOfPeriod: number, anchor: Date, now: Date): Date {
  const today = startOfDayUTC(now);

  if (cadence === "monthly") {
    const day = Math.max(1, Math.min(28, Math.round(dayOfPeriod)));
    const candidate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), day));
    if (candidate.getTime() >= today.getTime()) return candidate;
    return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, day));
  }

  // weekly / fortnightly
  const targetDow = ((Math.round(dayOfPeriod) % 7) + 7) % 7;
  const todayDow = today.getUTCDay();
  let offset = (targetDow - todayDow + 7) % 7;
  let candidate = new Date(today);
  candidate.setUTCDate(candidate.getUTCDate() + offset);

  if (cadence === "fortnightly") {
    const anchorMidnight = startOfDayUTC(anchor);
    const msPerDay = 24 * 60 * 60 * 1000;
    const weeksFromAnchor = Math.floor((candidate.getTime() - anchorMidnight.getTime()) / (7 * msPerDay));
    if (((weeksFromAnchor % 2) + 2) % 2 !== 0) {
      candidate = new Date(candidate);
      candidate.setUTCDate(candidate.getUTCDate() + 7);
    }
  }

  return candidate;
}

/**
 * Compute the most recent scheduled occurrence on or before today. Used to
 * determine whether the user has confirmed it yet.
 */
function computeLastScheduledDate(cadence: Cadence, dayOfPeriod: number, anchor: Date, now: Date): Date {
  const today = startOfDayUTC(now);

  if (cadence === "monthly") {
    const day = Math.max(1, Math.min(28, Math.round(dayOfPeriod)));
    const candidate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), day));
    if (candidate.getTime() <= today.getTime()) return candidate;
    return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, day));
  }

  const targetDow = ((Math.round(dayOfPeriod) % 7) + 7) % 7;
  const todayDow = today.getUTCDay();
  let offset = (todayDow - targetDow + 7) % 7;
  let candidate = new Date(today);
  candidate.setUTCDate(candidate.getUTCDate() - offset);

  if (cadence === "fortnightly") {
    const anchorMidnight = startOfDayUTC(anchor);
    const msPerDay = 24 * 60 * 60 * 1000;
    const weeksFromAnchor = Math.floor((candidate.getTime() - anchorMidnight.getTime()) / (7 * msPerDay));
    if (((weeksFromAnchor % 2) + 2) % 2 !== 0) {
      candidate = new Date(candidate);
      candidate.setUTCDate(candidate.getUTCDate() - 7);
    }
  }

  return candidate;
}

interface TemplateRow {
  id: number;
  userId: string;
  label: string;
  cadence: string;
  dayOfPeriod: number;
  anchorDate: Date;
  defaultActivities: unknown;
  defaultDonationsGBP: string;
  lastConfirmedAt: Date | null;
  createdAt: Date;
}

function serializeTemplate(row: TemplateRow, now: Date) {
  const cadence = isValidCadence(row.cadence) ? row.cadence : "weekly";
  const lastScheduled = computeLastScheduledDate(cadence, row.dayOfPeriod, row.anchorDate, now);
  const nextDue = computeNextDueDate(cadence, row.dayOfPeriod, row.anchorDate, now);
  const confirmed = row.lastConfirmedAt && row.lastConfirmedAt.getTime() >= lastScheduled.getTime();
  const isDue = !confirmed && lastScheduled.getTime() <= startOfDayUTC(now).getTime();

  return {
    id: String(row.id),
    label: row.label,
    cadence,
    dayOfPeriod: row.dayOfPeriod,
    defaultActivities: Array.isArray(row.defaultActivities) ? row.defaultActivities : [],
    defaultDonationsGBP: Number(row.defaultDonationsGBP),
    anchorDate: row.anchorDate.toISOString(),
    lastConfirmedAt: row.lastConfirmedAt ? row.lastConfirmedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    nextDueDate: nextDue.toISOString(),
    isDue,
  };
}

interface TemplateInputBody {
  label?: unknown;
  cadence?: unknown;
  dayOfPeriod?: unknown;
  defaultActivities?: unknown;
  defaultDonationsGBP?: unknown;
}

function parseTemplateInput(raw: unknown): { ok: true; data: {
  label: string;
  cadence: Cadence;
  dayOfPeriod: number;
  defaultActivities: unknown[];
  defaultDonationsGBP: number;
} } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Invalid body" };
  const body = raw as TemplateInputBody;

  const label = typeof body.label === "string" ? body.label.trim() : "";
  if (!label) return { ok: false, error: "label is required" };
  if (label.length > 120) return { ok: false, error: "label is too long" };

  if (!isValidCadence(body.cadence)) {
    return { ok: false, error: "cadence must be weekly, fortnightly, or monthly" };
  }

  const dayOfPeriodRaw = Number(body.dayOfPeriod);
  if (!Number.isFinite(dayOfPeriodRaw)) return { ok: false, error: "dayOfPeriod is required" };
  const dayOfPeriod = Math.round(dayOfPeriodRaw);
  if (body.cadence === "monthly") {
    if (dayOfPeriod < 1 || dayOfPeriod > 28) return { ok: false, error: "dayOfPeriod must be 1–28 for monthly" };
  } else {
    if (dayOfPeriod < 0 || dayOfPeriod > 6) return { ok: false, error: "dayOfPeriod must be 0–6 for weekly/fortnightly" };
  }

  if (!Array.isArray(body.defaultActivities)) {
    return { ok: false, error: "defaultActivities must be an array" };
  }

  const donationsRaw = Number(body.defaultDonationsGBP ?? 0);
  if (!Number.isFinite(donationsRaw) || donationsRaw < 0) {
    return { ok: false, error: "defaultDonationsGBP must be a non-negative number" };
  }

  return {
    ok: true,
    data: {
      label,
      cadence: body.cadence,
      dayOfPeriod,
      defaultActivities: body.defaultActivities,
      defaultDonationsGBP: donationsRaw,
    },
  };
}

router.get("/templates", authenticate, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const rows = await db
    .select()
    .from(recurringTemplatesTable)
    .where(eq(recurringTemplatesTable.userId, userId))
    .orderBy(desc(recurringTemplatesTable.createdAt));

  const now = new Date();
  const templates = rows.map((r) => serializeTemplate(r as TemplateRow, now));
  res.json({ templates });
});

router.post("/templates", authenticate, async (req: AuthenticatedRequest, res) => {
  const parsed = parseTemplateInput(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const userId = req.user!.id;

  const [inserted] = await db
    .insert(recurringTemplatesTable)
    .values({
      userId,
      label: parsed.data.label,
      cadence: parsed.data.cadence,
      dayOfPeriod: parsed.data.dayOfPeriod,
      defaultActivities: parsed.data.defaultActivities,
      defaultDonationsGBP: String(parsed.data.defaultDonationsGBP),
    })
    .returning();

  res.json(serializeTemplate(inserted as TemplateRow, new Date()));
});

router.patch("/templates/:id", authenticate, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid template ID" });
    return;
  }

  const parsed = parseTemplateInput(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  const [existing] = await db
    .select()
    .from(recurringTemplatesTable)
    .where(and(eq(recurringTemplatesTable.id, id), eq(recurringTemplatesTable.userId, userId)))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Template not found" });
    return;
  }

  const [updated] = await db
    .update(recurringTemplatesTable)
    .set({
      label: parsed.data.label,
      cadence: parsed.data.cadence,
      dayOfPeriod: parsed.data.dayOfPeriod,
      defaultActivities: parsed.data.defaultActivities,
      defaultDonationsGBP: String(parsed.data.defaultDonationsGBP),
    })
    .where(and(eq(recurringTemplatesTable.id, id), eq(recurringTemplatesTable.userId, userId)))
    .returning();

  res.json(serializeTemplate(updated as TemplateRow, new Date()));
});

router.delete("/templates/:id", authenticate, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid template ID" });
    return;
  }

  const [existing] = await db
    .select()
    .from(recurringTemplatesTable)
    .where(and(eq(recurringTemplatesTable.id, id), eq(recurringTemplatesTable.userId, userId)))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Template not found" });
    return;
  }

  await db
    .delete(recurringTemplatesTable)
    .where(and(eq(recurringTemplatesTable.id, id), eq(recurringTemplatesTable.userId, userId)));

  res.json({ success: true });
});

router.post("/templates/:id/confirm", authenticate, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid template ID" });
    return;
  }

  const [existing] = await db
    .select()
    .from(recurringTemplatesTable)
    .where(and(eq(recurringTemplatesTable.id, id), eq(recurringTemplatesTable.userId, userId)))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Template not found" });
    return;
  }

  const [updated] = await db
    .update(recurringTemplatesTable)
    .set({ lastConfirmedAt: new Date() })
    .where(and(eq(recurringTemplatesTable.id, id), eq(recurringTemplatesTable.userId, userId)))
    .returning();

  res.json(serializeTemplate(updated as TemplateRow, new Date()));
});

router.get("/match-info", authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;

    const membership = await db.query.orgMembersTable.findFirst({
      where: eq(orgMembersTable.userId, userId),
    });
    if (!membership) {
      res.json({ org: null, matches: [] });
      return;
    }

    const org = await db.query.organisationsTable.findFirst({
      where: eq(organisationsTable.id, membership.orgId),
      columns: { id: true, name: true },
    });
    if (!org) {
      res.json({ org: null, matches: [] });
      return;
    }

    const rates = await db.query.orgMatchRatesTable.findMany({
      where: eq(orgMatchRatesTable.orgId, org.id),
      orderBy: (t) => [asc(t.effectiveFrom)],
    });

    if (rates.length === 0) {
      res.json({ org: { id: org.id, name: org.name }, matches: [] });
      return;
    }

    const records = await db
      .select({
        id: impactRecordsTable.id,
        userId: impactRecordsTable.userId,
        createdAt: impactRecordsTable.createdAt,
        resultJson: impactRecordsTable.resultJson,
      })
      .from(impactRecordsTable)
      .where(eq(impactRecordsTable.userId, userId));

    const recordsForMatch: RecordForMatch[] = records.map(r => {
      const raw = r.resultJson as Record<string, unknown> | null;
      const totalHours = raw && typeof raw.totalHours === "number" ? raw.totalHours : 0;
      const donationsValue = raw && typeof raw.donationsValue === "number" ? raw.donationsValue : 0;
      return { id: r.id, userId: r.userId, createdAt: r.createdAt, totalHours, donationsValue };
    });

    const matches = computeMatchesForRecords(recordsForMatch, rates);

    res.json({
      org: { id: org.id, name: org.name },
      matches: matches
        .filter(m => m.matchedValue > 0)
        .map(m => ({
          recordId: m.recordId,
          matchedValue: m.matchedValue,
          hoursMatched: m.hoursMatched,
          donationsMatched: m.donationsMatched,
          cappedAtMonthlyLimit: m.cappedAtMonthlyLimit,
        })),
    });
  } catch (err) {
    console.error("Match-info error:", err);
    res.status(500).json({ error: "Failed to load match information" });
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

router.post("/evidence-pack", async (_req, res) => {
  try {
    const date = new Date().toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const doc = buildEvidencePackDocument({ date });
    const buffer = await renderToBuffer(doc);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="my-impact-evidence-pack.pdf"`);
    res.setHeader("Content-Length", buffer.length);
    res.end(buffer);
  } catch (err) {
    console.error("Evidence pack generation error:", err);
    res.status(500).json({ error: "Failed to generate evidence pack" });
  }
});

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
