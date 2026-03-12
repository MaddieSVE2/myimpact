import { Router, type IRouter } from "express";
import {
  CalculateImpactBody,
  GetActivitiesResponse,
  GetSuggestionsBody,
  SaveImpactBody,
  GetImpactHistoryQueryParams,
} from "@workspace/api-zod";
import { db, impactRecordsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { ACTIVITIES, CATEGORIES, calculateImpact } from "../lib/impactData.js";

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
  const result = calculateImpact(body.activities, body.donationsGBP, body.additionalVolunteerHours);
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
  };

  const preferredCategories = new Set(
    (body.interests ?? []).map((i) => INTEREST_CATEGORY_MAP[i]).filter(Boolean)
  );

  const availableActivities = ACTIVITIES.filter((a) => !currentIds.has(a.id));
  const weeklyHours = body.availableHoursPerWeek;

  const reasonsByCategory: Record<string, string> = {
    Environment: "A great fit for your focus on the environment — this directly reduces harm to the planet.",
    Community: "Aligned with your interest in community — this helps people who need support most.",
    Education: "Perfect for your interest in education — it empowers others with knowledge and skills.",
    Health: "Suits your focus on health — this makes a real difference to wellbeing in your area.",
  };

  const fallbackReasons: Record<string, string> = {
    Environment: "This directly reduces environmental harm and supports a more sustainable future.",
    Community: "Builds stronger communities and helps people who need support most.",
    Education: "Empowers others with knowledge and skills that last a lifetime.",
    Health: "Directly improves physical or mental wellbeing for people in your community.",
  };

  const scored = availableActivities.map((a) => {
    const hoursNeeded = a.unit === "hour" ? weeklyHours : 1;
    const yearlyHours = hoursNeeded * 52;
    const estimatedImpact = a.unit === "hour" ? yearlyHours * a.valuePerUnit : a.valuePerUnit * hoursNeeded;
    const isPreferred = preferredCategories.size > 0 && preferredCategories.has(a.category);

    const reason = isPreferred
      ? (reasonsByCategory[a.category] ?? "A high-impact way to make a real difference.")
      : (fallbackReasons[a.category] ?? "A high-impact way to make a real difference.");

    return {
      activityId: a.id,
      activityName: a.name,
      category: a.category,
      sdg: a.sdg,
      sdgColor: a.sdgColor,
      reason,
      estimatedImpactPerYear: Math.round(estimatedImpact * 100) / 100,
      recommendedHoursPerWeek: Math.min(weeklyHours, a.unit === "hour" ? weeklyHours : 1),
      score: estimatedImpact * (isPreferred ? 1.5 : 1),
    };
  });

  scored.sort((a, b) => b.score - a.score);

  const suggestions = scored.slice(0, 6).map(({ score: _score, ...rest }) => rest);

  res.json({ suggestions });
});

router.post("/save", async (req, res) => {
  const body = SaveImpactBody.parse(req.body);

  const [record] = await db
    .insert(impactRecordsTable)
    .values({
      userId: body.userId,
      name: body.name,
      totalValue: String(body.impactResult.totalValue),
      impactValue: String(body.impactResult.impactValue),
      contributionValue: String(body.impactResult.contributionValue),
      donationsValue: String(body.impactResult.donationsValue),
      personalDevelopmentValue: String(body.impactResult.personalDevelopmentValue),
      totalHours: body.impactResult.totalHours,
      activitiesJson: body.activities,
      resultJson: body.impactResult,
    })
    .returning();

  res.json({
    id: String(record.id),
    userId: record.userId,
    name: record.name,
    createdAt: record.createdAt.toISOString(),
    impactResult: body.impactResult,
  });
});

router.get("/history", async (req, res) => {
  const query = GetImpactHistoryQueryParams.parse(req.query);

  const records = await db
    .select()
    .from(impactRecordsTable)
    .where(eq(impactRecordsTable.userId, query.userId))
    .orderBy(desc(impactRecordsTable.createdAt));

  const formatted = records.map((r) => ({
    id: String(r.id),
    userId: r.userId,
    name: r.name,
    createdAt: r.createdAt.toISOString(),
    impactResult: r.resultJson,
  }));

  res.json({ records: formatted });
});

export default router;
