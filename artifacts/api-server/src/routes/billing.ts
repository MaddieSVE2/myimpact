import { Router, type IRouter, type Request, type Response } from "express";
import express from "express";
import { db, organisationsTable, orgMembersTable, orgSubscriptionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { authenticate, type AuthenticatedRequest } from "../middleware/authenticate.js";
import {
  getStripeClient,
  isStripeConfigured,
  isPricingPagePublic,
  getWebhookSecret,
} from "../lib/stripeClient.js";
import {
  TIERS,
  isValidTier,
  resolveEffectiveTier,
  getFeatureSnapshot,
  type TierKey,
} from "../lib/featureFlags.js";
import { createRateLimiter } from "../lib/rateLimiter.js";

const router: IRouter = Router();

// ── Public tier catalogue ───────────────────────────────────────────────────
// Used by the marketing /pricing page. Flag visibility is the client's
// responsibility — we still expose the catalogue so previews work in dev.
router.get("/tiers", (_req: Request, res: Response) => {
  const tiers = (Object.keys(TIERS) as TierKey[]).map((key) => {
    const t = TIERS[key];
    return {
      key: t.key,
      name: t.name,
      tagline: t.tagline,
      monthlyPriceGbp: t.monthlyPriceGbp,
      highlights: t.highlights,
      features: t.features,
      // Don't leak the actual price ID, just whether checkout is wired up.
      checkoutAvailable: !!t.stripePriceId && isStripeConfigured(),
    };
  });
  res.json({
    tiers,
    pricingPublic: isPricingPagePublic(),
    stripeConfigured: isStripeConfigured(),
  });
});

// ── Per-org subscription state ──────────────────────────────────────────────
// Manager-only. Returns the resolved tier + feature snapshot so the org
// portal can render badges / "upgrade" CTAs.
async function getManagerOrg(req: AuthenticatedRequest) {
  const userId = req.user!.id;
  const membership = await db.query.orgMembersTable.findFirst({
    where: eq(orgMembersTable.userId, userId),
  });
  if (!membership) return { error: { status: 404, message: "You are not a member of any organisation." } as const };
  if (membership.role !== "manager") {
    return { error: { status: 403, message: "Only organisation managers can manage billing." } as const };
  }
  const org = await db.query.organisationsTable.findFirst({
    where: eq(organisationsTable.id, membership.orgId),
  });
  if (!org) return { error: { status: 404, message: "Organisation not found." } as const };
  return { membership, org };
}

router.get("/subscription", authenticate, async (req: AuthenticatedRequest, res) => {
  const result = await getManagerOrg(req);
  if ("error" in result) {
    res.status(result.error.status).json({ error: result.error.message });
    return;
  }
  const snapshot = await getFeatureSnapshot(result.org.id);
  res.json({
    orgId: result.org.id,
    orgName: result.org.name,
    ...snapshot,
  });
});

// ── Checkout ────────────────────────────────────────────────────────────────
// Creates a Stripe Checkout session for the given tier. Reuses any existing
// stripe_customer_id so subscriptions stay attached to the same customer
// across upgrades/downgrades.
const checkoutRateLimit = createRateLimiter({
  windowMs: 60 * 1000,
  max: 10,
  message: "Too many checkout attempts. Please wait a moment.",
});

router.post("/checkout", authenticate, checkoutRateLimit, async (req: AuthenticatedRequest, res) => {
  const stripe = getStripeClient();
  if (!stripe) {
    res.status(503).json({ error: "Billing is not yet enabled. Please contact support." });
    return;
  }

  const result = await getManagerOrg(req);
  if ("error" in result) {
    res.status(result.error.status).json({ error: result.error.message });
    return;
  }

  const tierInput = typeof req.body?.tier === "string" ? req.body.tier : "";
  if (!isValidTier(tierInput) || tierInput === "free" || tierInput === "enterprise") {
    res.status(400).json({ error: "Invalid tier. Choose Team or Organisation." });
    return;
  }
  const tierDef = TIERS[tierInput];
  if (!tierDef.stripePriceId) {
    res.status(503).json({ error: `${tierDef.name} checkout is not configured yet.` });
    return;
  }

  // Find or create the customer.
  let existing = await db.query.orgSubscriptionsTable.findFirst({
    where: eq(orgSubscriptionsTable.orgId, result.org.id),
  });

  let customerId = existing?.stripeCustomerId ?? null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: req.user!.email,
      name: result.org.name,
      metadata: { orgId: result.org.id },
    });
    customerId = customer.id;
    if (existing) {
      await db.update(orgSubscriptionsTable)
        .set({ stripeCustomerId: customerId, updatedAt: new Date() })
        .where(eq(orgSubscriptionsTable.orgId, result.org.id));
    } else {
      await db.insert(orgSubscriptionsTable).values({
        orgId: result.org.id,
        stripeCustomerId: customerId,
        tier: "free",
        status: "active",
      });
      existing = await db.query.orgSubscriptionsTable.findFirst({
        where: eq(orgSubscriptionsTable.orgId, result.org.id),
      });
    }
  }

  const appUrl = process.env.APP_URL ?? (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "");
  const successUrl = `${appUrl}/org?billing=success`;
  const cancelUrl = `${appUrl}/pricing?billing=cancelled`;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: tierDef.stripePriceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: result.org.id,
      subscription_data: {
        metadata: { orgId: result.org.id, tier: tierInput },
      },
      metadata: { orgId: result.org.id, tier: tierInput },
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error("Stripe checkout error:", err);
    res.status(500).json({ error: "Could not start checkout. Please try again." });
  }
});

