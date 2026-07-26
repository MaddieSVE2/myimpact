import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";

/**
 * Admin-edited overrides for the Sidekick prompt template copy.
 *
 * Defaults live in code (`artifacts/my-impact/src/lib/sidekick-templates.ts`).
 * A row here overrides the label / description / persona prompts for one
 * template at runtime; deleting the row resets it to the in-code default.
 * Null fields mean "use the default".
 */
export const sidekickTemplateOverridesTable = pgTable("sidekick_template_overrides", {
  templateId: text("template_id").primaryKey(),
  label: text("label"),
  description: text("description"),
  /** Partial map of persona -> prompt string (with {activity}/{numbers}/{recent} placeholders). */
  personaPrompts: jsonb("persona_prompts").$type<Record<string, string>>(),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type SidekickTemplateOverrideRow = typeof sidekickTemplateOverridesTable.$inferSelect;
