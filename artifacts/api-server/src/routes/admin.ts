import { Router, type IRouter } from "express";
import { db, usersTable, pageViewsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { authenticate, type AuthenticatedRequest } from "../middleware/authenticate.js";

const router: IRouter = Router();

const ADMIN_EMAILS = [
  "maddie@socialvalueengine.com",
  "ivan.annibal@roseregeneration.co.uk",
];

function isAdmin(email: string): boolean {
  return ADMIN_EMAILS.includes(email.toLowerCase());
}

router.post("/track", authenticate, async (req: AuthenticatedRequest, res) => {
  const { page } = req.body;
  if (!page || typeof page !== "string") {
    res.status(400).json({ error: "page is required" });
    return;
  }

  await db.insert(pageViewsTable).values({
    userId: req.user!.id,
    page: page.trim().slice(0, 100),
  });

  res.json({ ok: true });
});

router.get("/users", authenticate, async (req: AuthenticatedRequest, res) => {
  if (!isAdmin(req.user!.email)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const users = await db.select().from(usersTable).orderBy(desc(usersTable.createdAt));

  const pageViews = await db.select().from(pageViewsTable).orderBy(desc(pageViewsTable.visitedAt));

  const viewsByUser: Record<string, string[]> = {};
  for (const view of pageViews) {
    if (!viewsByUser[view.userId]) {
      viewsByUser[view.userId] = [];
    }
    if (!viewsByUser[view.userId].includes(view.page)) {
      viewsByUser[view.userId].push(view.page);
    }
  }

  const result = users.map((user) => ({
    id: user.id,
    displayName: user.displayName ?? null,
    email: user.email,
    createdAt: user.createdAt,
    pagesVisited: viewsByUser[user.id] ?? [],
  }));

  res.json({ users: result });
});

export default router;
