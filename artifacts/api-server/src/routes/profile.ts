import { Router, type IRouter } from "express";
import { db, userProfilesTable, impactRecordsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  authenticate,
  invalidateUserExistsCache,
  type AuthenticatedRequest,
} from "../middleware/authenticate.js";
import { calculateStreak, isStreakMilestone } from "../lib/streak.js";
import { buildUserExport } from "../lib/userExport.js";
import { eraseUserData } from "../lib/userDeletion.js";
import { recordAuditEvent } from "../lib/auditLog.js";
import { getUncachableResendClient } from "../lib/resend.js";
import { verifyUnsubscribeToken } from "../lib/unsubscribeToken.js";
import { createRateLimiter } from "../lib/rateLimiter.js";

const router: IRouter = Router();

const MAX_CUSTOM_INTERESTS = 20;
const MAX_CUSTOM_INTEREST_LENGTH = 100;
const CUSTOM_INTEREST_CATEGORIES = new Set(["Environment", "Health", "Education", "Community"]);

export function normalizeCustomInterests(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const label = item.trim().replace(/\s+/g, " ");
    const key = label.toLocaleLowerCase("en-GB");
    if (!label || label.length > MAX_CUSTOM_INTEREST_LENGTH || seen.has(key)) continue;
    seen.add(key);
    normalized.push(label);
    if (normalized.length >= MAX_CUSTOM_INTERESTS) break;
  }
  return normalized;
}

export function normalizeCustomInterestCategories(
  value: unknown,
  customInterests: string[],
): Record<string, string | null> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>;
  const normalized: Record<string, string | null> = {};
  for (const interest of customInterests) {
    if (!Object.prototype.hasOwnProperty.call(input, interest)) continue;
    const category = input[interest];
    if (category === null || (typeof category === "string" && CUSTOM_INTEREST_CATEGORIES.has(category))) {
      normalized[interest] = category;
    }
  }
  return normalized;
}

// Public endpoint: keep the limit tight since it needs no auth.
const unsubscribeRateLimit = createRateLimiter({
  windowMs: 60 * 1000,
  max: 10,
  message: "Too many requests. Please try again in a minute.",
});

/**
 * One-click email unsubscribe. Public (no session) — the signed token in the
 * query string proves the request came from a link we emailed to the user.
 * Single-purpose: only ever flips email_opt_in to false. Accepts POST so
 * mail-scanner GET prefetches can't silently unsubscribe people; RFC 8058
 * one-click unsubscribe also uses POST.
 */
