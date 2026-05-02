import { Router, type IRouter } from "express";
import { db, analyticsEventsTable, pageViewsTable, usersTable } from "@workspace/db";
import { eq, and, gte, sql, inArray, desc } from "drizzle-orm";
import { authenticate, type AuthenticatedRequest } from "../middleware/authenticate.js";
import {
  isValidEventName,
  trackServerEvent,
  ANALYTICS_EVENTS,
  type AnalyticsSurface,
} from "../lib/analytics.js";

const router: IRouter = Router();

const ADMIN_EMAILS = [
  "hello@myimpact.uk",
  "maddie@socialvalueengine.com",
  "ivan.annibal@roseregeneration.co.uk",
];

function isAdmin(email: string): boolean {
  return ADMIN_EMAILS.includes(email.toLowerCase());
}

/**
 * Sanitise an event props object to a small, predictable shape so we can't
 * be tricked into storing PII or oversized payloads from the browser.
 */
function sanitiseProps(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object") return {};
  const out: Record<string, unknown> = {};
  let count = 0;
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (count >= 12) break;
    if (typeof k !== "string" || k.length > 40) continue;
    if (v == null) continue;
    if (typeof v === "string") {
      if (v.length > 120) continue;
      // Block anything that looks like an email or full URL with a token.
      if (/@/.test(v) || /token=/.test(v)) continue;
      out[k] = v;
    } else if (typeof v === "number" && Number.isFinite(v)) {
      out[k] = v;
    } else if (typeof v === "boolean") {
      out[k] = v;
    } else {
      continue;
    }
    count++;
  }
  return out;
}

// ── POST /api/analytics/track ─────────────────────────────────────────────────
// Open to logged-out callers (some events fire before auth). When a session
// cookie is present we attach the user id; otherwise userId stays null.
router.post("/track", async (req, res) => {
  const { event, props, surface } = req.body ?? {};
  if (!isValidEventName(event)) {
    res.status(400).json({ error: "invalid event" });
    return;
  }

  const sanitised = sanitiseProps(props);
  const surfaceVal: AnalyticsSurface = surface === "org" ? "org" : "member";

  // Attach userId if we have a valid session cookie; otherwise leave null
  // so guest events still flow through (page views, etc.).
  let userId: string | null = null;
  try {
    const { decodeSessionCookie } = await import("../middleware/authenticate.js");
    userId = decodeSessionCookie(req) ?? null;
  } catch {
    userId = null;
  }

  await trackServerEvent({
    eventName: event,
    userId,
    surface: surfaceVal,
    props: sanitised,
  });

  // Backward compat: keep the existing per-page admin view (which reads
  // pageViewsTable) working by mirroring page_view events into the
  // existing table. Member surface only.
  if (event === "page_view" && userId && surfaceVal === "member") {
    const page = typeof sanitised.page === "string" ? sanitised.page : null;
    if (page) {
      try {
        await db.insert(pageViewsTable).values({ userId, page: page.slice(0, 100) });
      } catch {
        // Non-fatal.
      }
    }
  }

  res.json({ ok: true });
});

// ── Admin funnel/dashboard endpoint ───────────────────────────────────────────

interface FunnelStep {
  key: string;
  label: string;
  users: number;
  conversionFromPrev: number | null;
  conversionFromStart: number | null;
}

interface FunnelView {
  id: string;
  title: string;
  description: string;
  windowDays: number;
  steps: FunnelStep[];
}

interface RetentionCohort {
  windowDays: number;
  signups: number;
  d1: number;
  d7: number;
  d30: number;
  d1Pct: number | null;
  d7Pct: number | null;
  d30Pct: number | null;
}

async function distinctUserIdsForEvent(
  eventName: string,
  surface: AnalyticsSurface,
  windowStart: Date,
  matchPropKey?: string,
  matchPropValue?: string,
): Promise<Set<string>> {
  const whereParts = [
    eq(analyticsEventsTable.eventName, eventName),
    eq(analyticsEventsTable.surface, surface),
    gte(analyticsEventsTable.createdAt, windowStart),
  ];
  const rows = await db
    .select({
      userId: analyticsEventsTable.userId,
      props: analyticsEventsTable.props,
    })
    .from(analyticsEventsTable)
    .where(and(...whereParts));

  const out = new Set<string>();
  for (const r of rows) {
    if (!r.userId) continue;
    if (matchPropKey) {
      const propVal = (r.props as Record<string, unknown> | null)?.[matchPropKey];
      if (propVal !== matchPropValue) continue;
    }
    out.add(r.userId);
  }
  return out;
}

function buildFunnel(
  id: string,
  title: string,
  description: string,
  windowDays: number,
  steps: { key: string; label: string; users: Set<string> }[],
): FunnelView {
  const startCount = steps[0]?.users.size ?? 0;
  const out: FunnelStep[] = steps.map((step, i) => {
    const prev = i === 0 ? null : steps[i - 1].users.size;
    const fromPrev = prev && prev > 0 ? step.users.size / prev : i === 0 ? 1 : 0;
    const fromStart = startCount > 0 ? step.users.size / startCount : i === 0 ? 1 : 0;
    return {
      key: step.key,
      label: step.label,
      users: step.users.size,
      conversionFromPrev: i === 0 ? null : Math.round(fromPrev * 1000) / 10,
      conversionFromStart: i === 0 ? null : Math.round(fromStart * 1000) / 10,
    };
  });
  return { id, title, description, windowDays, steps: out };
}

