import { pgTable, serial, text, numeric, real, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Financial proxies used by the AI matcher for custom activities.
 *
 * Seeded once from `artifacts/api-server/src/lib/proxyData.json` at API
 * startup (insert-only — admin edits are never overwritten). Each proxy
 * carries valuation metadata:
 *
 * - horizon: what timespan the proxy value represents —
 *   'per_instance' (one event/session/hour), 'annual' (per person/household
 *   per year), 'multi_year' (cumulative over several years) or 'lifetime'
 *   (whole-life outcome such as lifetime productivity gains).
 * - deflationFactor: 0–1 multiplier applied to the raw value when the proxy
 *   is used to price a single contribution, so long-horizon outcomes are
 *   scaled to a defensible per-contribution share.
 * - allowedUnits: units the matcher may pair with this proxy
 *   (e.g. ["person"], ["hour","session"]). Empty = any unit.
 * - enabled: disabled proxies are never offered by the AI matcher.
 */
export const proxiesTable = pgTable("proxies", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  value: numeric("value", { precision: 14, scale: 2 }).notNull(),
  unit: text("unit").notNull(),
  sourceYear: text("source_year").notNull().default(""),
  horizon: text("horizon").notNull().default("per_instance"),
  deflationFactor: real("deflation_factor").notNull().default(1),
  allowedUnits: text("allowed_units").array().notNull().$default(() => []),
  enabled: boolean("enabled").notNull().default(true),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  titleIdx: uniqueIndex("proxies_title_idx").on(t.title),
}));

export type ProxyRow = typeof proxiesTable.$inferSelect;
