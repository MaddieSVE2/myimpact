import { Router, type IRouter } from "express";
import { getUncachableResendClient } from "../lib/resend.js";

const router: IRouter = Router();

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
}

router.post("/", async (req, res) => {
  const { name, email, message } = req.body;

  if (!name || typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "Name is required." });
    return;
  }
  if (!email || typeof email !== "string" || !email.trim()) {
    res.status(400).json({ error: "Email is required." });
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    res.status(400).json({ error: "Please enter a valid email address." });
    return;
  }
  if (!message || typeof message !== "string" || !message.trim()) {
    res.status(400).json({ error: "Message is required." });
    return;
  }

  const safeName = name.trim();
  const safeEmail = email.trim();
  const safeMessage = message.trim();

  try {
    const { client, fromEmail } = await getUncachableResendClient();

    const { error: notifyError } = await client.emails.send({
      from: fromEmail,
      to: "maddie@socialvalueengine.com",
      replyTo: safeEmail,
      subject: `New contact form message from ${escHtml(safeName)}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;background:#f9f9f9;border-radius:8px;">
          <h2 style="color:#213547;margin-top:0;">New Contact Message</h2>
          <table style="width:100%;border-collapse:collapse;margin-top:16px;background:white;border-radius:8px;overflow:hidden;">
            <tr style="background:#f7f5ef;"><td style="padding:12px 16px;color:#555;width:120px;font-size:13px;"><strong>Name</strong></td><td style="padding:12px 16px;color:#213547;font-size:14px;">${escHtml(safeName)}</td></tr>
            <tr><td style="padding:12px 16px;color:#555;font-size:13px;"><strong>Email</strong></td><td style="padding:12px 16px;font-size:14px;"><a href="mailto:${escHtml(safeEmail)}" style="color:#E8633A;">${escHtml(safeEmail)}</a></td></tr>
            <tr style="background:#f7f5ef;"><td style="padding:12px 16px;color:#555;font-size:13px;vertical-align:top;"><strong>Message</strong></td><td style="padding:12px 16px;color:#213547;font-size:14px;line-height:1.6;white-space:pre-wrap;">${escHtml(safeMessage)}</td></tr>
          </table>
          <p style="color:#aaa;font-size:11px;margin-top:24px;">Sent from My Impact contact form · myimpact.replit.app</p>
        </div>
      `,
    });

    if (notifyError) {
      console.error("Resend error sending contact notification:", notifyError);
      res.status(500).json({ error: "Failed to send your message. Please try again." });
      return;
    }

    const { error: confirmError } = await client.emails.send({
      from: fromEmail,
      to: safeEmail,
      subject: "We've received your message — My Impact",
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;background:#f9f9f9;border-radius:8px;">
          <h2 style="color:#213547;margin-top:0;">Thanks for getting in touch, ${escHtml(safeName)}!</h2>
          <p style="color:#444;line-height:1.6;margin-top:0;">We've received your message and will get back to you as soon as we can — usually within 1–2 working days.</p>
          <div style="background:white;border-radius:8px;padding:20px 24px;margin:24px 0;">
            <h3 style="color:#213547;margin-top:0;font-size:15px;">Your message</h3>
            <p style="color:#444;font-size:14px;line-height:1.6;white-space:pre-wrap;">${escHtml(safeMessage)}</p>
          </div>
          <p style="color:#444;line-height:1.6;">If your question is urgent, you can reply directly to this email.</p>
          <p style="color:#aaa;font-size:11px;margin-top:32px;border-top:1px solid #eee;padding-top:16px;">My Impact · <a href="https://myimpact.replit.app" style="color:#aaa;">myimpact.replit.app</a></p>
        </div>
      `,
    });

    if (confirmError) {
      console.error("Resend error sending contact confirmation:", confirmError);
    }
  } catch (err) {
    console.error("Contact form email error:", err);
    res.status(500).json({ error: "Failed to send your message. Please try again." });
    return;
  }

  res.json({ ok: true });
});

export default router;
