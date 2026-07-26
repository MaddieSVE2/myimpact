// Repair of historic records that used long-horizon proxies at full value.
//
// Before deflation factors existed, a custom activity matched to e.g.
// "Lifetime productivity gains from achieving 5-7 good GCSEs" was valued at
// the full £79,008 per person — wildly overstating one contribution. This
// module rewrites those breakdowns using the proxy's current deflation
// factor and recomputes derived totals, mirroring the donation-inflation
// repair in `donationRepair.ts`.
//
// It runs as a one-shot startup sweep (like the donation repair pattern) so
// the fix also lands in production on the next publish. It is idempotent:
// a breakdown is only repaired when its stored valuePerUnit still equals the
// proxy's full (undeflated) value.

import { db, impactRecordsTable } from "@workspace/db";
import { eq, sql, gt, and, asc } from "drizzle-orm";
import { getProxyMapByTitle, type StoredProxy } from "./proxyStore.js";
import { deflateProxyValue } from "./proxyValuation.js";

interface BreakdownLike {
  activityId?: string;
  activityName?: string;
  category?: string;
  proxy?: string;
  proxyYear?: string;
  sdg?: string;
  sdgColor?: string;
  impactValue?: number;
  hours?: number;
  quantity?: number;
  valuePerUnit?: number;
  unit?: string;
  unitLabel?: string;
}

const VOLUNTEER_RATE = 12.21;          // keep in sync with calculateImpact
const PERSONAL_DEV_RATE_PER_HOUR = 15; // keep in sync with calculateImpact

const round2 = (n: number) => Math.round(n * 100) / 100;

function isCustomBreakdown(b: BreakdownLike): boolean {
  return b.category === "Custom" || String(b.activityId ?? "").startsWith("custom");
}

// Returns the repaired breakdown, or null when nothing needs fixing.
function repairBreakdown(b: BreakdownLike, proxy: StoredProxy): BreakdownLike | null {
  if (proxy.deflationFactor >= 1 || proxy.deflationFactor <= 0) return null;
  const storedVpu = typeof b.valuePerUnit === "number" ? b.valuePerUnit : null;
  // Only records still valued at (approximately) the full undeflated value
  // are overstated; anything else was created post-deflation or hand-fixed.
  if (storedVpu == null || Math.abs(storedVpu - proxy.value) > 0.01) return null;

  const unit = typeof b.unit === "string" ? b.unit : "";
  const valuation = deflateProxyValue(proxy, unit);
  if (valuation.appliedFactor >= 1) return null;

  const hours = typeof b.hours === "number" ? b.hours : 0;
  const quantity = typeof b.quantity === "number" ? b.quantity : 0;
  const impactValue =
    unit === "hour" ? round2(hours * valuation.valuePerUnit) : round2(quantity * valuation.valuePerUnit);

  return {
    ...b,
    valuePerUnit: valuation.valuePerUnit,
    impactValue,
  };
}

// Rewrites overstated long-horizon proxy breakdowns in a saved impact
// result. Returns null when nothing needed fixing.
export function repairOverstatedProxies(
  result: Record<string, unknown>,
  proxyMap: Map<string, StoredProxy>,
): Record<string, unknown> | null {
  const breakdowns = Array.isArray(result.activityBreakdowns)
    ? (result.activityBreakdowns as BreakdownLike[])
    : [];
  let changed = false;

  const fixed = breakdowns.map((b) => {
    if (!isCustomBreakdown(b)) return b;
    const title = typeof b.proxy === "string" ? b.proxy : "";
    const proxy = title ? proxyMap.get(title) : undefined;
    if (!proxy) return b;
    const repaired = repairBreakdown(b, proxy);
    if (!repaired) return b;
    changed = true;
    return repaired;
  });

  if (!changed) return null;

  // Hours are unchanged by this repair — only proxy-valued impact shifts.
  const totalHours = typeof result.totalHours === "number" ? result.totalHours : 0;
  const impactValue = fixed.reduce((sum, b) => sum + (typeof b.impactValue === "number" ? b.impactValue : 0), 0);
  const donationsValue = typeof result.donationsValue === "number" ? result.donationsValue : 0;
  const contributionValue = totalHours * VOLUNTEER_RATE;
  const personalDevelopmentValue = totalHours * PERSONAL_DEV_RATE_PER_HOUR;
  const totalValue = impactValue + contributionValue + donationsValue + personalDevelopmentValue;

  const sdgMap = new Map<string, { sdg: string; sdgColor: string; value: number }>();
  for (const b of fixed) {
    const sdg = b.sdg ?? "Good Health and Well-Being";
    if (!sdgMap.has(sdg)) {
      sdgMap.set(sdg, { sdg, sdgColor: b.sdgColor ?? "#4C9F38", value: 0 });
    }
    sdgMap.get(sdg)!.value += typeof b.impactValue === "number" ? b.impactValue : 0;
  }
  const sdgBreakdowns = Array.from(sdgMap.values()).map((s) => ({ ...s, value: round2(s.value) }));

  return {
    ...result,
    activityBreakdowns: fixed,
    totalHours,
    impactValue: round2(impactValue),
    contributionValue: round2(contributionValue),
    donationsValue: round2(donationsValue),
    personalDevelopmentValue: round2(personalDevelopmentValue),
    totalValue: round2(totalValue),
    sdgBreakdowns,
  };
}

// One-shot startup sweep over saved impact records. Only records whose JSON
// contains a Custom breakdown are scanned; the SQL filter keeps the batch
// volume low. Errors are logged and non-fatal.
export async function runProxyRepairSweep(): Promise<void> {
  try {
    const proxyMap = await getProxyMapByTitle();
    const deflated = new Map(
      Array.from(proxyMap.entries()).filter(([, p]) => p.deflationFactor < 1 && p.deflationFactor > 0),
    );
    if (deflated.size === 0) return;

    let cursor = 0;
    let scanned = 0;
    let repairedCount = 0;
    const BATCH = 200;

    for (;;) {
      const rows = await db
        .select({ id: impactRecordsTable.id, resultJson: impactRecordsTable.resultJson })
        .from(impactRecordsTable)
        .where(
          and(
            gt(impactRecordsTable.id, cursor),
            // jsonb::text renders with a space after the colon.
            sql`${impactRecordsTable.resultJson}::text LIKE '%"category": "Custom"%'`,
          ),
        )
        .orderBy(asc(impactRecordsTable.id))
        .limit(BATCH);
      if (rows.length === 0) break;
      cursor = rows[rows.length - 1].id;
      scanned += rows.length;

      for (const row of rows) {
        const result = row.resultJson as Record<string, unknown>;
        const repaired = repairOverstatedProxies(result, deflated);
        if (!repaired) continue;
        await db
          .update(impactRecordsTable)
          .set({
            resultJson: repaired,
            totalValue: String(repaired.totalValue),
            impactValue: String(repaired.impactValue),
            contributionValue: String(repaired.contributionValue),
            donationsValue: String(repaired.donationsValue),
            personalDevelopmentValue: String(repaired.personalDevelopmentValue),
            totalHours: Number(repaired.totalHours) || 0,
          })
          .where(eq(impactRecordsTable.id, row.id));
        repairedCount++;
      }
    }

    if (repairedCount > 0) {
      console.log(`[proxy-repair] Repaired ${repairedCount} of ${scanned} scanned records with overstated long-horizon proxies.`);
    }
  } catch (err) {
    console.error("[proxy-repair] Sweep failed (non-fatal):", err);
  }
}
