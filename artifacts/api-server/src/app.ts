import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import router from "./routes";

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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use("/api", router);

export default app;
