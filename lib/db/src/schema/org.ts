import { pgTable, text, timestamp, unique, numeric, boolean, integer, jsonb, index, serial } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";
import { impactRecordsTable } from "./impact";

export const organisationsTable = pgTable("organisations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  inviteCode: text("invite_code").notNull().unique(),
  // Org-level toggle controlling whether members of this org see / can use
  // the in-app AI Sidekick. Managed from /org/settings → AI features.
  aiSidekickEnabled: boolean("ai_sidekick_enabled").notNull().default(true),
  // Org-level toggle controlling whether members of this org see the
  // leaderboard on all challenges. Managed from /org/settings → AI features.
  challengeLeaderboardEnabled: boolean("challenge_leaderboard_enabled").notNull().default(true),
  // Org branding — all optional. logoKey is an object-storage key (relative to
  // PRIVATE_OBJECT_DIR) for an uploaded logo image. brandPrimary / brandAccent
  // are 6-digit hex strings (e.g. "#0EA5E9"). Unset = use default My Impact
  // styling. Managed from /org/settings → Org profile → Branding.
  logoKey: text("logo_key"),
  brandPrimary: text("brand_primary"),
  brandAccent: text("brand_accent"),
  // Per-org SROI cost-per-volunteer (whole pounds) used in the dashboard SROI
  // explainer. NULL means "use the application default" (£475). Managed from
  // /org/settings → Org profile → SROI assumptions.
  // When the manager enters sub-amounts (recruitment / onboarding / support /
  // admin), this field is the derived total (sum of non-null sub-amounts) so
  // the dashboard always reads a single number.
  sroiCostPerVolunteer: integer("sroi_cost_per_volunteer"),
  // Optional per-line-item breakdown of the per-volunteer cost. Power-user
  // managers (e.g. larger charities) split the total so it's auditable and
  // they can justify it to funders. Each is in whole pounds and may be NULL
  // independently. When all four are NULL there is no breakdown and the
  // single sroiCostPerVolunteer figure (or default) is used as-is.
  sroiCostRecruitment: integer("sroi_cost_recruitment"),
  sroiCostOnboarding: integer("sroi_cost_onboarding"),
  sroiCostSupport: integer("sroi_cost_support"),
  sroiCostAdmin: integer("sroi_cost_admin"),
  // Per-org summary period start stored as "MM-DD" (e.g. "09-01" for Sep 1).
  // Determines the start of each annual reporting window. Defaults to "01-01"
  // (calendar year). Admins can choose: calendar (01-01), academic (09-01),
  // financial (04-01), or any custom month-day.
  summaryYearStart: text("summary_year_start").notNull().default("01-01"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const orgMembersTable = pgTable("org_members", {
  orgId: text("org_id").notNull().references(() => organisationsTable.id),
  userId: text("user_id").notNull().references(() => usersTable.id),
  role: text("role").notNull().default("member"),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
}, (table) => ({
  userUnique: unique("org_members_user_unique").on(table.userId),
  membershipUnique: unique("org_members_membership_unique").on(table.orgId, table.userId),
}));

export const orgRegistrationsTable = pgTable("org_registrations", {
  id: text("id").primaryKey(),
  orgName: text("org_name").notNull(),
  type: text("type").notNull(),
  contactName: text("contact_name").notNull(),
  contactEmail: text("contact_email").notNull(),
  size: text("size"),
  purpose: text("purpose"),
  status: text("status").notNull().default("pending"),
  inviteCode: text("invite_code"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const orgMatchRatesTable = pgTable("org_match_rates", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => organisationsTable.id, { onDelete: "cascade" }),
  hourlyRate: numeric("hourly_rate", { precision: 10, scale: 4 }),
  donationMultiplier: numeric("donation_multiplier", { precision: 10, scale: 4 }),
  monthlyCapPerMember: numeric("monthly_cap_per_member", { precision: 12, scale: 2 }),
  onlyVerifiedHours: boolean("only_verified_hours").notNull().default(false),
  effectiveFrom: timestamp("effective_from").notNull(),
  effectiveTo: timestamp("effective_to"),
  createdBy: text("created_by").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const orgShareLinksTable = pgTable("org_share_links", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  orgId: text("org_id").notNull().references(() => organisationsTable.id),
  createdByUserId: text("created_by_user_id").notNull().references(() => usersTable.id),
  // 'all' | 'summary' | 'timeline' | 'categories' | 'regions'
  scope: text("scope").notNull().default("all"),
  funderLabel: text("funder_label"),
  expiresAt: timestamp("expires_at"),
  revokedAt: timestamp("revoked_at"),
  viewCount: integer("view_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  orgIdx: index("org_share_links_org_idx").on(t.orgId),
}));

// API keys minted by org managers. The raw key is shown ONCE at creation
// time and never stored — only `keyHash` (sha256 of the raw key) is kept.
export const orgApiKeysTable = pgTable("org_api_keys", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => organisationsTable.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  keyHash: text("key_hash").notNull().unique(),
  // First 8 chars of the raw key, useful for the UI to display "mi_orgk_abcd1234…"
  keyPrefix: text("key_prefix").notNull(),
  scopes: text("scopes").array().notNull().default(["hours.write", "members.read", "stats.read"]),
  lastUsedAt: timestamp("last_used_at"),
  revokedAt: timestamp("revoked_at"),
  createdBy: text("created_by").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  orgIdx: index("org_api_keys_org_idx").on(t.orgId),
}));

// Outbound webhook subscriptions. The `secret` is generated server-side and
// used to sign delivery payloads with HMAC-SHA256.
export const orgWebhooksTable = pgTable("org_webhooks", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => organisationsTable.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  secret: text("secret").notNull(),
  events: text("events").array().notNull(),
  enabled: boolean("enabled").notNull().default(true),
  // Set when retries are exhausted (24h window) and the endpoint is marked dead
  deadAt: timestamp("dead_at"),
  lastSuccessAt: timestamp("last_success_at"),
  lastFailureAt: timestamp("last_failure_at"),
  lastError: text("last_error"),
  createdBy: text("created_by").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  orgIdx: index("org_webhooks_org_idx").on(t.orgId),
}));

