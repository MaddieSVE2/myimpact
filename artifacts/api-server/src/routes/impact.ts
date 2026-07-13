import { Router, type IRouter } from "express";
import {
  CalculateImpactBody,
  GetActivitiesResponse,
  GetSuggestionsBody,
  SaveImpactBody,
} from "@workspace/api-zod";
import { db, impactRecordsTable, orgMembersTable, organisationsTable, orgMatchRatesTable, journalEntriesTable, recurringTemplatesTable, userProfilesTable, recordVerificationsTable } from "@workspace/db";
import { eq, desc, inArray, and, gte, lte, lt, sql, asc, isNotNull, ilike, or } from "drizzle-orm";
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
import { getPeriodBounds } from "../lib/summaryPeriod.js";

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

// Calendar-year helpers --------------------------------------------------
// Every entry has an `entryDate` that determines which calendar year and
// month it belongs to. These helpers keep that logic in one place so the
// dashboard, year picker, recap, and habit-bulk-create stay consistent.
function parseEntryDate(raw: unknown): Date {
  if (typeof raw === "string" && raw) {
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date();
}

function calendarMonthLabel(d: Date): string {
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

function startOfYearUTC(year: number): Date {
  return new Date(Date.UTC(year, 0, 1, 0, 0, 0));
}

// Exclusive upper bound for calendar-year queries: midnight on Jan 1 of the
// next year. All year filters must use this as a strict `<` so that an entry
// dated 1 Jan of the following year never leaks back into the prior year's
// totals.
function endOfYearUTC(year: number): Date {
  return new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0));
}

function startOfMonthOfDate(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0));
}

// Pick out the activity ids embedded in a stored `activitiesJson` payload so
// /save can detect when a user is about to create a new entry that would
// overlap an already-existing habit entry for the same calendar month.
function extractActivityIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const ids: string[] = [];
  for (const a of raw) {
    if (a && typeof a === "object" && typeof (a as { activityId?: unknown }).activityId === "string") {
      ids.push((a as { activityId: string }).activityId);
    }
  }
  return ids;
}

function startOfMonthUTC(year: number, monthIndex: number): Date {
  return new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0));
}

// Auto-verification hook. Some organisations (e.g. universities) count every
// member activity toward their totals without a manager approval step. For
// each org the user actively belongs to where `autoVerifyActivities` is true,
// insert an approved record_verifications row for each freshly created
// impact record. The (recordId, orgId) unique constraint plus
// onConflictDoNothing makes this idempotent and safe against races with a
// manual verification request. Failures are logged but never block the save.
async function autoVerifyRecordsForUser(userId: string, recordIds: number[]): Promise<void> {
  if (recordIds.length === 0) return;
  try {
    const autoOrgs = await db
      .select({ orgId: orgMembersTable.orgId })
      .from(orgMembersTable)
      .innerJoin(organisationsTable, eq(organisationsTable.id, orgMembersTable.orgId))
      .where(
        and(
          eq(orgMembersTable.userId, userId),
          eq(orgMembersTable.status, "active"),
          eq(organisationsTable.autoVerifyActivities, true),
        ),
      );
    if (autoOrgs.length === 0) return;

    const now = new Date();
    const values = autoOrgs.flatMap(({ orgId }) =>
      recordIds.map((recordId) => ({
        recordId,
        orgId,
        status: "approved" as const,
        decidedAt: now,
        reason: "auto-verified",
      })),
    );
    await db.insert(recordVerificationsTable).values(values).onConflictDoNothing();
  } catch (err) {
    console.error("[impact] auto-verify failed:", err);
  }
}

