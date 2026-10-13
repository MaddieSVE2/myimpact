import { Router, type IRouter } from "express";
import { db, impactRecordsTable, organisationsTable, orgMatchRatesTable, orgMembersTable } from "@workspace/db";
import { and, asc, eq, gte, isNull, lte } from "drizzle-orm";
import { randomUUID } from "crypto";
import { computeMatchesForRecords, type RecordForMatch } from "../lib/orgMatch.js";
import { orgVisibleMemberRecordsCondition } from "../lib/orgSharing.js";
import { endOfDay } from "../lib/summaryPeriod.js";
import { authenticate, type AuthenticatedRequest } from "../middleware/authenticate.js";
import { requireOrgManager } from "../lib/orgManager.js";

/**
 * Match funding (manager-only): the organisation's match rates, the matched
 * totals and their CSV export. Mounted at /org.
 */
const router: IRouter = Router();

function parseOptionalNonNegativeNumber(value: unknown, label: string): { ok: true; value: number | null } | { ok: false; error: string } {
  if (value === null || value === undefined || value === "") return { ok: true, value: null };
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  if (!Number.isFinite(n) || n < 0) return { ok: false, error: `${label} must be a non-negative number.` };
  return { ok: true, value: n };
}

function parseDate(value: unknown, label: string): { ok: true; value: Date } | { ok: false; error: string } {
  if (typeof value !== "string" || !value) return { ok: false, error: `${label} is required.` };
  const d = new Date(value);
  if (isNaN(d.getTime())) return { ok: false, error: `${label} is not a valid date.` };
  return { ok: true, value: d };
}

router.get("/match/rates", authenticate, async (req: AuthenticatedRequest, res) => {
  const membership = await requireOrgManager(req, res);
  if (!membership) return;

  const rates = await db.query.orgMatchRatesTable.findMany({
    where: eq(orgMatchRatesTable.orgId, membership.orgId),
    orderBy: (t, { desc }) => [desc(t.effectiveFrom)],
  });

  res.json({
    rates: rates.map(r => ({
      id: r.id,
      hourlyRate: r.hourlyRate !== null ? Number(r.hourlyRate) : null,
      donationMultiplier: r.donationMultiplier !== null ? Number(r.donationMultiplier) : null,
      monthlyCapPerMember: r.monthlyCapPerMember !== null ? Number(r.monthlyCapPerMember) : null,
      onlyVerifiedHours: r.onlyVerifiedHours,
      effectiveFrom: r.effectiveFrom.toISOString(),
      effectiveTo: r.effectiveTo ? r.effectiveTo.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    })),
  });
});

router.post("/match/rates", authenticate, async (req: AuthenticatedRequest, res) => {
  const membership = await requireOrgManager(req, res);
  if (!membership) return;

  const userId = req.user!.id;

  const hourlyResult = parseOptionalNonNegativeNumber(req.body?.hourlyRate, "Hourly rate");
  if (!hourlyResult.ok) { res.status(400).json({ error: hourlyResult.error }); return; }

  const donationResult = parseOptionalNonNegativeNumber(req.body?.donationMultiplier, "Donation multiplier");
  if (!donationResult.ok) { res.status(400).json({ error: donationResult.error }); return; }

  const capResult = parseOptionalNonNegativeNumber(req.body?.monthlyCapPerMember, "Monthly cap");
  if (!capResult.ok) { res.status(400).json({ error: capResult.error }); return; }

  if (hourlyResult.value === null && donationResult.value === null) {
    res.status(400).json({ error: "Set at least one of: hourly rate or donation multiplier." });
    return;
  }

  const fromResult = parseDate(req.body?.effectiveFrom, "Effective from");
  if (!fromResult.ok) { res.status(400).json({ error: fromResult.error }); return; }

  const onlyVerified = req.body?.onlyVerifiedHours === true;

  // End-date the previous active rate at this new rate's effective_from (if any overlap).
  const previousActive = await db.query.orgMatchRatesTable.findFirst({
    where: and(eq(orgMatchRatesTable.orgId, membership.orgId), isNull(orgMatchRatesTable.effectiveTo)),
  });
  if (previousActive) {
    const newFrom = fromResult.value;
    if (newFrom <= previousActive.effectiveFrom) {
      res.status(400).json({ error: "New rate must start after the previous active rate's start date." });
      return;
    }
    await db.update(orgMatchRatesTable)
      .set({ effectiveTo: newFrom })
      .where(eq(orgMatchRatesTable.id, previousActive.id));
  }

  const id = randomUUID();
  await db.insert(orgMatchRatesTable).values({
    id,
    orgId: membership.orgId,
    hourlyRate: hourlyResult.value !== null ? String(hourlyResult.value) : null,
    donationMultiplier: donationResult.value !== null ? String(donationResult.value) : null,
    monthlyCapPerMember: capResult.value !== null ? String(capResult.value) : null,
    onlyVerifiedHours: onlyVerified,
    effectiveFrom: fromResult.value,
    effectiveTo: null,
    createdBy: userId,
  });

  res.json({ ok: true, id });
});