// Per-attempt delivery queue. The dispatcher polls rows where
// `status = 'pending' AND nextAttemptAt <= now()`.
export const webhookDeliveriesTable = pgTable("webhook_deliveries", {
  id: text("id").primaryKey(),
  webhookId: text("webhook_id").notNull().references(() => orgWebhooksTable.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload").notNull(),
  status: text("status").notNull().default("pending"), // pending | delivered | dead
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at").defaultNow().notNull(),
  firstAttemptAt: timestamp("first_attempt_at"),
  lastAttemptAt: timestamp("last_attempt_at"),
  deliveredAt: timestamp("delivered_at"),
  lastResponseStatus: integer("last_response_status"),
  lastError: text("last_error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  pendingIdx: index("webhook_deliveries_pending_idx").on(t.status, t.nextAttemptAt),
  webhookIdx: index("webhook_deliveries_webhook_idx").on(t.webhookId),
}));

// org_subscriptions: mirrors Stripe subscription state locally so the app can
// resolve a tier (and gated features) without hitting Stripe on every request.
// `tier` is the canonical app concept (free | team | org | enterprise). `status`
// follows Stripe's vocabulary (active | trialing | past_due | canceled | unpaid).
// `override` lets staff pin a tier for design partners regardless of Stripe.
export const orgSubscriptionsTable = pgTable("org_subscriptions", {
  orgId: text("org_id").primaryKey().references(() => organisationsTable.id, { onDelete: "cascade" }),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  tier: text("tier").notNull().default("free"),
  status: text("status").notNull().default("active"),
  currentPeriodEnd: timestamp("current_period_end"),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  override: text("override"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  customerIdx: index("org_subscriptions_customer_idx").on(t.stripeCustomerId),
}));

// Per-organisation SSO (OIDC) configuration. An org admin chooses a
// provider (google | microsoft), enters the email domain they own, and
// optionally a Microsoft Entra tenant ID. When `enforceSSO` is true,
// magic-link sign-in is blocked for that domain.
export const orgSsoConfigsTable = pgTable("org_sso_configs", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => organisationsTable.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(), // 'google' | 'microsoft'
  domain: text("domain").notNull(),
  tenantId: text("tenant_id"), // Required for Microsoft Entra; ignored for Google
  enforceSSO: boolean("enforce_sso").notNull().default(false),
  status: text("status").notNull().default("pending"), // 'pending' | 'verified' | 'error'
  // Token placed as a DNS TXT record at _mi-sso-verify.<domain> to prove domain control.
  verificationToken: text("verification_token"),
  lastTestAt: timestamp("last_test_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  orgDomainUniq: unique("org_sso_configs_org_domain_uniq").on(table.orgId, table.domain),
  domainUniq: unique("org_sso_configs_domain_uniq").on(table.domain),
  orgIdx: index("org_sso_configs_org_idx").on(table.orgId),
}));