router.get("/admin/funnels", authenticate, async (req: AuthenticatedRequest, res) => {
  if (!isAdmin(req.user!.email)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const windowDays = Math.min(Math.max(Number(req.query.days ?? 30), 1), 365);
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  // Step user-sets for member surface
  const signups = await distinctUserIdsForEvent("signup_complete", "member", since);
  const wizardActions = await distinctUserIdsForEvent(
    "wizard_step_complete",
    "member",
    since,
    "step",
    "actions",
  );
  const wizardActivities = await distinctUserIdsForEvent(
    "wizard_step_complete",
    "member",
    since,
    "step",
    "activities",
  );
  const wizardContributions = await distinctUserIdsForEvent(
    "wizard_step_complete",
    "member",
    since,
    "step",
    "contributions",
  );
  const firstRecord = await distinctUserIdsForEvent("first_record_logged", "member", since);
  const milestoneEarned = await distinctUserIdsForEvent("milestone_earned", "member", since);

  // Funnel 1 — Signup → first log
  const signupToFirstLog = buildFunnel(
    "signup-to-first-log",
    "Signup → first record logged",
    "Members who finished signup, then completed all three wizard steps and saved an impact record.",
    windowDays,
    [
      { key: "signup_complete", label: "Signed up", users: signups },
      {
        key: "wizard_actions",
        label: "Started the wizard",
        users: new Set([...signups].filter((u) => wizardActions.has(u))),
      },
      {
        key: "wizard_contributions",
        label: "Reached contributions step",
        users: new Set([...signups].filter((u) => wizardContributions.has(u))),
      },
      {
        key: "first_record_logged",
        label: "Saved first record",
        users: new Set([...signups].filter((u) => firstRecord.has(u))),
      },
      {
        key: "milestone_earned",
        label: "Earned a milestone",
        users: new Set([...signups].filter((u) => milestoneEarned.has(u))),
      },
    ],
  );

  // Funnel 2 — Wizard completion (any user, regardless of when they signed up)
  const wizardFunnel = buildFunnel(
    "wizard-completion",
    "Wizard completion",
    "Of everyone who started the wizard in the window, how many made it through each step.",
    windowDays,
    [
      { key: "actions", label: "Step 1 — Actions", users: wizardActions },
      { key: "activities", label: "Step 2 — Activities", users: wizardActivities },
      { key: "contributions", label: "Step 3 — Contributions", users: wizardContributions },
      { key: "first_record", label: "Saved a record", users: firstRecord },
    ],
  );

  // Funnel 3 — D1 / D7 / D30 retention from the analytics_events log
  const cohortUsers = await db
    .select({ id: usersTable.id, createdAt: usersTable.createdAt })
    .from(usersTable)
    .where(gte(usersTable.createdAt, since));

  const cohortIds = cohortUsers.map((u) => u.id);
  const cohortById = new Map(cohortUsers.map((u) => [u.id, u.createdAt as Date]));

  let cohortEvents: { userId: string | null; createdAt: Date }[] = [];
  if (cohortIds.length > 0) {
    cohortEvents = (await db
      .select({
        userId: analyticsEventsTable.userId,
        createdAt: analyticsEventsTable.createdAt,
      })
      .from(analyticsEventsTable)
      .where(
        and(
          eq(analyticsEventsTable.surface, "member"),
          inArray(analyticsEventsTable.userId, cohortIds),
        ),
      )) as { userId: string | null; createdAt: Date }[];
  }

  const eventsByUser = new Map<string, Date[]>();
  for (const e of cohortEvents) {
    if (!e.userId) continue;
    const arr = eventsByUser.get(e.userId) ?? [];
    arr.push(e.createdAt);
    eventsByUser.set(e.userId, arr);
  }

  let d1 = 0;
  let d7 = 0;
  let d30 = 0;
  const now = Date.now();
  for (const [uid, joined] of cohortById) {
    const events = eventsByUser.get(uid) ?? [];
    const ageMs = now - joined.getTime();
    const has = (lo: number, hi: number) =>
      events.some((d) => {
        const diff = d.getTime() - joined.getTime();
        return diff >= lo && diff <= hi;
      });
    const day = 24 * 60 * 60 * 1000;
    // We only count a retention bucket if enough time has passed for the
    // cohort member to actually be eligible — otherwise the percentage is
    // misleadingly low for very recent signups.
    if (ageMs >= 1 * day && has(0.5 * day, 1.5 * day)) d1++;
    if (ageMs >= 7 * day && has(6 * day, 8 * day)) d7++;
    if (ageMs >= 30 * day && has(29 * day, 31 * day)) d30++;
  }

  const retention: RetentionCohort = {
    windowDays,
    signups: cohortUsers.length,
    d1,
    d7,
    d30,
    d1Pct: cohortUsers.length > 0 ? Math.round((d1 / cohortUsers.length) * 1000) / 10 : null,
    d7Pct: cohortUsers.length > 0 ? Math.round((d7 / cohortUsers.length) * 1000) / 10 : null,
    d30Pct: cohortUsers.length > 0 ? Math.round((d30 / cohortUsers.length) * 1000) / 10 : null,
  };

  // Counts of every event in the window (split by surface), so admins can see
  // raw volume even before a funnel is meaningful.
  const eventCountRows = await db
    .select({
      eventName: analyticsEventsTable.eventName,
      surface: analyticsEventsTable.surface,
      total: sql<number>`count(*)::int`,
    })
    .from(analyticsEventsTable)
    .where(gte(analyticsEventsTable.createdAt, since))
    .groupBy(analyticsEventsTable.eventName, analyticsEventsTable.surface)
    .orderBy(desc(sql`count(*)`));

  res.json({
    windowDays,
    generatedAt: new Date().toISOString(),
    eventNames: ANALYTICS_EVENTS,
    funnels: [signupToFirstLog, wizardFunnel],
    retention,
    eventCounts: eventCountRows,
  });
});

export default router;