router.post("/save", authenticate, async (req: AuthenticatedRequest, res) => {
  const body = SaveImpactBody.parse(req.body);
  const userId = req.user!.id;
  const rawBody = req.body as Record<string, unknown>;
  const entryDate = parseEntryDate(rawBody.entryDate);
  const todayUTC = new Date();
  // If the entry is dated to a prior calendar year, mark its source so the
  // UI can label it "added later". Habit-spawned entries are never created
  // through /save (see /templates/:id/confirm), so source is one of
  // "user" | "retrospective".
  const isRetrospective = entryDate.getUTCFullYear() < todayUTC.getUTCFullYear();
  const source = isRetrospective ? "retrospective" : "user";
  // Derive a calendar period label when the client doesn't supply one,
  // so existing UI surfaces (history list, org webhooks) keep showing a
  // human-friendly window.
  const periodLabel = body.period ?? calendarMonthLabel(entryDate);

  // Optional `targetRecordId` lets the client deliberately edit a specific
  // existing record (used by the History "edit" flow). When omitted, /save
  // always creates a new row — we no longer upsert by periodLabel, because
  // habits now legitimately produce multiple records sharing the same label.
  const targetRecordIdRaw = rawBody.targetRecordId;
  const targetRecordId = typeof targetRecordIdRaw === "number" && Number.isFinite(targetRecordIdRaw)
    ? targetRecordIdRaw
    : typeof targetRecordIdRaw === "string" && /^\d+$/.test(targetRecordIdRaw)
      ? parseInt(targetRecordIdRaw, 10)
      : null;
  const force = rawBody.force === true;

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
    entryDate,
    source,
  };

  let record;

  if (targetRecordId != null) {
    // Explicit edit. Verify ownership before updating so users can't touch
    // each other's rows by guessing ids.
    const [owned] = await db
      .select({
        id: impactRecordsTable.id,
        source: impactRecordsTable.source,
        habitTemplateId: impactRecordsTable.habitTemplateId,
      })
      .from(impactRecordsTable)
      .where(and(eq(impactRecordsTable.id, targetRecordId), eq(impactRecordsTable.userId, userId)))
      .limit(1);
    if (!owned) {
      res.status(404).json({ error: "Target record not found" });
      return;
    }
    // CRITICAL: when editing a habit-generated entry (the canonical
    // conflict-resolution path), keep its `source` and `habitTemplateId`
    // intact. Otherwise the row would lose its habit identity and a
    // subsequent overlapping save in the same month would slip past the
    // 409 conflict check and silently double-count.
    const updateValues = owned.habitTemplateId != null || owned.source === "habit"
      ? { ...newValues, source: owned.source, habitTemplateId: owned.habitTemplateId }
      : newValues;
    const [updated] = await db
      .update(impactRecordsTable)
      .set(updateValues)
      .where(eq(impactRecordsTable.id, owned.id))
      .returning();
    record = updated;
  } else {
    // No silent merge: if a habit-generated entry already covers the same
    // calendar month with any overlapping activity, return 409 so the
    // client can offer the user the choice to edit that existing entry
    // (or pass `force: true` to log an additional one anyway).
    if (!force) {
      const monthStart = startOfMonthOfDate(entryDate);
      const monthEnd = new Date(Date.UTC(entryDate.getUTCFullYear(), entryDate.getUTCMonth() + 1, 1, 0, 0, 0));
      // Treat a row as habit-generated for conflict purposes if EITHER its
      // source is "habit" OR it has a habitTemplateId. Belt-and-braces in
      // case `source` was ever rewritten by an earlier code path.
      const candidates = await db
        .select({ id: impactRecordsTable.id, activitiesJson: impactRecordsTable.activitiesJson, periodLabel: impactRecordsTable.periodLabel, source: impactRecordsTable.source, habitTemplateId: impactRecordsTable.habitTemplateId })
        .from(impactRecordsTable)
        .where(
          and(
            eq(impactRecordsTable.userId, userId),
            gte(impactRecordsTable.entryDate, monthStart),
            lt(impactRecordsTable.entryDate, monthEnd),
          ),
        )
        .then((rows) => rows.filter((r) => r.source === "habit" || r.habitTemplateId != null));
      const newActivityIds = new Set(extractActivityIds(body.activities as unknown));
      const conflict = candidates.find((c) =>
        extractActivityIds(c.activitiesJson).some((id) => newActivityIds.has(id)),
      );
      if (conflict) {
        res.status(409).json({
          error: "habit_entry_conflict",
          message:
            "A recurring habit already has an entry for this month with overlapping activities. Edit it from your history, or resend with force=true to add this as a separate entry.",
          existingRecordId: String(conflict.id),
          period: conflict.periodLabel ?? periodLabel,
        });
        return;
      }
    }

    const [inserted] = await db
      .insert(impactRecordsTable)
      .values({ userId, ...newValues })
      .returning();
    record = inserted;

    // Auto-approve this record for any of the user's orgs that skip the
    // manual verification step (e.g. universities).
    await autoVerifyRecordsForUser(userId, [record.id]);
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
    entryDate: record.entryDate.toISOString().slice(0, 10),
    source: record.source,
    habitTemplateId: record.habitTemplateId ?? null,
    impactResult: serverImpactResult,
    tags: record.tags ?? [],
  });
});

