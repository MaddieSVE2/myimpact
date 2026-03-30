import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db, publicProfilesTable, usersTable, impactRecordsTable, journalEntriesTable } from "@workspace/db";
import { eq, desc, sum as drizzleSum, sql } from "drizzle-orm";
import { randomBytes } from "crypto";
import { authenticate, type AuthenticatedRequest } from "../middleware/authenticate.js";

const router: IRouter = Router();

const RESERVED_SLUGS = new Set([
  "admin", "api", "app", "auth", "dashboard", "help", "login", "logout",
  "profile", "settings", "signup", "register", "support", "terms", "privacy",
  "about", "contact", "www", "mail", "blog", "news", "static", "assets",
  "public", "private", "user", "users", "account", "accounts", "team", "org",
  "organisation", "organization", "impact", "wizard", "history", "journal",
  "milestones", "badges", "feedback", "results", "suggestions",
]);

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;

function validateSlug(slug: string): string | null {
  if (!slug) return "Slug is required.";
  if (slug.length < 3) return "Slug must be at least 3 characters.";
  if (slug.length > 30) return "Slug must be at most 30 characters.";
  if (!SLUG_RE.test(slug)) return "Slug may only contain lowercase letters, numbers, and hyphens, and must not start or end with a hyphen.";
  if (RESERVED_SLUGS.has(slug)) return "That slug is reserved. Please choose a different one.";
  return null;
}

function generateDefaultSlug(displayName: string | null | undefined, email: string): string {
  const base = displayName
    ? displayName.trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9]/g, "")
    : email.split("@")[0].toLowerCase().replace(/[^a-z0-9]/g, "");
  const safeName = base.slice(0, 10) || "user";
  const suffix = randomBytes(3).toString("hex");
  return `${safeName}-${suffix}`;
}

// ── Rate limiting for public profile reads (no auth) ──────────────────────────
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;

function publicRateLimit(req: Request, res: Response, next: NextFunction) {
  // Use req.ip which respects the "trust proxy" setting in app.ts, preventing header spoofing
  const key = req.ip ?? req.socket.remoteAddress ?? "unknown";
  const now = Date.now();
  let entry = rateLimitMap.get(key);
  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    rateLimitMap.set(key, entry);
  }
  entry.count += 1;
  if (entry.count > RATE_LIMIT_MAX) {
    res.status(429).json({ error: "Too many requests. Please slow down." });
    return;
  }
  next();
}

// Periodically clean up old entries to prevent memory growth
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateLimitMap.entries()) {
    if (v.resetAt < now) rateLimitMap.delete(k);
  }
}, 5 * 60_000);

// ── GET /api/public-profile/me — fetch own public profile settings ────────────
router.get("/me", authenticate, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const existing = await db.query.publicProfilesTable.findFirst({
    where: eq(publicProfilesTable.userId, userId),
  });
  res.json({ profile: existing ?? null });
});

// ── POST /api/public-profile/enable — enable public profile (generates slug) ─
router.post("/enable", authenticate, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;

  const existing = await db.query.publicProfilesTable.findFirst({
    where: eq(publicProfilesTable.userId, userId),
  });

  if (existing) {
    const [updated] = await db
      .update(publicProfilesTable)
      .set({ isEnabled: true, updatedAt: new Date() })
      .where(eq(publicProfilesTable.userId, userId))
      .returning();
    res.json({ profile: updated });
    return;
  }

  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, userId) });

  let slug = generateDefaultSlug(user?.displayName, user?.email ?? userId);

  // Ensure uniqueness
  let attempts = 0;
  while (attempts < 10) {
    const collision = await db.query.publicProfilesTable.findFirst({
      where: eq(publicProfilesTable.slug, slug),
    });
    if (!collision) break;
    slug = generateDefaultSlug(user?.displayName, user?.email ?? userId);
    attempts++;
  }

  const [created] = await db
    .insert(publicProfilesTable)
    .values({ userId, slug, isEnabled: true })
    .returning();

  res.json({ profile: created });
});