// Pulse surveys created by org managers. Members see active surveys on their
// home page; aggregated responses appear in the org dashboard.
export const orgSurveysTable = pgTable("org_surveys", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => organisationsTable.id, { onDelete: "cascade" }),
  // 'meaningfulness' | 'wellbeing' | 'custom'
  template: text("template").notNull(),
  question: text("question").notNull(),
  // 'one_off' | 'monthly' | 'quarterly'
  schedule: text("schedule").notNull(),
  anonymous: boolean("anonymous").notNull().default(true),
  createdBy: text("created_by").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  archivedAt: timestamp("archived_at"),
}, (t) => ({
  orgIdx: index("org_surveys_org_idx").on(t.orgId),
}));

export const orgSurveyResponsesTable = pgTable("org_survey_responses", {
  id: text("id").primaryKey(),
  surveyId: text("survey_id").notNull().references(() => orgSurveysTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => usersTable.id),
  // 'once' for one_off, 'YYYY-MM' for monthly, 'YYYY-Qn' for quarterly
  windowKey: text("window_key").notNull(),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  surveyIdx: index("org_survey_responses_survey_idx").on(t.surveyId),
  userWindowUnique: unique("org_survey_responses_user_window_unique").on(t.surveyId, t.userId, t.windowKey),
}));

// Per-org opt-out: a member can opt out of all surveys from their org without
// affecting other features (dashboard contribution, etc.).
export const orgSurveyOptOutsTable = pgTable("org_survey_opt_outs", {
  orgId: text("org_id").notNull().references(() => organisationsTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  pk: unique("org_survey_opt_outs_pk").on(t.orgId, t.userId),
}));

export const recordVerificationsTable = pgTable("record_verifications", {
  id: serial("id").primaryKey(),
  recordId: integer("record_id").notNull().references(() => impactRecordsTable.id, { onDelete: "cascade" }),
  orgId: text("org_id").notNull().references(() => organisationsTable.id),
  status: text("status").notNull().default("pending"),
  verifiedBy: text("verified_by").references(() => usersTable.id),
  decidedAt: timestamp("decided_at"),
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  recordOrgUnique: unique("record_verifications_record_org_unique").on(table.recordId, table.orgId),
  orgStatusIdx: index("record_verifications_org_status_idx").on(table.orgId, table.status),
}));

export const orgAuditLogTable = pgTable("org_audit_log", {
  id: serial("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => organisationsTable.id),
  actorUserId: text("actor_user_id").notNull().references(() => usersTable.id),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  orgIdx: index("org_audit_log_org_idx").on(table.orgId, table.createdAt),
}));

export type Organisation = typeof organisationsTable.$inferSelect;
export type OrgMember = typeof orgMembersTable.$inferSelect;
export type OrgRegistration = typeof orgRegistrationsTable.$inferSelect;
export type OrgMatchRate = typeof orgMatchRatesTable.$inferSelect;
export type OrgShareLink = typeof orgShareLinksTable.$inferSelect;
export type OrgApiKey = typeof orgApiKeysTable.$inferSelect;
export type OrgWebhook = typeof orgWebhooksTable.$inferSelect;
export type WebhookDelivery = typeof webhookDeliveriesTable.$inferSelect;
export type OrgSubscription = typeof orgSubscriptionsTable.$inferSelect;
export type OrgSsoConfig = typeof orgSsoConfigsTable.$inferSelect;
export type OrgSurvey = typeof orgSurveysTable.$inferSelect;
export type OrgSurveyResponse = typeof orgSurveyResponsesTable.$inferSelect;
export type OrgSurveyOptOut = typeof orgSurveyOptOutsTable.$inferSelect;
export type RecordVerification = typeof recordVerificationsTable.$inferSelect;
export type OrgAuditLog = typeof orgAuditLogTable.$inferSelect;
