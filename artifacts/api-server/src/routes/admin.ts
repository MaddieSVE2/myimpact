import { Router, type IRouter } from "express";
import { db, usersTable, pageViewsTable, orgRegistrationsTable, organisationsTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { authenticate, type AuthenticatedRequest } from "../middleware/authenticate.js";
import { getUncachableResendClient } from "../lib/resend.js";
import { randomUUID } from "crypto";

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

router.get("/org-requests", authenticate, async (req: AuthenticatedRequest, res) => {
  if (!isAdmin(req.user!.email)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const requests = await db.select().from(orgRegistrationsTable).orderBy(desc(orgRegistrationsTable.createdAt));
  res.json({ requests });
});

function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function escHtmlAdmin(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
}

router.post("/org-requests/:id/approve", authenticate, async (req: AuthenticatedRequest, res) => {
  if (!isAdmin(req.user!.email)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { id } = req.params;

  const registration = await db.query.orgRegistrationsTable.findFirst({
    where: eq(orgRegistrationsTable.id, id),
  });

  if (!registration) {
    res.status(404).json({ error: "Registration not found" });
    return;
  }

  if (registration.status !== "pending") {
    res.status(400).json({ error: `Registration is already ${registration.status}` });
    return;
  }

  let inviteCode = generateInviteCode();
  const orgId = randomUUID();

  let committed = false;
  for (let attempt = 0; attempt < 5 && !committed; attempt++) {
    if (attempt > 0) inviteCode = generateInviteCode();
    try {
      await db.transaction(async (tx) => {
        await tx.insert(organisationsTable).values({
          id: orgId,
          name: registration.orgName,
          type: registration.type,
          inviteCode,
        });

        const updated = await tx.update(orgRegistrationsTable)
          .set({ status: "approved", inviteCode })
          .where(and(eq(orgRegistrationsTable.id, id), eq(orgRegistrationsTable.status, "pending")))
          .returning({ id: orgRegistrationsTable.id });

        if (updated.length === 0) {
          throw new Error("ALREADY_PROCESSED");
        }
      });
      committed = true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "ALREADY_PROCESSED") {
        res.status(400).json({ error: "Registration has already been processed" });
        return;
      }
      if (attempt < 4 && msg.includes("unique")) {
        continue;
      }
      throw err;
    }
  }

  if (!committed) {
    res.status(500).json({ error: "Failed to generate a unique invite code. Please try again." });
    return;
  }

  let emailWarning: string | undefined;
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    await client.emails.send({
      from: fromEmail,
      to: registration.contactEmail,
      subject: `Your organisation has been approved — My Impact`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;background:#f9f9f9;border-radius:8px;">
          <h2 style="color:#213547;margin-top:0;">Great news, ${escHtmlAdmin(registration.contactName)}!</h2>
          <p style="color:#444;line-height:1.6;margin-top:0;">Your registration for <strong>${escHtmlAdmin(registration.orgName)}</strong> has been approved. You can now invite members to join your organisation on My Impact using the invite code below.</p>
          <div style="background:white;border-radius:8px;padding:24px;margin:24px 0;text-align:center;border:2px solid #E8633A;">
            <p style="color:#555;font-size:13px;margin:0 0 8px;">Your organisation invite code</p>
            <p style="color:#E8633A;font-size:32px;font-weight:bold;letter-spacing:4px;margin:0;">${escHtmlAdmin(inviteCode)}</p>
          </div>
          <p style="color:#444;line-height:1.6;">Share this code with members of <strong>${escHtmlAdmin(registration.orgName)}</strong> so they can join your organisation when they sign up to My Impact.</p>
          <p style="color:#aaa;font-size:11px;margin-top:32px;border-top:1px solid #eee;padding-top:16px;">My Impact · <a href="https://myimpact.replit.app" style="color:#aaa;">myimpact.replit.app</a></p>
        </div>
      `,
    });
  } catch (emailErr) {
    console.error("Failed to send approval email:", emailErr);
    emailWarning = "Organisation approved but notification email could not be sent. Please contact the registrant manually.";
  }

  res.json({ ok: true, inviteCode, orgId, ...(emailWarning ? { warning: emailWarning } : {}) });
});

router.post("/org-requests/:id/reject", authenticate, async (req: AuthenticatedRequest, res) => {
  if (!isAdmin(req.user!.email)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { id } = req.params;

  const registration = await db.query.orgRegistrationsTable.findFirst({
    where: eq(orgRegistrationsTable.id, id),
  });

  if (!registration) {
    res.status(404).json({ error: "Registration not found" });
    return;
  }

  if (registration.status !== "pending") {
    res.status(400).json({ error: `Registration is already ${registration.status}` });
    return;
  }

  await db.update(orgRegistrationsTable)
    .set({ status: "rejected" })
    .where(eq(orgRegistrationsTable.id, id));

  res.json({ ok: true });
});

export default router;