router.patch("/:id", authenticate, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const recordId = parseInt(req.params.id as string, 10);
  if (isNaN(recordId)) {
    res.status(400).json({ error: "Invalid record ID" });
    return;
  }

  const body = req.body as { periodLabel?: string; tags?: unknown; entryDate?: string };
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
  if (typeof body.entryDate === "string" && body.entryDate) {
    const d = new Date(body.entryDate);
    if (!isNaN(d.getTime())) updates.entryDate = d;
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "Provide periodLabel, entryDate, or tags" });
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
    entryDate: updated.entryDate.toISOString().slice(0, 10),
    source: updated.source,
    habitTemplateId: updated.habitTemplateId ?? null,
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

  // Calendar-year filter — when the dashboard's year picker selects a year,
  // only entries whose entry_date falls in that year come back.
  const yearParam = typeof req.query.year === "string" ? parseInt(req.query.year, 10) : NaN;
  if (!isNaN(yearParam) && yearParam >= 2000 && yearParam <= 2100) {
    conditions.push(gte(impactRecordsTable.entryDate, startOfYearUTC(yearParam)));
    conditions.push(lt(impactRecordsTable.entryDate, endOfYearUTC(yearParam)));
  }

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
    .orderBy(desc(impactRecordsTable.entryDate), desc(impactRecordsTable.createdAt));

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
    entryDate: r.entryDate.toISOString().slice(0, 10),
    source: r.source,
    habitTemplateId: r.habitTemplateId ?? null,
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
    where: and(eq(orgMembersTable.orgId, orgId), eq(orgMembersTable.status, "active")),
  });

  const memberIds = members.map(m => m.userId);

  let records: typeof impactRecordsTable.$inferSelect[] = [];
  if (memberIds.length > 0) {
    const baseCondition = inArray(impactRecordsTable.userId, memberIds);
    const fromCondition = from ? gte(impactRecordsTable.entryDate, from) : undefined;
    const toCondition = to ? lt(impactRecordsTable.entryDate, to) : undefined;
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

    // Resolve period bounds: prefer explicit from/to, otherwise use
    // the org's saved summaryYearStart + periodOffset query param.
    let from: Date | undefined;
    let to: Date | undefined;
    const fromParam = req.query.from;
    const toParam = req.query.to;
    const fromRaw = typeof fromParam === "string" && fromParam ? new Date(fromParam) : undefined;
    const toRaw = typeof toParam === "string" && toParam ? new Date(toParam) : undefined;
    if (fromRaw && !isNaN(fromRaw.getTime()) && toRaw && !isNaN(toRaw.getTime())) {
      from = fromRaw;
      to = toRaw;
    } else {
      const periodOffsetParam = req.query.periodOffset;
      const periodOffset = typeof periodOffsetParam === "string" ? parseInt(periodOffsetParam, 10) : 0;
      const org = await db.query.organisationsTable.findFirst({
        where: eq(organisationsTable.id, membership.orgId),
        columns: { summaryYearStart: true },
      });
      const bounds = getPeriodBounds(org?.summaryYearStart ?? "01-01", isNaN(periodOffset) ? 0 : periodOffset);
      from = bounds.start;
      to = bounds.end;
    }

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

    const start = startOfYearUTC(yearParam);
    const end = endOfYearUTC(yearParam);

    const yearRecords = await db
      .select()
      .from(impactRecordsTable)
      .where(
        and(
          eq(impactRecordsTable.userId, userId),
          gte(impactRecordsTable.entryDate, start),
          lt(impactRecordsTable.entryDate, end),
        ),
      )
      .orderBy(desc(impactRecordsTable.entryDate));

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

  // Untoggle behaviour: when ?removeFutureEntries=true is set, also delete
  // every habit-generated impact entry for this template dated to the
  // current month or later. Past months are preserved so the user's
  // historical totals don't shift retroactively.
  let removedFutureEntries = 0;
  const removeFuture = req.query.removeFutureEntries === "true" || req.query.removeFutureEntries === "1";
  if (removeFuture) {
    const now = new Date();
    const cutoff = startOfMonthUTC(now.getUTCFullYear(), now.getUTCMonth());
    const removed = await db
      .delete(impactRecordsTable)
      .where(
        and(
          eq(impactRecordsTable.userId, userId),
          eq(impactRecordsTable.habitTemplateId, id),
          gte(impactRecordsTable.entryDate, cutoff),
        ),
      )
      .returning({ id: impactRecordsTable.id });
    removedFutureEntries = removed.length;
  }

  await db
    .delete(recurringTemplatesTable)
    .where(and(eq(recurringTemplatesTable.id, id), eq(recurringTemplatesTable.userId, userId)));

  res.json({ success: true, removedFutureEntries });
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

  // Bulk-create one impact entry per remaining month of the current calendar
  // year (from this month through December), each dated to the 1st of the
  // month. The recurring template row stays intact as the "this habit is on"
  // flag for the year-rollover prompt. Months that already have a habit-
  // generated entry for this template are skipped so the user can re-tick a
  // habit without piling up duplicates.
  const now = new Date();
  const year = now.getUTCFullYear();
  const startMonth = now.getUTCMonth();

  const existingHabitEntries = await db
    .select({ entryDate: impactRecordsTable.entryDate })
    .from(impactRecordsTable)
    .where(
      and(
        eq(impactRecordsTable.userId, userId),
        eq(impactRecordsTable.habitTemplateId, id),
        gte(impactRecordsTable.entryDate, startOfYearUTC(year)),
        lt(impactRecordsTable.entryDate, endOfYearUTC(year)),
      ),
    );
  const existingMonths = new Set(existingHabitEntries.map((r) => r.entryDate.getUTCMonth()));

  const activitiesJson = existing.defaultActivities as unknown;
  const activities = Array.isArray(activitiesJson) ? (activitiesJson as Parameters<typeof calculateImpact>[0]) : [];
  const donations = Number(existing.defaultDonationsGBP ?? 0);
  const result = calculateImpact(activities, donations, 0, []);

  const inserts: Array<typeof impactRecordsTable.$inferInsert> = [];
  for (let m = startMonth; m <= 11; m++) {
    if (existingMonths.has(m)) continue;
    inserts.push({
      userId,
      name: existing.label,
      periodLabel: calendarMonthLabel(startOfMonthUTC(year, m)),
      totalValue: String(result.totalValue),
      impactValue: String(result.impactValue),
      contributionValue: String(result.contributionValue),
      donationsValue: String(result.donationsValue),
      personalDevelopmentValue: String(result.personalDevelopmentValue),
      totalHours: result.totalHours,
      activitiesJson: activities,
      resultJson: result,
      entryDate: startOfMonthUTC(year, m),
      source: "habit",
      habitTemplateId: id,
    });
  }
  if (inserts.length > 0) {
    const created = await db
      .insert(impactRecordsTable)
      .values(inserts)
      .returning({ id: impactRecordsTable.id });
    await autoVerifyRecordsForUser(userId, created.map((r) => r.id));
  }

  const [updated] = await db
    .update(recurringTemplatesTable)
    .set({ lastConfirmedAt: new Date() })
    .where(and(eq(recurringTemplatesTable.id, id), eq(recurringTemplatesTable.userId, userId)))
    .returning();

  const serialized = serializeTemplate(updated as TemplateRow, new Date()) as Record<string, unknown>;
  serialized.entriesCreated = inserts.length;
  res.json(serialized);
});

