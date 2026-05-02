import { Router, type IRouter, type Response } from "express";
import {
  db,
  organisationsTable,
  orgMembersTable,
  impactRecordsTable,
  usersTable,
} from "@workspace/db";
import { and, eq, inArray, gte, lte } from "drizzle-orm";
import { authenticateApiKey, requireScope, createApiKeyRateLimiter, type ApiKeyRequest } from "../middleware/apiKeyAuth.js";
import { enqueueOrgEvent } from "../lib/webhookDispatcher.js";

const router: IRouter = Router();

// Per-key rate limit: 120 req/min by default. Stricter than the global IP
// limiter and applied after key auth so quotas attribute to the key.
const v1RateLimit = createApiKeyRateLimiter({ max: 120, windowMs: 60_000 });

router.use(authenticateApiKey, v1RateLimit);

interface StoredResult {
  totalValue: number;
  totalHours: number;
  donationsValue: number;
  activityBreakdowns: Array<{ category: string; impactValue: number }>;
}

function parseStoredResult(raw: unknown): StoredResult {
  if (raw === null || typeof raw !== "object") return { totalValue: 0, totalHours: 0, donationsValue: 0, activityBreakdowns: [] };
  const r = raw as Record<string, unknown>;
  return {
    totalValue: typeof r.totalValue === "number" ? r.totalValue : 0,
    totalHours: typeof r.totalHours === "number" ? r.totalHours : 0,
    donationsValue: typeof r.donationsValue === "number" ? r.donationsValue : 0,
    activityBreakdowns: Array.isArray(r.activityBreakdowns)
      ? (r.activityBreakdowns as Array<{ category: string; impactValue: number }>).filter(
          b => typeof b.category === "string" && typeof b.impactValue === "number",
        )
      : [],
  };
}

function endOfDay(d: Date): Date { const e = new Date(d); e.setHours(23, 59, 59, 999); return e; }

function parseRange(req: ApiKeyRequest, res: Response): { from?: Date; to?: Date } | null {
  const fromParam = req.query.from;
  const toParam = req.query.to;
  const fromRaw = typeof fromParam === "string" && fromParam ? new Date(fromParam) : undefined;
  const toRaw = typeof toParam === "string" && toParam ? new Date(toParam) : undefined;
  if (fromRaw && isNaN(fromRaw.getTime())) {
    res.status(400).json({ error: "Invalid 'from' date — expected ISO-8601." });
    return null;
  }
  if (toRaw && isNaN(toRaw.getTime())) {
    res.status(400).json({ error: "Invalid 'to' date — expected ISO-8601." });
    return null;
  }
  return { from: fromRaw, to: toRaw ? endOfDay(toRaw) : undefined };
}

// ---------------------------------------------------------------------------
// GET /v1/org/me — current org metadata
// ---------------------------------------------------------------------------
router.get("/me", async (req: ApiKeyRequest, res) => {
  const org = await db.query.organisationsTable.findFirst({
    where: eq(organisationsTable.id, req.apiKey!.orgId),
  });
  if (!org) { res.status(404).json({ error: "Organisation not found." }); return; }
  res.json({
    id: org.id,
    name: org.name,
    type: org.type,
    apiKey: { id: req.apiKey!.id, label: req.apiKey!.label, scopes: req.apiKey!.scopes },
  });
});

// ---------------------------------------------------------------------------
// GET /v1/org/members — list members. Anonymised by default; pass
// `?reveal=email` to receive emails (only if the key has scope members.read).
// ---------------------------------------------------------------------------
router.get("/members", requireScope("members.read"), async (req: ApiKeyRequest, res) => {
  const reveal = req.query.reveal === "email";
  const members = await db.query.orgMembersTable.findMany({
    where: eq(orgMembersTable.orgId, req.apiKey!.orgId),
    orderBy: (t, { asc }) => [asc(t.joinedAt)],
  });

  const memberIds = members.map(m => m.userId);
  const users = memberIds.length > 0
    ? await db.query.usersTable.findMany({ where: inArray(usersTable.id, memberIds) })
    : [];
  const byId = new Map(users.map(u => [u.id, u]));

  const data = members.map((m, idx) => {
    const u = byId.get(m.userId);
    return {
      memberIndex: idx + 1,
      memberRef: m.userId,
      role: m.role,
      joinedAt: m.joinedAt.toISOString(),
      ...(reveal && u ? { email: u.email, displayName: u.displayName } : {}),
    };
  });

  res.json({ count: data.length, members: data });
});