// ── PUT /api/public-profile — update settings ─────────────────────────────────
router.put("/", authenticate, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const body = req.body as Record<string, unknown>;

  const existing = await db.query.publicProfilesTable.findFirst({
    where: eq(publicProfilesTable.userId, userId),
  });

  if (!existing) {
    res.status(404).json({ error: "Public profile not found. Enable it first." });
    return;
  }

  const updates: Partial<typeof publicProfilesTable.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (typeof body.isEnabled === "boolean") updates.isEnabled = body.isEnabled;
  if (typeof body.customMessage === "string") updates.customMessage = body.customMessage.slice(0, 500) || null;
  if (body.customMessage === null) updates.customMessage = null;
  if (typeof body.showHours === "boolean") updates.showHours = body.showHours;
  if (typeof body.showSroi === "boolean") updates.showSroi = body.showSroi;
  if (typeof body.showCategories === "boolean") updates.showCategories = body.showCategories;
  if (typeof body.showJournalHighlights === "boolean") updates.showJournalHighlights = body.showJournalHighlights;

  // Slug update: only allowed once, if not already customised
  if (typeof body.slug === "string") {
    if (existing.slugCustomised) {
      res.status(400).json({ error: "You can only customise your slug once." });
      return;
    }
    const slug = body.slug.trim().toLowerCase();
    const slugError = validateSlug(slug);
    if (slugError) {
      res.status(400).json({ error: slugError });
      return;
    }
    const collision = await db.query.publicProfilesTable.findFirst({
      where: eq(publicProfilesTable.slug, slug),
    });
    if (collision && collision.userId !== userId) {
      res.status(409).json({ error: "That slug is already taken. Please choose a different one." });
      return;
    }
    updates.slug = slug;
    updates.slugCustomised = true;
  }

  const [updated] = await db
    .update(publicProfilesTable)
    .set(updates)
    .where(eq(publicProfilesTable.userId, userId))
    .returning();

  res.json({ profile: updated });
});

// ── GET /api/public-profile/check-slug/:slug — slug availability check ────────
router.get("/check-slug/:slug", authenticate, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const slug = (req.params.slug ?? "").trim().toLowerCase();
  const error = validateSlug(slug);
  if (error) {
    res.json({ available: false, error });
    return;
  }
  const collision = await db.query.publicProfilesTable.findFirst({
    where: eq(publicProfilesTable.slug, slug),
  });
  const available = !collision || collision.userId === userId;
  res.json({ available, error: available ? null : "That slug is already taken." });
});

// ── GET /api/public-profile/:slug — public page data (no auth, rate limited) ──
router.get("/:slug", publicRateLimit, async (req: Request, res: Response) => {
  const slug = (req.params.slug ?? "").trim().toLowerCase();

  const profile = await db.query.publicProfilesTable.findFirst({
    where: eq(publicProfilesTable.slug, slug),
  });

  if (!profile || !profile.isEnabled) {
    res.status(404).json({ error: "Profile not found." });
    return;
  }

  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, profile.userId),
  });

  if (!user) {
    res.status(404).json({ error: "Profile not found." });
    return;
  }

  // Compute totals via DB aggregates so all records are included (no arbitrary cap)
  let totalHours: number | null = null;
  let totalSroi: number | null = null;
  if (profile.showHours || profile.showSroi || profile.showCategories) {
    const [agg] = await db
      .select({
        sumHours: drizzleSum(impactRecordsTable.totalHours),
        sumSroi: drizzleSum(sql`${impactRecordsTable.totalValue}::numeric`),
      })
      .from(impactRecordsTable)
      .where(eq(impactRecordsTable.userId, profile.userId));

    if (profile.showHours) totalHours = parseInt(agg?.sumHours ?? "0", 10) || 0;
    if (profile.showSroi) totalSroi = parseFloat(agg?.sumSroi as string ?? "0") || 0;
  }

  // Aggregate category hours — load all records for the user (no limit)
  const categoryHours: Record<string, number> = {};
  if (profile.showCategories) {
    const records = await db
      .select({ activitiesJson: impactRecordsTable.activitiesJson })
      .from(impactRecordsTable)
      .where(eq(impactRecordsTable.userId, profile.userId));

    for (const record of records) {
      const activities = record.activitiesJson as Array<{ category?: string; hours?: number }>;
      if (Array.isArray(activities)) {
        for (const act of activities) {
          if (act.category && typeof act.hours === "number") {
            categoryHours[act.category] = (categoryHours[act.category] ?? 0) + act.hours;
          }
        }
      }
    }
  }

  // Journal highlights (most recent 3 journal entries with text)
  let journalHighlights: Array<{ text: string; createdAt: string }> = [];
  if (profile.showJournalHighlights) {
    const entries = await db
      .select({
        text: journalEntriesTable.text,
        createdAt: journalEntriesTable.createdAt,
      })
      .from(journalEntriesTable)
      .where(eq(journalEntriesTable.userId, profile.userId))
      .orderBy(desc(journalEntriesTable.createdAt))
      .limit(10);

    journalHighlights = entries
      .filter((e) => e.text && e.text.trim().length > 0)
      .slice(0, 3)
      .map((e) => ({ text: e.text!, createdAt: e.createdAt.toISOString() }));
  }

  res.json({
    profile: {
      slug: profile.slug,
      displayName: user.displayName,
      customMessage: profile.customMessage,
      showHours: profile.showHours,
      showSroi: profile.showSroi,
      showCategories: profile.showCategories,
      showJournalHighlights: profile.showJournalHighlights,
    },
    stats: {
      totalHours: profile.showHours ? totalHours : null,
      totalSroi: profile.showSroi ? totalSroi : null,
      categoryHours: profile.showCategories ? categoryHours : null,
    },
    journalHighlights: profile.showJournalHighlights ? journalHighlights : [],
  });
});

export default router;
