import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import router from "./routes";

const app: Express = express();

// Trust the first proxy hop so req.ip reflects the real client IP
// (used by rate limiters — prevents x-forwarded-for spoofing)
app.set("trust proxy", 1);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use("/api", router);

export default app;
