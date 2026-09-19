import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const state = vi.hoisted(() => ({
  authUser: null as { id: string; email: string } | null,
}));

vi.mock("@workspace/db", () => {
  const tableTag = (name: string) => ({ __tableName: name });

  return {
    db: {
      query: {
        orgMembersTable: { findFirst: vi.fn() },
        organisationsTable: { findFirst: vi.fn() },
        orgSubscriptionsTable: { findFirst: vi.fn() },
      },
    },
    organisationsTable: tableTag("organisations"),
    orgMembersTable: tableTag("org_members"),
    orgSubscriptionsTable: tableTag("org_subscriptions"),
  };
});

vi.mock("../src/middleware/authenticate.js", () => ({
  authenticate: (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!state.authUser) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    (req as express.Request & { user?: { id: string; email: string } }).user = state.authUser;
    next();
  },
}));

vi.mock("../src/lib/stripeClient.js", () => ({
  getStripeClient: () => null,
  isStripeConfigured: () => false,
  isPricingPagePublic: () => false,
  getWebhookSecret: () => null,
}));

const { default: billingRouter } = await import("../src/routes/billing.js");

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/billing", billingRouter);
  return app;
}

beforeEach(() => {
  state.authUser = null;
});

describe("billing catalogue visibility", () => {
  it("returns public tier capabilities without commercial prices or Stripe price IDs", async () => {
    const res = await request(makeApp()).get("/api/billing/tiers");

    expect(res.status).toBe(200);
    expect(res.body.tiers).toHaveLength(4);
    expect(res.body).toMatchObject({
      pricingPublic: false,
      stripeConfigured: false,
    });

    for (const tier of res.body.tiers) {
      expect(tier).toEqual(
        expect.objectContaining({
          key: expect.any(String),
          name: expect.any(String),
          tagline: expect.any(String),
          highlights: expect.any(Array),
          features: expect.any(Object),
          checkoutAvailable: false,
        }),
      );
      expect(tier).not.toHaveProperty("monthlyPriceGbp");
      expect(tier).not.toHaveProperty("stripePriceId");
    }
  });

  it("keeps organisation subscription state behind authentication", async () => {
    const res = await request(makeApp()).get("/api/billing/subscription");

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Not authenticated" });
  });
});