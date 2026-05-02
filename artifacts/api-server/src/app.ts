import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import router from "./routes";
import { createRateLimiter } from "./lib/rateLimiter.js";
import { billingWebhookHandler, billingWebhookRawParser } from "./routes/billing.js";

const app: Express = express();

// Trust the first proxy hop so req.ip reflects the real client IP
// (used by rate limiters — prevents x-forwarded-for spoofing)
app.set("trust proxy", 1);

const explicitOrigins = (process.env.ALLOWED_ORIGINS ?? process.env.APP_URL ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const replitOrigin = process.env.REPLIT_DEV_DOMAIN
  ? `https://${process.env.REPLIT_DEV_DOMAIN}`
  : null;

const ALLOWED_ORIGINS = replitOrigin
  ? [...new Set([...explicitOrigins, replitOrigin])]
  : explicitOrigins;

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
  })
);
// Stripe webhook MUST be registered BEFORE express.json() so the raw body
// is preserved for signature verification.
app.post("/api/billing/webhook", billingWebhookRawParser, billingWebhookHandler);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Global per-IP rate limit: 200 requests per minute across all /api routes.
// This is a broad backstop; individual routes apply stricter limits.
const globalApiRateLimit = createRateLimiter({
  windowMs: 60 * 1000,
  max: 200,
  message: "Too many requests. Please slow down.",
});

app.use("/api", globalApiRateLimit, router);

export default app;
