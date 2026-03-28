import { Router, type IRouter } from "express";
import { db, organisationsTable, orgMembersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { authenticate, type AuthenticatedRequest } from "../middleware/authenticate.js";
import { getUncachableResendClient } from "../lib/resend.js";

const router: IRouter = Router();

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
}

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
      subject: `New organisation registration: ${escHtml(orgName)}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;background:#f9f9f9;border-radius:8px;">
          <h2 style="color:#213547;margin-top:0;">New Organisation Registration Request</h2>
          <table style="width:100%;border-collapse:collapse;margin-top:16px;background:white;border-radius:8px;overflow:hidden;">
            <tr style="background:#f7f5ef;"><td style="padding:12px 16px;color:#555;width:160px;font-size:13px;"><strong>Organisation</strong></td><td style="padding:12px 16px;color:#213547;font-size:14px;">${escHtml(orgName)}</td></tr>
            <tr><td style="padding:12px 16px;color:#555;font-size:13px;"><strong>Type</strong></td><td style="padding:12px 16px;color:#213547;font-size:14px;">${escHtml(type)}</td></tr>
            <tr style="background:#f7f5ef;"><td style="padding:12px 16px;color:#555;font-size:13px;"><strong>Contact name</strong></td><td style="padding:12px 16px;color:#213547;font-size:14px;">${escHtml(contactName)}</td></tr>
            <tr><td style="padding:12px 16px;color:#555;font-size:13px;"><strong>Contact email</strong></td><td style="padding:12px 16px;font-size:14px;"><a href="mailto:${escHtml(contactEmail)}" style="color:#E8633A;">${escHtml(contactEmail)}</a></td></tr>
            <tr style="background:#f7f5ef;"><td style="padding:12px 16px;color:#555;font-size:13px;"><strong>Approx size</strong></td><td style="padding:12px 16px;color:#213547;font-size:14px;">${escHtml(size || "Not specified")}</td></tr>
            <tr><td style="padding:12px 16px;color:#555;font-size:13px;vertical-align:top;"><strong>Purpose</strong></td><td style="padding:12px 16px;color:#213547;font-size:14px;line-height:1.5;">${escHtml(purpose || "Not provided")}</td></tr>
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

    // Send confirmation email to the registrant
    const { error: confirmError } = await client.emails.send({
      from: fromEmail,
      to: contactEmail,
      subject: `We've received your registration request — My Impact`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;background:#f9f9f9;border-radius:8px;">
          <h2 style="color:#213547;margin-top:0;">Thanks for registering, ${escHtml(contactName)}!</h2>
          <p style="color:#444;line-height:1.6;margin-top:0;">We've received your registration request for <strong>${escHtml(orgName)}</strong> and our team will review it shortly.</p>
          <div style="background:white;border-radius:8px;padding:20px 24px;margin:24px 0;">
            <h3 style="color:#213547;margin-top:0;font-size:15px;">Your submission details</h3>
            <table style="width:100%;border-collapse:collapse;">
              <tr style="background:#f7f5ef;"><td style="padding:10px 14px;color:#555;width:140px;font-size:13px;border-radius:4px 0 0 4px;"><strong>Organisation</strong></td><td style="padding:10px 14px;color:#213547;font-size:14px;">${escHtml(orgName)}</td></tr>
              <tr><td style="padding:10px 14px;color:#555;font-size:13px;"><strong>Type</strong></td><td style="padding:10px 14px;color:#213547;font-size:14px;">${escHtml(type)}</td></tr>
              <tr style="background:#f7f5ef;"><td style="padding:10px 14px;color:#555;font-size:13px;"><strong>Contact name</strong></td><td style="padding:10px 14px;color:#213547;font-size:14px;">${escHtml(contactName)}</td></tr>
              <tr><td style="padding:10px 14px;color:#555;font-size:13px;"><strong>Contact email</strong></td><td style="padding:10px 14px;color:#213547;font-size:14px;">${escHtml(contactEmail)}</td></tr>
              ${size ? `<tr style="background:#f7f5ef;"><td style="padding:10px 14px;color:#555;font-size:13px;"><strong>Approx size</strong></td><td style="padding:10px 14px;color:#213547;font-size:14px;">${escHtml(size)}</td></tr>` : ""}
              ${purpose ? `<tr><td style="padding:10px 14px;color:#555;font-size:13px;vertical-align:top;"><strong>Purpose</strong></td><td style="padding:10px 14px;color:#213547;font-size:14px;line-height:1.5;">${escHtml(purpose)}</td></tr>` : ""}
            </table>
          </div>
          <h3 style="color:#213547;font-size:15px;margin-bottom:8px;">What happens next?</h3>
          <ul style="color:#444;line-height:1.8;padding-left:20px;margin-top:0;">
            <li>Our team will review your request within <strong>2 working days</strong>.</li>
            <li>Once approved, we'll send you an <strong>invite code</strong> so your organisation can get started on My Impact.</li>
            <li>If we need any additional information, we'll reach out to you at this email address.</li>
          </ul>
          <p style="color:#444;line-height:1.6;">If you have any questions in the meantime, feel free to reply to this email.</p>
          <p style="color:#aaa;font-size:11px;margin-top:32px;border-top:1px solid #eee;padding-top:16px;">My Impact · <a href="https://myimpact.replit.app" style="color:#aaa;">myimpact.replit.app</a></p>
        </div>
      `,
    });
    if (confirmError) {
      console.error("Resend error sending org registration confirmation to registrant:", confirmError);
      // Don't fail the request — the admin notification was sent successfully
    }
  } catch (err) {
    console.error("Org registration email error:", err);
    res.status(500).json({ error: "Failed to send registration. Please try again." });
    return;
  }

  res.json({ ok: true });
});

router.post("/validate-invite", authenticate, async (req: AuthenticatedRequest, res) => {
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

  const otherMembership = await db.query.orgMembersTable.findFirst({
    where: eq(orgMembersTable.userId, userId),
  });
  if (otherMembership) {
    res.status(409).json({ error: "You're already a member of an organisation." });
    return;
  }

  res.json({ ok: true, orgName: org.name, orgId: org.id });
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
