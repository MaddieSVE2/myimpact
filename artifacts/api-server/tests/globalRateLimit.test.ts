import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { INTERNAL_SSR_HEADER } from "../src/lib/internalSsrRequest.js";

const originalSecret = process.env.SESSION_SECRET;
const testSecret = "global-rate-limit-ssr-secret";

beforeAll(() => {
  process.env.SESSION_SECRET = testSecret;
});

afterAll(() => {
  if (originalSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = originalSecret;
});

describe("global API rate limit", () => {
  it("allows more than 200 authenticated internal SSR requests", async () => {
    for (let requestNumber = 0; requestNumber < 205; requestNumber += 1) {
      const response = await request(app)
        .get("/api/__ssr-rate-limit-test__")
        .set(INTERNAL_SSR_HEADER, testSecret);
      expect(response.status).toBe(404);
    }
  });

  it("continues to limit unauthenticated requests", async () => {
    for (let requestNumber = 0; requestNumber < 200; requestNumber += 1) {
      const response = await request(app).get("/api/__public-rate-limit-test__");
      expect(response.status).toBe(404);
    }

    const limited = await request(app).get("/api/__public-rate-limit-test__");
    expect(limited.status).toBe(429);
  });
});