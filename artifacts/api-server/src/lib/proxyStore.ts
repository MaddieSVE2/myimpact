// Database-backed store for financial proxies.
//
// Proxies live in the `proxies` table so super admins can manage deflation
// factors, allowed units and enabled status without code changes. The table
// is seeded once from `proxyData.json` at startup (insert-only: rows that
// already exist are never touched, so admin edits always survive restarts
// and redeploys).

import { db, proxiesTable, type ProxyRow } from "@workspace/db";
import { sql } from "drizzle-orm";
import proxiesData from "./proxyData.json";
import { classifyProxy, type ProxyHorizon } from "./proxyClassify.js";

export interface StoredProxy {
  id: number;
  title: string;
  value: number;
  unit: string;
  sourceYear: string;
  horizon: ProxyHorizon;
  deflationFactor: number;
  allowedUnits: string[];
  enabled: boolean;
}

function toStored(row: ProxyRow): StoredProxy {
  return {
    id: row.id,
    title: row.title,
    value: Number(row.value),
    unit: row.unit,
    sourceYear: row.sourceYear,
    horizon: (row.horizon as ProxyHorizon) ?? "per_instance",
    deflationFactor: row.deflationFactor,
    allowedUnits: row.allowedUnits ?? [],
    enabled: row.enabled,
  };
}

// Obvious test/junk rows in the source JSON that should never be offered.
const JUNK_TITLE_RE = /^(test|no priority test)/i;

export async function seedProxies(): Promise<void> {
  const seen = new Set<string>();
  const rows: Array<typeof proxiesTable.$inferInsert> = [];
  for (const raw of proxiesData as Array<{ title: string; value: number; unit: string | number }>) {
    if (typeof raw.title !== "string" || !raw.title.trim()) continue;
    if (typeof raw.value !== "number" || !isFinite(raw.value) || raw.value <= 0) continue;
    if (JUNK_TITLE_RE.test(raw.title.trim())) continue;
    const c = classifyProxy(raw);
    if (seen.has(c.title)) continue; // source JSON contains duplicate titles
    seen.add(c.title);
    rows.push({
      title: c.title,
      value: String(c.value),
      unit: c.unit,
      sourceYear: c.sourceYear,
      horizon: c.horizon,
      deflationFactor: c.deflationFactor,
      allowedUnits: c.allowedUnits,
      enabled: true,
    });
  }

  // Insert-only seed in batches; existing rows (matched by title) are left
  // untouched so admin edits persist.
  const BATCH = 200;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const result = await db
      .insert(proxiesTable)
      .values(rows.slice(i, i + BATCH))
      .onConflictDoNothing({ target: proxiesTable.title })
      .returning({ id: proxiesTable.id });
    inserted += result.length;
  }
  if (inserted > 0) {
    console.log(`[proxy-seed] Inserted ${inserted} new proxies (${rows.length} total in source).`);
  }
}

// Short in-memory cache so the analyse endpoint doesn't hit the DB on every
// keystroke-triggered request; admin edits invalidate it immediately.
let cache: { at: number; proxies: StoredProxy[] } | null = null;
const CACHE_TTL_MS = 60_000;

export async function getAllProxies(): Promise<StoredProxy[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.proxies;
  const rows = await db.select().from(proxiesTable).orderBy(sql`lower(${proxiesTable.title})`);
  const proxies = rows.map(toStored);
  cache = { at: Date.now(), proxies };
  return proxies;
}

export async function getEnabledProxies(): Promise<StoredProxy[]> {
  return (await getAllProxies()).filter((p) => p.enabled);
}

/** Map keyed by proxy title, used for repairing historic records. */
export async function getProxyMapByTitle(): Promise<Map<string, StoredProxy>> {
  const all = await getAllProxies();
  return new Map(all.map((p) => [p.title, p]));
}

export function invalidateProxyCache(): void {
  cache = null;
}
