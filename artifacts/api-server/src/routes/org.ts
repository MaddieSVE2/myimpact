import { Router, type IRouter } from "express";
import { db, organisationsTable, orgMembersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { authenticate, type AuthenticatedRequest } from "../middleware/authenticate.js";
import { getUncachableResendClient } from "../lib/resend.js";

const router: IRouter = Router();

router.post("/register", async (req, res) => {
  const { orgName, type, contactName, contactEmail, size, purpose } = req.body;
  if (!orgName || !type || !contactName || !contactEmail) {
    res.status(400).json({ error: "Required fields missing" });
    return;
  }

  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const { error: sendError } = await client.emails.send({
      from: fromEmail,
      to: "maddie@socialvalueengine.com",
      replyTo: contactEmail,
      subject: `New organisation registration: ${orgName}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;background:#f9f9f9;border-radius:8px;">
          <h2 style="color:#213547;margin-top:0;">New Organisation Registration Request</h2>
          <table style="width:100%;border-collapse:collapse;margin-top:16px;background:white;border-radius:8px;overflow:hidden;">
            <tr style="background:#f7f5ef;"><td style="padding:12px 16px;color:#555;width:160px;font-size:13px;"><strong>Organisation</strong></td><td style="padding:12px 16px;color:#213547;font-size:14px;">${orgName}</td></tr>
            <tr><td style="padding:12px 16px;color:#555;font-size:13px;"><strong>Type</strong></td><td style="padding:12px 16px;color:#213547;font-size:14px;">${type}</td></tr>
            <tr style="background:#f7f5ef;"><td style="padding:12px 16px;color:#555;font-size:13px;"><strong>Contact name</strong></td><td style="padding:12px 16px;color:#213547;font-size:14px;">${contactName}</td></tr>
            <tr><td style="padding:12px 16px;color:#555;font-size:13px;"><strong>Contact email</strong></td><td style="padding:12px 16px;font-size:14px;"><a href="mailto:${contactEmail}" style="color:#E8633A;">${contactEmail}</a></td></tr>
            <tr style="background:#f7f5ef;"><td style="padding:12px 16px;color:#555;font-size:13px;"><strong>Approx size</strong></td><td style="padding:12px 16px;color:#213547;font-size:14px;">${size || "Not specified"}</td></tr>
            <tr><td style="padding:12px 16px;color:#555;font-size:13px;vertical-align:top;"><strong>Purpose</strong></td><td style="padding:12px 16px;color:#213547;font-size:14px;line-height:1.5;">${purpose || "Not provided"}</td></tr>
          </table>
          <p style="color:#aaa;font-size:11px;margin-top:24px;">Sent from My Impact · myimpact.replit.com</p>
        </div>
      `,
    });
    if (sendError) {
      console.error("Resend error sending org registration:", sendError);
      res.status(500).json({ error: "Failed to send registration. Please try again." });
      return;
    }
  } catch (err) {
    console.error("Org registration email error:", err);
    res.status(500).json({ error: "Failed to send registration. Please try again." });
    return;
  }

  res.json({ ok: true });
});

router.post("/join", authenticate, async (req: AuthenticatedRequest, res) => {
  const { inviteCode } = req.body;
  if (!inviteCode || typeof inviteCode !== "string") {
    res.status(400).json({ error: "Invite code is required" });
    return;
  }

  const org = await db.query.organisationsTable.findFirst({
    where: eq(organisationsTable.inviteCode, inviteCode.trim().toUpperCase()),
  });

  if (!org) {
    res.status(404).json({ error: "Invalid invite code. Please check with your organisation and try again." });
    return;
  }

  const userId = req.user!.id;

  const existing = await db.query.orgMembersTable.findFirst({
    where: (t, { and }) => and(eq(t.orgId, org.id), eq(t.userId, userId)),
  });

  if (existing) {
    res.json({ ok: true, orgName: org.name, alreadyMember: true });
    return;
  }

  const otherMembership = await db.query.orgMembersTable.findFirst({
    where: eq(orgMembersTable.userId, userId),
  });
  if (otherMembership) {
    res.status(409).json({ error: "You're already a member of an organisation." });
    return;
  }

  await db.insert(orgMembersTable).values({ orgId: org.id, userId });

  res.json({ ok: true, orgName: org.name, alreadyMember: false });
});

router.get("/my", authenticate, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;

  const membership = await db.query.orgMembersTable.findFirst({
    where: eq(orgMembersTable.userId, userId),
  });

  if (!membership) {
    res.json({ org: null });
    return;
  }

  const org = await db.query.organisationsTable.findFirst({
    where: eq(organisationsTable.id, membership.orgId),
  });

  if (!org) {
    res.json({ org: null });
    return;
  }

  res.json({ org: { id: org.id, name: org.name, type: org.type } });
});

export default router;
