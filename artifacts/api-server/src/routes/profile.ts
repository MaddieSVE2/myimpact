import { Router, type IRouter } from "express";
import { db, userProfilesTable, impactRecordsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { authenticate, type AuthenticatedRequest } from "../middleware/authenticate.js";
import { calculateStreak, isStreakMilestone } from "../lib/streak.js";

const router: IRouter = Router();

async function buildStreak(userId: string, lastAcked: number) {
  const records = await db
    .select({ createdAt: impactRecordsTable.createdAt })
    .from(impactRecordsTable)
    .where(eq(impactRecordsTable.userId, userId));
  const info = calculateStreak(records.map((r) => r.createdAt));
  return { ...info, lastAckedMilestone: lastAcked };
}

router.get("/", authenticate, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const profile = await db.query.userProfilesTable.findFirst({
    where: eq(userProfilesTable.userId, userId),
  });

  const streak = await buildStreak(userId, profile?.lastAckedStreakMilestone ?? 0);

  if (!profile) {
    res.json({ profile: null, streak });
    return;
  }

  res.json({
    profile: {
      situation: profile.situation ?? [],
      interests: profile.interests ?? [],
      postcode: profile.postcode ?? null,
      emailOptIn: profile.emailOptIn,
      updatedAt: profile.updatedAt.toISOString(),
    },
    streak,
  });
});

router.put("/", authenticate, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const body = req.body as Record<string, unknown>;

  const situation = Array.isArray(body.situation)
    ? body.situation.filter((s): s is string => typeof s === "string")
    : typeof body.situation === "string"
      ? [body.situation]
      : [];
  const interests = Array.isArray(body.interests)
    ? body.interests.filter((i): i is string => typeof i === "string")
    : [];
  const postcode = typeof body.postcode === "string" ? body.postcode.trim() : null;

  const [upserted] = await db
    .insert(userProfilesTable)
    .values({
      userId,
      situation,
      interests,
      postcode,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: userProfilesTable.userId,
      set: {
        situation,
        interests,
        postcode,
        updatedAt: new Date(),
      },
    })
    .returning();

  const streak = await buildStreak(userId, upserted.lastAckedStreakMilestone ?? 0);

  res.json({
    profile: {
      situation: upserted.situation ?? [],
      interests: upserted.interests ?? [],
      postcode: upserted.postcode ?? null,
      emailOptIn: upserted.emailOptIn,
      updatedAt: upserted.updatedAt.toISOString(),
    },
    streak,
  });
});

// Dedicated endpoint for the email opt-in toggle so the Settings UI can flip
// it without having to round-trip the whole profile (situation/interests/etc).
router.patch("/email-opt-in", authenticate, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const { emailOptIn } = req.body as { emailOptIn?: unknown };

  if (typeof emailOptIn !== "boolean") {
    res.status(400).json({ error: "emailOptIn must be a boolean" });
    return;
  }

  const [upserted] = await db
    .insert(userProfilesTable)
    .values({
      userId,
      emailOptIn,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: userProfilesTable.userId,
      set: {
        emailOptIn,
        updatedAt: new Date(),
      },
    })
    .returning();

  res.json({ emailOptIn: upserted.emailOptIn });
});

router.post("/ack-streak-milestone", authenticate, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const milestone = Number((req.body as { milestone?: unknown })?.milestone);
  if (!Number.isFinite(milestone) || milestone <= 0 || !isStreakMilestone(milestone)) {
    res.status(400).json({ error: "Invalid milestone" });
    return;
  }

  const existing = await db.query.userProfilesTable.findFirst({
    where: eq(userProfilesTable.userId, userId),
  });
  const currentAck = existing?.lastAckedStreakMilestone ?? 0;
  const nextAck = Math.max(currentAck, milestone);

  if (existing) {
    await db
      .update(userProfilesTable)
      .set({ lastAckedStreakMilestone: nextAck })
      .where(eq(userProfilesTable.userId, userId));
  } else {
    await db.insert(userProfilesTable).values({
      userId,
      lastAckedStreakMilestone: nextAck,
      updatedAt: new Date(),
    });
  }

  const streak = await buildStreak(userId, nextAck);
  res.json(streak);
});

export default router;
