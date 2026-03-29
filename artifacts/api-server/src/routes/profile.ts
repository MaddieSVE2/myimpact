import { Router, type IRouter } from "express";
import { db, userProfilesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { authenticate, type AuthenticatedRequest } from "../middleware/authenticate.js";

const router: IRouter = Router();

router.get("/", authenticate, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const profile = await db.query.userProfilesTable.findFirst({
    where: eq(userProfilesTable.userId, userId),
  });

  if (!profile) {
    res.json({ profile: null });
    return;
  }

  res.json({
    profile: {
      situation: profile.situation ?? [],
      interests: profile.interests ?? [],
      postcode: profile.postcode ?? null,
      updatedAt: profile.updatedAt.toISOString(),
    },
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

  res.json({
    profile: {
      situation: upserted.situation ?? [],
      interests: upserted.interests ?? [],
      postcode: upserted.postcode ?? null,
      updatedAt: upserted.updatedAt.toISOString(),
    },
  });
});

export default router;