router.post("/unsubscribe", unsubscribeRateLimit, async (req, res) => {
  const token =
    typeof req.query.token === "string"
      ? req.query.token
      : typeof (req.body as { token?: unknown } | undefined)?.token === "string"
        ? ((req.body as { token: string }).token)
        : null;

  if (!token) {
    res.status(400).json({ error: "Missing token" });
    return;
  }

  const result = verifyUnsubscribeToken(token);
  if (!result.ok) {
    res.status(400).json({
      error:
        result.reason === "expired"
          ? "This unsubscribe link has expired. You can manage email preferences in Settings."
          : "This unsubscribe link is not valid.",
      reason: result.reason,
    });
    return;
  }

  // Verify the user still exists; deleted accounts just get a success page
  // (there is nothing to unsubscribe, and we don't want to leak existence).
  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, result.userId),
    columns: { id: true, email: true },
  });

  if (user) {
    await db
      .insert(userProfilesTable)
      .values({
        userId: user.id,
        emailOptIn: false,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: userProfilesTable.userId,
        set: {
          emailOptIn: false,
          updatedAt: new Date(),
        },
      });

    await recordAuditEvent({
      userId: user.id,
      userEmail: user.email,
      action: "email_unsubscribe",
      req,
    });
  }

  res.json({ ok: true });
});

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
      customInterests: profile.customInterests ?? [],
      customInterestCategories: profile.customInterestCategories ?? {},
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
  const existingProfile = await db.query.userProfilesTable.findFirst({
    where: eq(userProfilesTable.userId, userId),
  });

  const situation = Array.isArray(body.situation)
    ? body.situation.filter((s): s is string => typeof s === "string")
    : typeof body.situation === "string"
      ? [body.situation]
      : [];
  const interests = Array.isArray(body.interests)
    ? body.interests.filter((i): i is string => typeof i === "string")
    : [];
  const customInterests = Object.prototype.hasOwnProperty.call(body, "customInterests")
    ? normalizeCustomInterests(body.customInterests)
    : (existingProfile?.customInterests ?? []);
  const customInterestCategories = Object.prototype.hasOwnProperty.call(body, "customInterestCategories")
    ? normalizeCustomInterestCategories(body.customInterestCategories, customInterests)
    : normalizeCustomInterestCategories(existingProfile?.customInterestCategories, customInterests);
  const postcode = typeof body.postcode === "string" ? body.postcode.trim() : null;

  const [upserted] = await db
    .insert(userProfilesTable)
    .values({
      userId,
      situation,
      interests,
      customInterests,
      customInterestCategories,
      postcode,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: userProfilesTable.userId,
      set: {
        situation,
        interests,
        customInterests,
        customInterestCategories,
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
      customInterests: upserted.customInterests ?? [],
      customInterestCategories: upserted.customInterestCategories ?? {},
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

/**
 * GDPR data portability: stream the user's complete personal-data export
 * as a JSON download. The audit log records that an export occurred, but
 * never the data itself.
 */
router.get("/export", authenticate, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const userEmail = req.user!.email;
  try {
    // Write the audit row FIRST so the row appears inside the exported
    // payload itself — exporters expect to see their own export event in
    // the returned auditLog array.
    await recordAuditEvent({
      userId,
      userEmail,
      action: "data_export",
      req,
    });
    const data = await buildUserExport(userId);
    const filename = `my-impact-export-${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("[profile/export] failed", err);
    res.status(500).json({ error: "Failed to build export. Please try again." });
  }
});

/**
 * GDPR right-to-erasure: permanently delete the user's account and all
 * associated personal data. Requires the user to type their own email
 * address as a safety check, then writes an audit-log row (with the email
 * preserved so the row remains meaningful after the user is gone) and
 * sends a transactional email confirmation.
 */
router.post("/delete-account", authenticate, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const userEmail = req.user!.email;

  const body = (req.body ?? {}) as { confirmEmail?: unknown };
  const confirmEmail =
    typeof body.confirmEmail === "string" ? body.confirmEmail.trim().toLowerCase() : "";
  if (!confirmEmail || confirmEmail !== userEmail.toLowerCase()) {
    res.status(400).json({
      error:
        "Please confirm by typing your email address exactly as it appears on your account.",
    });
    return;
  }

  let attachmentsRemoved = 0;
  try {
    const result = await eraseUserData(userId);
    attachmentsRemoved = result.attachmentsRemoved;
    // Evict the auth-existence cache entry so any other live session (other
    // tabs/devices) for this user is rejected on its very next request,
    // without waiting for the TTL to lapse.
    invalidateUserExistsCache(userId);
  } catch (err) {
    console.error("[profile/delete-account] erase failed", err);
    res.status(500).json({ error: "Could not delete your account. Please contact support." });
    return;
  }

  // Best-effort: write the audit row AFTER the user row is gone. user_id is
  // stored as text so the value still resolves to a string we can search.
  await recordAuditEvent({
    userId,
    userEmail,
    action: "account_deletion",
    req,
    metadata: { attachmentsRemoved },
  });

  // Best-effort: send a transactional confirmation. Failure here must not
  // roll back the deletion (the user has already exercised their right).
  if (process.env.E2E_TEST_MODE !== "1") {
    try {
      const { client, fromEmail } = await getUncachableResendClient();
      await client.emails.send({
        from: fromEmail,
        to: userEmail,
        subject: "Your My Impact account has been deleted",
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;">
            <h2 style="margin:0 0 8px;color:#213547;font-size:22px;">Account deleted</h2>
            <p style="color:#555;margin:0 0 16px;line-height:1.6;">
              We've permanently deleted the My Impact account associated with this email address,
              along with your impact records, journal entries, attachments and preferences.
            </p>
            <p style="color:#555;margin:0 0 16px;line-height:1.6;">
              Some anonymised, aggregated data may remain in organisation totals where you
              previously contributed — these no longer reference you.
            </p>
            <p style="color:#aaa;margin:24px 0 0;font-size:12px;">
              If you didn't request this deletion, please contact us at hello@myimpact.uk straight away.
            </p>
          </div>
        `,
      });
    } catch (err) {
      console.error("[profile/delete-account] confirmation email failed", err);
    }
  }

  // Drop the session cookie so the next request from this browser is logged out.
  res.clearCookie("mi_session", { path: "/", secure: true, sameSite: "lax" });
  res.json({ ok: true });
});

export default router;
