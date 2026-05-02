import Stripe from "stripe";

// Lazy Stripe client. Returns null when Stripe is not configured so the
// rest of the app can degrade gracefully (pricing page hidden, billing
// routes return 503). Set STRIPE_SECRET_KEY (test mode) to enable.

let cached: Stripe | null = null;

export function getStripeClient(): Stripe | null {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  cached = new Stripe(key, { apiVersion: "2025-08-27.basil" as Stripe.LatestApiVersion });
  return cached;
}

export function requireStripeClient(): Stripe {
  const client = getStripeClient();
  if (!client) {
    throw new Error("Stripe is not configured (STRIPE_SECRET_KEY missing)");
  }
  return client;
}

export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

export function getWebhookSecret(): string | null {
  return process.env.STRIPE_WEBHOOK_SECRET ?? null;
}

// Public flag controlling whether the /pricing page is visible to end-users.
// We keep this independent from STRIPE_SECRET_KEY so the team can stage
// Stripe keys before flipping the marketing page live.
export function isPricingPagePublic(): boolean {
  return process.env.PRICING_ENABLED === "true";
}