// ---------------------------------------------------------------------------
// GET /v1/org/stats — aggregate stats for the org over an optional date range
// ---------------------------------------------------------------------------
router.get("/stats", requireScope("stats.read"), async (req: ApiKeyRequest, res) => {
  const range = parseRange(req, res);
  if (!range) return;

  const members = await db.query.orgMembersTable.findMany({
    where: eq(orgMembersTable.orgId, req.apiKey!.orgId),
  });
  const memberIds = members.map(m => m.userId);

  let records: typeof impactRecordsTable.$inferSelect[] = [];
  if (memberIds.length > 0) {
    const baseCondition = inArray(impactRecordsTable.userId, memberIds);
    const fromCondition = range.from ? gte(impactRecordsTable.createdAt, range.from) : undefined;
    const toCondition = range.to ? lte(impactRecordsTable.createdAt, range.to) : undefined;
    records = await db.select().from(impactRecordsTable).where(and(baseCondition, fromCondition, toCondition));
  }

  let totalValue = 0;
  let totalHours = 0;
  let totalDonations = 0;
  let attestedRecords = 0;
  const categoryMap: Record<string, number> = {};

  for (const r of records) {
    const result = parseStoredResult(r.resultJson);
    totalValue += result.totalValue;
    totalHours += result.totalHours;
    totalDonations += result.donationsValue;
    if (r.attestedAt) attestedRecords += 1;
    for (const b of result.activityBreakdowns) {
      categoryMap[b.category] = (categoryMap[b.category] ?? 0) + b.impactValue;
    }
  }

  const totalUsersWithRecords = new Set(records.map(r => r.userId)).size;

  res.json({
    period: {
      from: range.from?.toISOString() ?? null,
      to: range.to?.toISOString() ?? null,
    },
    totals: {
      memberCount: memberIds.length,
      activeMemberCount: totalUsersWithRecords,
      records: records.length,
      attestedRecords,
      socialValueGBP: Math.round(totalValue * 100) / 100,
      hours: Math.round(totalHours * 100) / 100,
      donationsGBP: Math.round(totalDonations * 100) / 100,
    },
    valueByCategory: Object.entries(categoryMap)
      .map(([category, value]) => ({ category, value: Math.round(value * 100) / 100 }))
      .sort((a, b) => b.value - a.value),
  });
});

// ---------------------------------------------------------------------------
// POST /v1/org/hours — push attested hours for a member, identified by email
// ---------------------------------------------------------------------------
interface HoursPushBody {
  memberEmail?: unknown;
  occurredAt?: unknown;
  hours?: unknown;
  category?: unknown;
  activityName?: unknown;
  description?: unknown;
  externalRef?: unknown;
  // £ value per hour to use; if absent, falls back to a conservative national
  // volunteer-time placeholder (£17/hour).
  valuePerHourGBP?: unknown;
  donationsGBP?: unknown;
  periodLabel?: unknown;
}

const FALLBACK_VOLUNTEER_RATE_GBP_PER_HOUR = 17;

