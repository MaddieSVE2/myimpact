-- Mirror of Stripe subscription state per organisation. Lets the app resolve
-- a tier (free | team | org | enterprise) and gated features without hitting
-- Stripe on every request. `override` lets staff pin a tier for design
-- partners regardless of the live Stripe state.
CREATE TABLE IF NOT EXISTS org_subscriptions (
  org_id text PRIMARY KEY REFERENCES organisations(id) ON DELETE CASCADE,
  stripe_customer_id text,
  stripe_subscription_id text,
  tier text NOT NULL DEFAULT 'free',
  status text NOT NULL DEFAULT 'active',
  current_period_end timestamp,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  override text,
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS org_subscriptions_customer_idx
  ON org_subscriptions (stripe_customer_id);
