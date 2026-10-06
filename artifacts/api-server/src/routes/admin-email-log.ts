import { Router, type IRouter } from "express";
import { authenticate, type AuthenticatedRequest } from "../middleware/authenticate.js";
import { isAdminEmail } from "../lib/adminEmails.js";
import { listEmailLog, EMAIL_LOG_RETENTION_DAYS } from "../lib/emailLog.js";

/** Admin-only view of the email log (lib/emailLog.ts). Mounted at /admin. */
const router: IRouter = Router();

const PAGE_SIZE = 50;

router.get("/email-log", authenticate, async (req: AuthenticatedRequest, res) => {
  if (!isAdminEmail(req.user!.email)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const text = (key: string) => {
    const v = req.query[key];
    return typeof v === "string" && v.trim() ? v.trim().slice(0, 200) : undefined;
  };
  const before = Number(text("before"));
  const rows = await listEmailLog({
    category: text("category"),
    status: text("status"),
    search: text("search"),
    beforeId: Number.isInteger(before) && before > 0 ? before : undefined,
    limit: PAGE_SIZE + 1,
  });
  const hasMore = rows.length > PAGE_SIZE;
  const entries = rows.slice(0, PAGE_SIZE);
  res.json({
    entries,
    nextBefore: hasMore ? entries[entries.length - 1]!.id : null,
    retentionDays: EMAIL_LOG_RETENTION_DAYS,
  });
});

export default router;