// ── Billing portal ──────────────────────────────────────────────────────────
// Stripe-hosted page for managing subscription / payment method / cancel.
router.post("/portal", authenticate, async (req: AuthenticatedRequest, res) => {
  const stripe = getStripeClient();
  if (!stripe) {
    res.status(503).json({ error: "Billing is not yet enabled." });
    return;
  }

  const result = await getManagerOrg(req);
  if ("error" in result) {
    res.status(result.error.status).json({ error: result.error.message });
    return;
  }

  const sub = await db.query.orgSubscriptionsTable.findFirst({
    where: eq(orgSubscriptionsTable.orgId, result.org.id),
  });
  if (!sub?.stripeCustomerId) {
    res.status(400).json({ error: "No billing account on file. Subscribe to a paid plan first." });
    return;
  }

  const appUrl = process.env.APP_URL ?? (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "");
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: `${appUrl}/org`,
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error("Stripe portal error:", err);
    res.status(500).json({ error: "Could not open billing portal. Please try again." });
  }
});

// ── Admin override (manual tier flip for design partners) ───────────────────
// Requires the user to be in the ADMIN_EMAILS allowlist (same pattern as
// /api/admin). Sets `override` on the org's subscription row.
function isAdmin(email: string): boolean {
  const list = (process.env.ADMIN_EMAILS ?? "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  return list.includes(email.toLowerCase());
}

router.post("/admin/override", authenticate, async (req: AuthenticatedRequest, res) => {
  if (!isAdmin(req.user!.email)) {
    res.status(403).json({ error: "Admin only." });
    return;
  }
  const orgId = typeof req.body?.orgId === "string" ? req.body.orgId : "";
  const override = req.body?.override;
  if (!orgId) {
    res.status(400).json({ error: "orgId required." });
    return;
  }
  if (override !== null && (typeof override !== "string" || !isValidTier(override))) {
    res.status(400).json({ error: "Invalid override (must be a valid tier or null)." });
    return;
  }
  const org = await db.query.organisationsTable.findFirst({ where: eq(organisationsTable.id, orgId) });
  if (!org) {
    res.status(404).json({ error: "Organisation not found." });
    return;
  }

  const existing = await db.query.orgSubscriptionsTable.findFirst({
    where: eq(orgSubscriptionsTable.orgId, orgId),
  });
  if (existing) {
    await db.update(orgSubscriptionsTable)
      .set({ override, updatedAt: new Date() })
      .where(eq(orgSubscriptionsTable.orgId, orgId));
  } else {
    await db.insert(orgSubscriptionsTable).values({
      orgId,
      tier: "free",
      status: "active",
      override,
    });
  }

  const effective = await resolveEffectiveTier(orgId);
  res.json({ ok: true, effective });
});

// ── Webhook handler (registered separately with raw body parser) ────────────
// Reconciles local org_subscriptions with Stripe events.
async function reconcileFromSubscription(stripe: Stripe, sub: Stripe.Subscription): Promise<void> {
  // Resolve orgId either via metadata or by looking up the customer.
  let orgId = sub.metadata?.orgId ?? null;
  if (!orgId && typeof sub.customer === "string") {
    const customer = await stripe.customers.retrieve(sub.customer);
    if (!("deleted" in customer) || !customer.deleted) {
      orgId = (customer as Stripe.Customer).metadata?.orgId ?? null;
    }
  }
  if (!orgId) {
    console.warn("[stripe] subscription event with no orgId; skipping", sub.id);
    return;
  }

  // Map back to our tier key from the price ID.
  const priceId = sub.items.data[0]?.price.id;
  let tier: TierKey = "free";
  for (const t of Object.values(TIERS)) {
    if (t.stripePriceId && t.stripePriceId === priceId) {
      tier = t.key;
      break;
    }
  }

  // Stripe's TS types currently omit `current_period_end` on Subscription
  // even though the API returns it; access via Record<string, unknown>.
  const cpeRaw = (sub as unknown as Record<string, unknown>).current_period_end;
  const cpeNum = typeof cpeRaw === "number" ? cpeRaw : null;

  const values = {
    orgId,
    stripeCustomerId: typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null,
    stripeSubscriptionId: sub.id,
    tier,
    status: sub.status,
    currentPeriodEnd: cpeNum ? new Date(cpeNum * 1000) : null,
    cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
    updatedAt: new Date(),
  };

  const existing = await db.query.orgSubscriptionsTable.findFirst({
    where: eq(orgSubscriptionsTable.orgId, orgId),
  });
  if (existing) {
    await db.update(orgSubscriptionsTable).set(values).where(eq(orgSubscriptionsTable.orgId, orgId));
  } else {
    await db.insert(orgSubscriptionsTable).values(values);
  }
}

export const billingWebhookHandler = async (req: Request, res: Response): Promise<void> => {
  const stripe = getStripeClient();
  const secret = getWebhookSecret();
  if (!stripe || !secret) {
    res.status(503).json({ error: "Webhook not configured" });
    return;
  }

  const sig = req.headers["stripe-signature"];
  if (!sig || Array.isArray(sig)) {
    res.status(400).json({ error: "Missing signature" });
    return;
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body as Buffer, sig, secret);
  } catch (err) {
    console.error("[stripe] webhook signature failed:", err);
    res.status(400).json({ error: "Invalid signature" });
    return;
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.subscription && typeof session.subscription === "string") {
          const sub = await stripe.subscriptions.retrieve(session.subscription);
          await reconcileFromSubscription(stripe, sub);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await reconcileFromSubscription(stripe, sub);
        break;
      }
      case "invoice.payment_failed": {
        // Surface payment_failed status so the portal can show a "fix card" CTA.
        const invoice = event.data.object as Stripe.Invoice;
        const subId = (invoice as unknown as Record<string, unknown>).subscription;
        if (typeof subId === "string") {
          const sub = await stripe.subscriptions.retrieve(subId);
          await reconcileFromSubscription(stripe, sub);
        }
        break;
      }
      default:
        // Other events are ignored on purpose.
        break;
    }
    res.json({ received: true });
  } catch (err) {
    console.error("[stripe] webhook handler error:", err);
    // Still 200 — Stripe will retry transient failures, but persistent errors
    // (e.g. malformed events) shouldn't loop forever.
    res.status(200).json({ received: true, error: "handler error" });
  }
};

// Convenience export so app.ts can wire the raw-body route.
export const billingWebhookRawParser = express.raw({ type: "application/json" });

export default router;