// List the calendar years the user has logged anything in. Powers the year
// picker on the dashboard, history, and stats panels — whichever years come
// back are the ones the user can switch between.
router.get("/years", authenticate, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const rows = await db
    .select({
      year: sql<number>`EXTRACT(YEAR FROM ${impactRecordsTable.entryDate})::int`,
      entryCount: sql<number>`count(*)::int`,
    })
    .from(impactRecordsTable)
    .where(eq(impactRecordsTable.userId, userId))
    .groupBy(sql`EXTRACT(YEAR FROM ${impactRecordsTable.entryDate})`)
    .orderBy(desc(sql`EXTRACT(YEAR FROM ${impactRecordsTable.entryDate})`));

  res.json({
    years: rows.map((r) => ({ year: Number(r.year), entryCount: Number(r.entryCount) })),
    currentYear: new Date().getUTCFullYear(),
  });
});

// Year-over-year comparison for the dashboard. Compares the selected year's
// running total to the same period of the prior year so users can see whether
// they're tracking ahead or behind. When the selected year is the current
// calendar year, the cutoff is "today" so the comparison is fair (we compare
// Jan 1–today vs Jan 1–same day last year). For past years, the cutoff is
// 31 Dec so we compare the full year against the prior full year.
router.get("/yoy", authenticate, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const yearRaw = typeof req.query.year === "string" ? parseInt(req.query.year, 10) : currentYear;
  const selectedYear = Number.isFinite(yearRaw) && yearRaw >= 2000 && yearRaw <= 2100 ? yearRaw : currentYear;
  const priorYear = selectedYear - 1;

  // Cutoff (exclusive upper bound). For the current year we use "now" so that
  // the prior-year period stops on the equivalent calendar day; for past
  // years we compare the entire year against the entire prior year.
  const isCurrentYear = selectedYear === currentYear;
  const selectedCutoff = isCurrentYear ? now : endOfYearUTC(selectedYear);

  // Equivalent point in the prior year. JS's Date.UTC happily rolls invalid
  // days forward (29 Feb in a non-leap year becomes 1 Mar), which would
  // include an extra day in the prior-period comparison. Clamp the day to
  // the prior year's last-day-of-month before constructing the cutoff.
  const priorCutoff = (() => {
    if (!isCurrentYear) return endOfYearUTC(priorYear);
    const month = selectedCutoff.getUTCMonth();
    const lastDayOfPriorMonth = new Date(Date.UTC(priorYear, month + 1, 0)).getUTCDate();
    const day = Math.min(selectedCutoff.getUTCDate(), lastDayOfPriorMonth);
    return new Date(Date.UTC(
      priorYear,
      month,
      day,
      selectedCutoff.getUTCHours(),
      selectedCutoff.getUTCMinutes(),
      selectedCutoff.getUTCSeconds(),
    ));
  })();

  async function sumBetween(start: Date, end: Date): Promise<{ total: number; count: number }> {
    const [row] = await db
      .select({
        total: sql<string>`COALESCE(SUM(${impactRecordsTable.totalValue}), 0)`,
        count: sql<number>`count(*)::int`,
      })
      .from(impactRecordsTable)
      .where(
        and(
          eq(impactRecordsTable.userId, userId),
          gte(impactRecordsTable.entryDate, start),
          lt(impactRecordsTable.entryDate, end),
        ),
      );
    return { total: Number(row?.total ?? 0), count: Number(row?.count ?? 0) };
  }

  const [selected, priorPeriod, priorFull] = await Promise.all([
    sumBetween(startOfYearUTC(selectedYear), selectedCutoff),
    sumBetween(startOfYearUTC(priorYear), priorCutoff),
    sumBetween(startOfYearUTC(priorYear), endOfYearUTC(priorYear)),
  ]);

  res.json({
    selectedYear,
    priorYear,
    isCurrentYear,
    cutoffDate: selectedCutoff.toISOString(),
    priorCutoffDate: priorCutoff.toISOString(),
    selectedTotal: Math.round(selected.total * 100) / 100,
    selectedCount: selected.count,
    priorPeriodTotal: Math.round(priorPeriod.total * 100) / 100,
    priorPeriodCount: priorPeriod.count,
    priorYearTotal: Math.round(priorFull.total * 100) / 100,
    priorYearCount: priorFull.count,
    hasPriorData: priorFull.count > 0,
  });
});