router.post("/hours", requireScope("hours.write"), async (req: ApiKeyRequest, res) => {
  const body = req.body as HoursPushBody;

  const email = typeof body.memberEmail === "string" ? body.memberEmail.trim().toLowerCase() : "";
  if (!email || !/.+@.+\..+/.test(email)) {
    res.status(400).json({ error: "memberEmail is required and must look like an email address." });
    return;
  }

  const hoursNum = typeof body.hours === "number" ? body.hours : Number(body.hours);
  if (!Number.isFinite(hoursNum) || hoursNum <= 0 || hoursNum > 24 * 365) {
    res.status(400).json({ error: "hours must be a positive number up to 8760." });
    return;
  }

  const occurredAtRaw = typeof body.occurredAt === "string" ? new Date(body.occurredAt) : new Date();
  if (isNaN(occurredAtRaw.getTime())) {
    res.status(400).json({ error: "occurredAt must be an ISO-8601 timestamp." });
    return;
  }

  const category = typeof body.category === "string" && body.category.trim() ? body.category.trim() : "Community";
  const activityName = typeof body.activityName === "string" && body.activityName.trim()
    ? body.activityName.trim()
    : "Org-attested activity";
  const description = typeof body.description === "string" ? body.description.trim().slice(0, 500) : "";
  const externalRef = typeof body.externalRef === "string" ? body.externalRef.trim().slice(0, 200) : null;

  const ratePerHour = typeof body.valuePerHourGBP === "number"
    ? body.valuePerHourGBP
    : Number.isFinite(Number(body.valuePerHourGBP))
      ? Number(body.valuePerHourGBP)
      : FALLBACK_VOLUNTEER_RATE_GBP_PER_HOUR;
  if (!Number.isFinite(ratePerHour) || ratePerHour < 0 || ratePerHour > 1000) {
    res.status(400).json({ error: "valuePerHourGBP must be a non-negative number up to 1000." });
    return;
  }

  const donationsGBP = typeof body.donationsGBP === "number"
    ? body.donationsGBP
    : Number.isFinite(Number(body.donationsGBP))
      ? Number(body.donationsGBP)
      : 0;
  if (!Number.isFinite(donationsGBP) || donationsGBP < 0) {
    res.status(400).json({ error: "donationsGBP must be a non-negative number." });
    return;
  }

  const periodLabel = typeof body.periodLabel === "string" ? body.periodLabel.trim().slice(0, 80) : null;

  // Look up the user by email and confirm they're a member of this org.
  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.email, email) });
  if (!user) {
    res.status(404).json({ error: `No My Impact account found for member email '${email}'. Ask them to sign up first.` });
    return;
  }
  const membership = await db.query.orgMembersTable.findFirst({
    where: and(eq(orgMembersTable.orgId, req.apiKey!.orgId), eq(orgMembersTable.userId, user.id)),
  });
  if (!membership) {
    res.status(403).json({ error: `User '${email}' exists but is not a member of this organisation.` });
    return;
  }

  const impactValue = hoursNum * ratePerHour;
  const totalValue = impactValue + donationsGBP;
  const now = new Date();

  const resultJson = {
    totalValue,
    impactValue,
    contributionValue: 0,
    donationsValue: donationsGBP,
    personalDevelopmentValue: 0,
    totalHours: hoursNum,
    activityBreakdowns: [{
      activityId: "org_attested",
      activityName,
      category,
      sdg: "",
      sdgColor: "#999",
      impactValue,
      hours: hoursNum,
    }],
    sdgBreakdowns: [],
    source: "org-attested",
    externalRef,
    description,
    occurredAt: occurredAtRaw.toISOString(),
  };

  const activitiesJson = [{
    activityId: "org_attested",
    quantity: hoursNum,
    hoursPerYear: hoursNum,
    description: description || activityName,
    valuePerUnit: ratePerHour,
  }];

  const [inserted] = await db.insert(impactRecordsTable).values({
    userId: user.id,
    name: activityName,
    periodLabel,
    totalValue: String(totalValue),
    impactValue: String(impactValue),
    contributionValue: "0",
    donationsValue: String(donationsGBP),
    personalDevelopmentValue: "0",
    totalHours: Math.round(hoursNum),
    activitiesJson,
    resultJson,
    attestedByApiKeyId: req.apiKey!.id,
    attestedAt: now,
    source: "org-attested",
  }).returning();

  // Fire two events: hours.logged (general) and hours.attested (specific to
  // org-API origin). Receivers can subscribe to either.
  const eventData = {
    recordId: String(inserted.id),
    member: { ref: user.id, email: user.email },
    activityName,
    category,
    hours: hoursNum,
    socialValueGBP: Math.round(totalValue * 100) / 100,
    valuePerHourGBP: ratePerHour,
    donationsGBP,
    occurredAt: occurredAtRaw.toISOString(),
    externalRef,
    attested: true,
    apiKeyId: req.apiKey!.id,
    apiKeyLabel: req.apiKey!.label,
  };
  await enqueueOrgEvent({ orgId: req.apiKey!.orgId, eventType: "hours.logged", payload: eventData });
  await enqueueOrgEvent({ orgId: req.apiKey!.orgId, eventType: "hours.attested", payload: eventData });

  res.status(201).json({
    ok: true,
    record: {
      id: String(inserted.id),
      memberRef: user.id,
      memberEmail: user.email,
      activityName,
      category,
      hours: hoursNum,
      socialValueGBP: Math.round(totalValue * 100) / 100,
      attested: true,
      attestedAt: now.toISOString(),
      occurredAt: occurredAtRaw.toISOString(),
      externalRef,
    },
  });
});

export default router;