router.post("/match/rates/end", authenticate, async (req: AuthenticatedRequest, res) => {
  const membership = await requireOrgManager(req, res);
  if (!membership) return;

  const endDate = req.body?.effectiveTo ? parseDate(req.body.effectiveTo, "End date") : { ok: true as const, value: new Date() };
  if (!endDate.ok) { res.status(400).json({ error: endDate.error }); return; }

  const active = await db.query.orgMatchRatesTable.findFirst({
    where: and(eq(orgMatchRatesTable.orgId, membership.orgId), isNull(orgMatchRatesTable.effectiveTo)),
  });
  if (!active) {
    res.status(404).json({ error: "No active match rate to end." });
    return;
  }
  if (endDate.value <= active.effectiveFrom) {
    res.status(400).json({ error: "End date must be after the rate's start date." });
    return;
  }

  await db.update(orgMatchRatesTable)
    .set({ effectiveTo: endDate.value })
    .where(eq(orgMatchRatesTable.id, active.id));

  res.json({ ok: true });
});

interface ResultJsonForMatch {
  totalHours: number;
  donationsValue: number;
}

function parseRecordForMatch(raw: unknown): ResultJsonForMatch {
  if (raw === null || typeof raw !== "object") return { totalHours: 0, donationsValue: 0 };
  const r = raw as Record<string, unknown>;
  return {
    totalHours: typeof r.totalHours === "number" ? r.totalHours : 0,
    donationsValue: typeof r.donationsValue === "number" ? r.donationsValue : 0,
  };
}

async function loadOrgMatchSet(orgId: string, from?: Date, to?: Date) {
  const members = await db.query.orgMembersTable.findMany({
    where: and(eq(orgMembersTable.orgId, orgId), eq(orgMembersTable.status, "active")),
  });
  const memberIds = members.map(m => m.userId);

  const rates = await db.query.orgMatchRatesTable.findMany({
    where: eq(orgMatchRatesTable.orgId, orgId),
    orderBy: (t) => [asc(t.effectiveFrom)],
  });

  let records: typeof impactRecordsTable.$inferSelect[] = [];
  if (memberIds.length > 0) {
    const baseCondition = orgVisibleMemberRecordsCondition(orgId, memberIds)!;
    const fromCondition = from ? gte(impactRecordsTable.createdAt, from) : undefined;
    const toCondition = to ? lte(impactRecordsTable.createdAt, to) : undefined;
    records = await db.select().from(impactRecordsTable).where(and(baseCondition, fromCondition, toCondition));
  }

  const recordsForMatch: RecordForMatch[] = records.map(r => {
    const parsed = parseRecordForMatch(r.resultJson);
    return {
      id: r.id,
      userId: r.userId,
      createdAt: r.createdAt,
      totalHours: parsed.totalHours,
      donationsValue: parsed.donationsValue,
    };
  });

  const matches = computeMatchesForRecords(recordsForMatch, rates);
  return { records, recordsForMatch, matches, memberIds };
}