// Year-rollover prompt — on the user's first visit on/after 1 January, the
// UI shows this state. The prompt is "due" when the user has any prior-year
// entries but no entries dated in the current calendar year yet. The habit
// list comes straight from `recurring_templates` so the user can confirm,
// edit, or untoggle each one before the new year's monthly entries are
// bulk-created.
router.get("/year-rollover", authenticate, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const priorYear = currentYear - 1;

  const [{ currentYearCount }] = await db
    .select({ currentYearCount: sql<number>`count(*)::int` })
    .from(impactRecordsTable)
    .where(
      and(
        eq(impactRecordsTable.userId, userId),
        gte(impactRecordsTable.entryDate, startOfYearUTC(currentYear)),
        lt(impactRecordsTable.entryDate, endOfYearUTC(currentYear)),
      ),
    );

  const priorYearRecords = await db
    .select()
    .from(impactRecordsTable)
    .where(
      and(
        eq(impactRecordsTable.userId, userId),
        gte(impactRecordsTable.entryDate, startOfYearUTC(priorYear)),
        lt(impactRecordsTable.entryDate, endOfYearUTC(priorYear)),
      ),
    );

  let priorTotal = 0;
  let priorHours = 0;
  for (const r of priorYearRecords) {
    const raw = r.resultJson as Record<string, unknown> | null;
    if (raw && typeof raw.totalValue === "number") priorTotal += raw.totalValue;
    if (raw && typeof raw.totalHours === "number") priorHours += raw.totalHours;
  }

  const habits = await db
    .select()
    .from(recurringTemplatesTable)
    .where(eq(recurringTemplatesTable.userId, userId));

  const shouldShow = Number(currentYearCount) === 0 && priorYearRecords.length > 0;

  res.json({
    shouldShow,
    priorYear: priorYearRecords.length > 0 ? priorYear : null,
    priorYearTotalValue: priorYearRecords.length > 0 ? Math.round(priorTotal * 100) / 100 : null,
    priorYearTotalHours: priorYearRecords.length > 0 ? priorHours : null,
    currentYear,
    habits: habits.map((h) => ({
      templateId: h.id,
      label: h.label,
      defaultDonationsGBP: Number(h.defaultDonationsGBP ?? 0),
      defaultActivities: h.defaultActivities,
    })),
  });
});

