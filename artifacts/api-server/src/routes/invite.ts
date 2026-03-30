import { Router, type IRouter } from "express";
import { db, userProfilesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { authenticate, type AuthenticatedRequest } from "../middleware/authenticate.js";
import crypto from "crypto";

const router: IRouter = Router();

function generateInviteCode(): string {
  return crypto.randomBytes(6).toString("base64url").slice(0, 8);
}

async function ensureInviteCode(userId: string): Promise<string> {
  const profile = await db.query.userProfilesTable.findFirst({
    where: eq(userProfilesTable.userId, userId),
  });

  if (profile?.inviteCode) {
    return profile.inviteCode;
  }

  const maxAttempts = 5;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const inviteCode = generateInviteCode();
    try {
      const [row] = await db
        .insert(userProfilesTable)
        .values({ userId, inviteCode, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: userProfilesTable.userId,
          set: { inviteCode },
        })
        .returning({ inviteCode: userProfilesTable.inviteCode });
      if (row?.inviteCode) return row.inviteCode;
    } catch (err: unknown) {
      const isUniqueViolation =
        err instanceof Error && err.message.includes("unique") && attempt < maxAttempts - 1;
      if (!isUniqueViolation) throw err;
    }
  }

  throw new Error("Failed to generate a unique invite code after multiple attempts");
}

router.get("/", authenticate, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;

  const inviteCode = await ensureInviteCode(userId);

  const profile = await db.query.userProfilesTable.findFirst({
    where: eq(userProfilesTable.userId, userId),
  });

  const origin = process.env.APP_ORIGIN ?? "https://myimpact.social";
  const inviteUrl = `${origin}?ref=${inviteCode}`;

  res.json({
    inviteCode,
    inviteUrl,
    sharedAt: profile?.inviteSharedAt?.toISOString() ?? null,
  });
});

router.post("/use", authenticate, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;

  const profile = await db.query.userProfilesTable.findFirst({
    where: eq(userProfilesTable.userId, userId),
  });

  if (profile?.inviteSharedAt) {
    res.json({ alreadyRecorded: true, sharedAt: profile.inviteSharedAt.toISOString() });
    return;
  }

  const now = new Date();
  await db
    .insert(userProfilesTable)
    .values({ userId, inviteSharedAt: now, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: userProfilesTable.userId,
      set: { inviteSharedAt: now },
    });

  res.json({ alreadyRecorded: false, sharedAt: now.toISOString() });
});

export default router;
