import { Router, type IRouter } from "express";
import {
  CalculateImpactBody,
  GetActivitiesResponse,
  GetSuggestionsBody,
  SaveImpactBody,
} from "@workspace/api-zod";
import { db, impactRecordsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { ACTIVITIES, CATEGORIES, calculateImpact } from "../lib/impactData.js";
import { authenticate, type AuthenticatedRequest } from "../middleware/authenticate.js";

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

  const [record] = await db
    .insert(impactRecordsTable)
    .values({
      userId,
      name: body.name,
      periodLabel: body.period ?? null,
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
    period: record.periodLabel ?? null,
    createdAt: record.createdAt.toISOString(),
    impactResult: body.impactResult,
  });
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
  }));

  res.json({ records: formatted });
});

router.get("/org-stats", async (_req, res) => {
  try {
    const records = await db.select().from(impactRecordsTable);

    const totalRecords = records.length;
    const totalUsers = new Set(records.map(r => r.userId)).size;

    let totalSocialValue = 0;
    let totalHours = 0;
    const categoryValueMap: Record<string, number> = {};

    for (const r of records) {
      const result = r.resultJson as any;
      totalSocialValue += result.totalValue ?? 0;
      totalHours += result.totalHours ?? 0;
      for (const breakdown of result.activityBreakdowns ?? []) {
        categoryValueMap[breakdown.category] = (categoryValueMap[breakdown.category] ?? 0) + (breakdown.impactValue ?? 0);
      }
    }

    const valueByCategory = Object.entries(categoryValueMap)
      .map(([category, value]) => ({ category, value: Math.round(value * 100) / 100 }))
      .sort((a, b) => b.value - a.value);

    res.json({
      totalRecords,
      totalUsers,
      totalSocialValue: Math.round(totalSocialValue * 100) / 100,
      totalHours: Math.round(totalHours * 100) / 100,
      averageValuePerPerson: totalUsers > 0 ? Math.round((totalSocialValue / totalUsers) * 100) / 100 : 0,
      valueByCategory,
      recentActivity: [],
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to compute org stats" });
  }
});

export default router;