router.post("/year-rollover", authenticate, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const body = req.body as { confirmedTemplateIds?: unknown };
  const ids = Array.isArray(body.confirmedTemplateIds)
    ? body.confirmedTemplateIds.filter((n): n is number => typeof n === "number" && Number.isFinite(n))
    : [];

  const now = new Date();
  const year = now.getUTCFullYear();

  if (ids.length === 0) {
    res.json({ entriesCreated: 0, year });
    return;
  }

  const habits = await db
    .select()
    .from(recurringTemplatesTable)
    .where(and(inArray(recurringTemplatesTable.id, ids), eq(recurringTemplatesTable.userId, userId)));

  // Skip any template/month combos already populated, so re-confirming the
  // prompt doesn't double-write entries.
  const existingHabitEntries = await db
    .select({
      habitTemplateId: impactRecordsTable.habitTemplateId,
      entryDate: impactRecordsTable.entryDate,
    })
    .from(impactRecordsTable)
    .where(
      and(
        eq(impactRecordsTable.userId, userId),
        gte(impactRecordsTable.entryDate, startOfYearUTC(year)),
        lt(impactRecordsTable.entryDate, endOfYearUTC(year)),
        inArray(impactRecordsTable.habitTemplateId, ids),
      ),
    );
  const existingKey = new Set(
    existingHabitEntries
      .filter((r) => r.habitTemplateId != null)
      .map((r) => `${r.habitTemplateId}:${r.entryDate.getUTCMonth()}`),
  );

  const inserts: Array<typeof impactRecordsTable.$inferInsert> = [];
  for (const h of habits) {
    const activitiesJson = h.defaultActivities as unknown;
    const activities = Array.isArray(activitiesJson)
      ? (activitiesJson as Parameters<typeof calculateImpact>[0])
      : [];
    const donations = Number(h.defaultDonationsGBP ?? 0);
    const result = calculateImpact(activities, donations, 0, []);
    for (let m = 0; m <= 11; m++) {
      if (existingKey.has(`${h.id}:${m}`)) continue;
      inserts.push({
        userId,
        name: h.label,
        periodLabel: calendarMonthLabel(startOfMonthUTC(year, m)),
        totalValue: String(result.totalValue),
        impactValue: String(result.impactValue),
        contributionValue: String(result.contributionValue),
        donationsValue: String(result.donationsValue),
        personalDevelopmentValue: String(result.personalDevelopmentValue),
        totalHours: result.totalHours,
        activitiesJson: activities,
        resultJson: result,
        entryDate: startOfMonthUTC(year, m),
        source: "habit",
        habitTemplateId: h.id,
      });
    }
  }

  if (inserts.length > 0) {
    const created = await db
      .insert(impactRecordsTable)
      .values(inserts)
      .returning({ id: impactRecordsTable.id });
    await autoVerifyRecordsForUser(userId, created.map((r) => r.id));
  }

  res.json({ entriesCreated: inserts.length, year });
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
