import { Router, type IRouter } from "express";
import { db, feedbackTable } from "@workspace/db";
import { attachUserIfPresent, type AuthenticatedRequest } from "../middleware/authenticate.js";
import { getUncachableResendClient } from "../lib/resend.js";

const router: IRouter = Router();

const ADMIN_EMAIL = "maddie@socialvalueengine.com";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

router.post("/", attachUserIfPresent, async (req: AuthenticatedRequest, res) => {
  const body = req.body as Record<string, unknown>;

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    res.status(400).json({ error: "Message is required" });
    return;
  }

  const pageUrl = typeof body.pageUrl === "string" ? body.pageUrl.trim().slice(0, 500) : null;
  const category = typeof body.category === "string" ? body.category.trim().slice(0, 100) : null;
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 100) || null : null;
  const email = typeof body.email === "string" ? body.email.trim().slice(0, 200) || null : null;

  const userId = req.user?.id ?? null;

  const [saved] = await db
    .insert(feedbackTable)
    .values({
      userId,
      pageUrl,
      category,
      message: message.slice(0, 5000),
      name,
      email,
    })
    .returning();

  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const displayName = name || email || (req.user?.email) || "a user";
    const subject = pageUrl
      ? `New feedback from ${displayName} on ${pageUrl}`
      : `New feedback from ${displayName}`;

    await client.emails.send({
      from: fromEmail,
      to: ADMIN_EMAIL,
      subject,
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;">
          <h2 style="margin:0 0 16px;color:#213547;font-size:20px;">New feedback submission</h2>
          ${pageUrl ? `<p style="margin:0 0 8px;color:#555;font-size:14px;"><strong>Page:</strong> ${escapeHtml(pageUrl)}</p>` : ""}
          ${name ? `<p style="margin:0 0 8px;color:#555;font-size:14px;"><strong>Name:</strong> ${escapeHtml(name)}</p>` : ""}
          ${email ? `<p style="margin:0 0 8px;color:#555;font-size:14px;"><strong>Email:</strong> ${escapeHtml(email)}</p>` : ""}
          ${req.user?.email ? `<p style="margin:0 0 8px;color:#555;font-size:14px;"><strong>Account:</strong> ${escapeHtml(req.user.email)}</p>` : ""}
          ${userId ? `<p style="margin:0 0 8px;color:#555;font-size:14px;"><strong>User ID:</strong> ${escapeHtml(userId)}</p>` : ""}
          <div style="margin-top:16px;padding:16px;background:#f5f5f5;border-radius:8px;">
            <p style="margin:0;color:#213547;font-size:15px;white-space:pre-wrap;">${escapeHtml(message)}</p>
          </div>
          <p style="color:#aaa;margin:24px 0 0;font-size:12px;">Submitted at ${new Date(saved.createdAt).toISOString()}</p>
        </div>
      `,
    });
  } catch (err) {
    console.error("Failed to send feedback notification email:", err);
  }

  res.json({ ok: true });
});

export default router;
