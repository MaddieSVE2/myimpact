import { db, orgSubscriptionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// ── Tier catalogue ──────────────────────────────────────────────────────────
// The single source of truth for what each tier costs and which features it
// unlocks. The pricing page reads this for marketing copy; the gate helper
// below reads it to authorise feature access.

export type TierKey = "free" | "team" | "org" | "enterprise";

export type TierStatus = "active" | "trialing" | "past_due" | "canceled" | "unpaid";

export interface TierDefinition {
  key: TierKey;
  name: string;
  tagline: string;
  // Display price for the marketing page. `null` = "Contact us".
  monthlyPriceGbp: number | null;
  // Stripe price ID — pulled from env so prices can be created in the Stripe
  // dashboard later without code changes. Free + enterprise have no price.
  stripePriceId: string | null;
  // Marketing bullets shown on the pricing page.
  highlights: string[];
  // Hard caps / feature flags. The flag helper reads these. `null` = unlimited.
  features: {
    memberCap: number | null;
    shareLinkCap: number | null;
    matchProgramme: boolean;
    brandedReports: boolean;
    regionalAnalytics: boolean;
    webhookApi: boolean;
    sso: boolean;
    prioritySupport: boolean;
  };
}

export const TIERS: Record<TierKey, TierDefinition> = {
  free: {
    key: "free",
    name: "Free",
    tagline: "Get a feel for organisation impact reporting at no cost.",
    monthlyPriceGbp: 0,
    stripePriceId: null,
    highlights: [
      "Up to 25 members",
      "Anonymous aggregate dashboard",
      "1 funder share link",
      "Basic PDF report",
    ],
    features: {
      memberCap: 25,
      shareLinkCap: 1,
      matchProgramme: false,
      brandedReports: false,
      regionalAnalytics: false,
      webhookApi: false,
      sso: false,
      prioritySupport: false,
    },
  },
  team: {
    key: "team",
    name: "Team",
    tagline: "For small charities and community groups starting to report.",
    monthlyPriceGbp: 29,
    stripePriceId: process.env.STRIPE_PRICE_TEAM ?? null,
    highlights: [
      "Up to 100 members",
      "10 funder share links",
      "Match programme",
      "Regional analytics",
    ],
    features: {
      memberCap: 100,
      shareLinkCap: 10,
      matchProgramme: true,
      brandedReports: false,
      regionalAnalytics: true,
      webhookApi: false,
      sso: false,
      prioritySupport: false,
    },
  },
  org: {
    key: "org",
    name: "Organisation",
    tagline: "For schools, councils, and CSR teams measuring impact at scale.",
    monthlyPriceGbp: 199,
    stripePriceId: process.env.STRIPE_PRICE_ORG ?? null,
    highlights: [
      "Unlimited members",
      "Unlimited share links",
      "Branded PDF reports",
      "Webhook & REST API",
      "Priority support",
    ],
    features: {
      memberCap: null,
      shareLinkCap: null,
      matchProgramme: true,
      brandedReports: true,
      regionalAnalytics: true,
      webhookApi: true,
      sso: false,
      prioritySupport: true,
    },
  },
  enterprise: {
    key: "enterprise",
    name: "Enterprise",
    tagline: "Bespoke contracts for large enterprises, networks, and funders.",
    monthlyPriceGbp: null,
    stripePriceId: null,
    highlights: [
      "Everything in Organisation",
      "SSO (Google Workspace + Entra)",
      "Dedicated success manager",
      "Custom data residency & SLAs",
    ],
    features: {
      memberCap: null,
      shareLinkCap: null,
      matchProgramme: true,
      brandedReports: true,
      regionalAnalytics: true,
      webhookApi: true,
      sso: true,
      prioritySupport: true,
    },
  },
};

const TIER_RANK: Record<TierKey, number> = { free: 0, team: 1, org: 2, enterprise: 3 };

export function isValidTier(key: string): key is TierKey {
  return key === "free" || key === "team" || key === "org" || key === "enterprise";
}

export function tierAtLeast(actual: TierKey, required: TierKey): boolean {
  return TIER_RANK[actual] >= TIER_RANK[required];
}

// Statuses where the subscription should still grant access. Stripe also
// reports `incomplete` etc., but those should default to free until paid.
const ENTITLED_STATUSES = new Set<TierStatus>(["active", "trialing"]);

export function statusEntitlesAccess(status: string): boolean {
  return ENTITLED_STATUSES.has(status as TierStatus);
}

// ── Effective tier resolver ─────────────────────────────────────────────────

export interface EffectiveTier {
  tier: TierKey;
  status: TierStatus;
  source: "override" | "subscription" | "default";
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}

export async function resolveEffectiveTier(orgId: string): Promise<EffectiveTier> {
  const sub = await db.query.orgSubscriptionsTable.findFirst({
    where: eq(orgSubscriptionsTable.orgId, orgId),
  });

  if (sub?.override && isValidTier(sub.override)) {
    return {
      tier: sub.override,
      status: "active",
      source: "override",
      currentPeriodEnd: sub.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    };
  }

  if (sub && isValidTier(sub.tier) && statusEntitlesAccess(sub.status)) {
    return {
      tier: sub.tier,
      status: sub.status as TierStatus,
      source: "subscription",
      currentPeriodEnd: sub.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    };
  }

  return {
    tier: "free",
    status: (sub?.status as TierStatus) ?? "active",
    source: "default",
    currentPeriodEnd: sub?.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
  };
}

// ── Feature flag helper ─────────────────────────────────────────────────────
// Resolves (orgId, feature) → boolean | numeric cap. Designed as the single
// gate-checking primitive used by routes and the client. Existing free flows
// continue to work because the default tier is "free" and free's flags reflect
// today's behaviour (e.g. matchProgramme is currently shown to all free orgs;
// we intentionally leave it that way until go-live and only flip the flag
// then — see the comment on `featureEnabled`).

export type BooleanFeature =
  | "matchProgramme"
  | "brandedReports"
  | "regionalAnalytics"
  | "webhookApi"
  | "sso"
  | "prioritySupport";

export type NumericFeature = "memberCap" | "shareLinkCap";

export async function featureEnabled(orgId: string, feature: BooleanFeature): Promise<boolean> {
  // While the pricing page is hidden (PRICING_ENABLED !== "true"), we treat
  // every org as if they have everything — this is what keeps existing free
  // flows working before go-live. Once PRICING_ENABLED flips to "true", the
  // tier definitions become enforcing.
  if (process.env.PRICING_ENABLED !== "true") return true;

  const effective = await resolveEffectiveTier(orgId);
  return TIERS[effective.tier].features[feature] === true;
}

export async function featureCap(orgId: string, feature: NumericFeature): Promise<number | null> {
  if (process.env.PRICING_ENABLED !== "true") return null;
  const effective = await resolveEffectiveTier(orgId);
  return TIERS[effective.tier].features[feature];
}

export async function getFeatureSnapshot(orgId: string) {
  const effective = await resolveEffectiveTier(orgId);
  const def = TIERS[effective.tier];
  // Snapshot exposes the *raw* tier features regardless of PRICING_ENABLED so
  // the org portal can show "you're on the Free plan, 25 member cap" today.
  return {
    tier: effective.tier,
    tierName: def.name,
    status: effective.status,
    source: effective.source,
    currentPeriodEnd: effective.currentPeriodEnd ? effective.currentPeriodEnd.toISOString() : null,
    cancelAtPeriodEnd: effective.cancelAtPeriodEnd,
    features: def.features,
    enforcing: process.env.PRICING_ENABLED === "true",
  };
}