router.get("/match/summary", authenticate, async (req: AuthenticatedRequest, res) => {
  const membership = await requireOrgManager(req, res);
  if (!membership) return;

  const fromParam = req.query.from;
  const toParam = req.query.to;
  const fromRaw = typeof fromParam === "string" && fromParam ? new Date(fromParam) : undefined;
  const toRaw = typeof toParam === "string" && toParam ? new Date(toParam) : undefined;
  const from = fromRaw && !isNaN(fromRaw.getTime()) ? fromRaw : undefined;
  const to = toRaw && !isNaN(toRaw.getTime()) ? endOfDay(toRaw) : undefined;

  const { matches, recordsForMatch } = await loadOrgMatchSet(membership.orgId, from, to);

  const totalCommitment = matches.reduce((s, m) => s + m.matchedValue, 0);
  const totalHoursMatched = matches.reduce((s, m) => s + m.hoursMatched, 0);
  const totalDonationsMatched = matches.reduce((s, m) => s + m.donationsMatched, 0);
  const matchedRecordsCount = matches.filter(m => m.matchedValue > 0).length;
  const matchedMembersCount = new Set(
    matches.filter(m => m.matchedValue > 0).map(m => m.userId),
  ).size;

  // Monthly series (capped totals per month)
  const monthly: Record<string, number> = {};
  for (const m of matches) {
    const rec = recordsForMatch.find(r => String(r.id) === m.recordId);
    if (!rec) continue;
    const key = `${rec.createdAt.getFullYear()}-${String(rec.createdAt.getMonth() + 1).padStart(2, "0")}`;
    monthly[key] = (monthly[key] ?? 0) + m.matchedValue;
  }

  res.json({
    totalCommitment: Math.round(totalCommitment * 100) / 100,
    totalHoursMatched: Math.round(totalHoursMatched * 100) / 100,
    totalDonationsMatched: Math.round(totalDonationsMatched * 100) / 100,
    matchedRecordsCount,
    matchedMembersCount,
    monthly: Object.entries(monthly)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, value]) => ({ month, value: Math.round(value * 100) / 100 })),
  });
});

function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

router.get("/match/csv", authenticate, async (req: AuthenticatedRequest, res) => {
  const membership = await requireOrgManager(req, res);
  if (!membership) return;

  const fromParam = req.query.from;
  const toParam = req.query.to;
  const fromRaw = typeof fromParam === "string" && fromParam ? new Date(fromParam) : undefined;
  const toRaw = typeof toParam === "string" && toParam ? new Date(toParam) : undefined;
  const from = fromRaw && !isNaN(fromRaw.getTime()) ? fromRaw : undefined;
  const to = toRaw && !isNaN(toRaw.getTime()) ? endOfDay(toRaw) : undefined;

  const { matches, recordsForMatch, memberIds } = await loadOrgMatchSet(membership.orgId, from, to);

  // Group by member-month
  type Bucket = { userId: string; month: string; hours: number; donations: number; matched: number; logged: number };
  const buckets: Record<string, Bucket> = {};
  for (const m of matches) {
    const rec = recordsForMatch.find(r => String(r.id) === m.recordId);
    if (!rec) continue;
    const month = `${rec.createdAt.getFullYear()}-${String(rec.createdAt.getMonth() + 1).padStart(2, "0")}`;
    const key = `${rec.userId}::${month}`;
    if (!buckets[key]) buckets[key] = { userId: rec.userId, month, hours: 0, donations: 0, matched: 0, logged: 0 };
    buckets[key].hours += rec.totalHours;
    buckets[key].donations += rec.donationsValue;
    buckets[key].matched += m.matchedValue;
  }

  // Get member emails for the CSV (anonymised: we use a member index instead of email, to preserve member privacy)
  const memberOrder = new Map<string, number>();
  memberIds.forEach((id, idx) => memberOrder.set(id, idx + 1));

  const rows = [
    ["Member #", "Month", "Hours logged", "Donations logged (£)", "Matched amount (£)"],
    ...Object.values(buckets)
      .sort((a, b) => a.month.localeCompare(b.month) || (memberOrder.get(a.userId) ?? 0) - (memberOrder.get(b.userId) ?? 0))
      .map(b => [
        String(memberOrder.get(b.userId) ?? "?"),
        b.month,
        (Math.round(b.hours * 100) / 100).toFixed(2),
        (Math.round(b.donations * 100) / 100).toFixed(2),
        (Math.round(b.matched * 100) / 100).toFixed(2),
      ]),
  ];

  const csv = rows.map(r => r.map(csvEscape).join(",")).join("\r\n");

  const org = await db.query.organisationsTable.findFirst({
    where: eq(organisationsTable.id, membership.orgId),
  });
  const safeName = (org?.name ?? "org").replace(/[^a-z0-9]+/gi, "-").toLowerCase();

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${safeName}-match-export.csv"`);
  res.send(csv);
});

export default router;
