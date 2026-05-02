import type { OrgMatchRate } from "@workspace/db";

export interface RecordForMatch {
  id: string | number;
  userId: string;
  createdAt: Date;
  totalHours: number;
  donationsValue: number;
}

export interface RecordMatchResult {
  recordId: string;
  userId: string;
  matchedValue: number;
  hoursMatched: number;
  donationsMatched: number;
  rateId: string | null;
  cappedAtMonthlyLimit: boolean;
}

export interface ResolvedRate {
  id: string;
  hourlyRate: number | null;
  donationMultiplier: number | null;
  monthlyCapPerMember: number | null;
  onlyVerifiedHours: boolean;
}

function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(n) ? n : null;
}

export function resolveRate(rate: OrgMatchRate): ResolvedRate {
  return {
    id: rate.id,
    hourlyRate: toNumber(rate.hourlyRate),
    donationMultiplier: toNumber(rate.donationMultiplier),
    monthlyCapPerMember: toNumber(rate.monthlyCapPerMember),
    onlyVerifiedHours: rate.onlyVerifiedHours,
  };
}

export function findActiveRateAt(rates: OrgMatchRate[], when: Date): ResolvedRate | null {
  const candidates = rates
    .filter(r => {
      const from = r.effectiveFrom instanceof Date ? r.effectiveFrom : new Date(r.effectiveFrom);
      const to = r.effectiveTo ? (r.effectiveTo instanceof Date ? r.effectiveTo : new Date(r.effectiveTo)) : null;
      return from.getTime() <= when.getTime() && (to === null || to.getTime() > when.getTime());
    })
    .sort((a, b) => {
      const aFrom = a.effectiveFrom instanceof Date ? a.effectiveFrom : new Date(a.effectiveFrom);
      const bFrom = b.effectiveFrom instanceof Date ? b.effectiveFrom : new Date(b.effectiveFrom);
      return bFrom.getTime() - aFrom.getTime();
    });
  if (candidates.length === 0) return null;
  return resolveRate(candidates[0]!);
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function computeMatchesForRecords(
  records: RecordForMatch[],
  rates: OrgMatchRate[],
): RecordMatchResult[] {
  const sorted = [...records].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const monthlyRunningTotal: Record<string, number> = {};

  return sorted.map(record => {
    const rate = findActiveRateAt(rates, record.createdAt);
    if (!rate) {
      return {
        recordId: String(record.id),
        userId: record.userId,
        matchedValue: 0,
        hoursMatched: 0,
        donationsMatched: 0,
        rateId: null,
        cappedAtMonthlyLimit: false,
      };
    }

    const hourly = rate.hourlyRate ?? 0;
    const donationMul = rate.donationMultiplier ?? 0;
    const hoursMatchRaw = Math.max(0, record.totalHours) * Math.max(0, hourly);
    const donationsMatchRaw = Math.max(0, record.donationsValue) * Math.max(0, donationMul);
    let matchedRaw = hoursMatchRaw + donationsMatchRaw;

    let cappedAtMonthlyLimit = false;
    if (rate.monthlyCapPerMember !== null && rate.monthlyCapPerMember >= 0) {
      const key = `${record.userId}:${monthKey(record.createdAt)}`;
      const used = monthlyRunningTotal[key] ?? 0;
      const remaining = Math.max(0, rate.monthlyCapPerMember - used);
      if (matchedRaw > remaining) {
        cappedAtMonthlyLimit = true;
        matchedRaw = remaining;
      }
      monthlyRunningTotal[key] = used + matchedRaw;
    }

    let hoursMatched = hoursMatchRaw;
    let donationsMatched = donationsMatchRaw;
    const totalRaw = hoursMatchRaw + donationsMatchRaw;
    if (totalRaw > 0 && cappedAtMonthlyLimit) {
      const ratio = matchedRaw / totalRaw;
      hoursMatched = hoursMatchRaw * ratio;
      donationsMatched = donationsMatchRaw * ratio;
    }

    return {
      recordId: String(record.id),
      userId: record.userId,
      matchedValue: Math.round(matchedRaw * 100) / 100,
      hoursMatched: Math.round(hoursMatched * 100) / 100,
      donationsMatched: Math.round(donationsMatched * 100) / 100,
      rateId: rate.id,
      cappedAtMonthlyLimit,
    };
  });
}
