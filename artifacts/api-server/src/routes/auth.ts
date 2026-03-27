import { Router, type IRouter } from "express";
import { db, usersTable, magicTokensTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";
import jwt from "jsonwebtoken";
import { getUncachableResendClient } from "../lib/resend.js";

const router: IRouter = Router();

function getAppUrl(req: any): string {
  const proto = req.headers["x-forwarded-proto"] || req.protocol;
  const host = req.headers["x-forwarded-host"] || req.get("host");
  return `${proto}://${host}`;
}

function issueSession(res: any, user: { id: string; email: string }) {
  const secret = process.env.SESSION_SECRET!;
  const token = jwt.sign({ id: user.id, email: user.email }, secret, { expiresIn: "30d" });
  res.cookie("mi_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

router.post("/request", async (req, res) => {
  const { email } = req.body;
  if (!email || typeof email !== "string" || !email.includes("@")) {
    res.status(400).json({ error: "A valid email address is required" });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();

  let user = await db.query.usersTable.findFirst({
    where: eq(usersTable.email, normalizedEmail),
  });

  if (!user) {
    const [created] = await db
      .insert(usersTable)
      .values({ id: randomBytes(12).toString("hex"), email: normalizedEmail })
      .returning();
    user = created;
  }

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  await db.insert(magicTokensTable).values({
    token,
    userId: user.id,
    expiresAt,
    confirmed: false,
  });

  const appUrl = getAppUrl(req);
  const confirmUrl = `${appUrl}/auth/confirm?token=${token}`;

  try {
    const { client, fromEmail } = await getUncachableResendClient();
    await client.emails.send({
      from: fromEmail,
      to: normalizedEmail,
      subject: "Your My Impact sign-in link",
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;">
          <img src="${appUrl}/images/myimpact.png" alt="My Impact" style="height:48px;margin-bottom:24px;" />
          <h2 style="margin:0 0 8px;color:#213547;font-size:22px;">Sign in to My Impact</h2>
          <p style="color:#555;margin:0 0 24px;line-height:1.6;">
            Click the button below to sign in. This link expires in 15 minutes and can only be used once.
          </p>
          <a href="${confirmUrl}" style="display:inline-block;background:#F06127;color:white;font-weight:700;padding:14px 28px;border-radius:8px;text-decoration:none;font-size:15px;">
            Sign in to My Impact
          </a>
          <p style="color:#aaa;margin:24px 0 0;font-size:12px;">
            If you didn't request this, you can safely ignore this email.
          </p>
        </div>
      `,
    });
  } catch (err) {
    console.error("Failed to send magic link email:", err);
    res.status(500).json({ error: "Failed to send email. Please try again." });
    return;
  }

  res.json({ ok: true });
});

router.get("/verify", async (req, res) => {
  const { token } = req.query;
  if (!token || typeof token !== "string") {
    res.status(400).json({ error: "Token is required" });
    return;
  }

  const record = await db.query.magicTokensTable.findFirst({
    where: eq(magicTokensTable.token, token),
  });

  if (!record) {
    res.status(400).json({ error: "Invalid token" });
    return;
  }
  if (record.confirmed) {
    res.status(400).json({ error: "This link has already been used" });
    return;
  }
  if (new Date() > record.expiresAt) {
    res.status(400).json({ error: "This link has expired. Please request a new one." });
    return;
  }

  res.json({ ok: true, email: (await db.query.usersTable.findFirst({ where: eq(usersTable.id, record.userId) }))?.email });
});

router.post("/confirm", async (req, res) => {
  const { token } = req.body;
  if (!token || typeof token !== "string") {
    res.status(400).json({ error: "Token is required" });
    return;
  }

  const record = await db.query.magicTokensTable.findFirst({
    where: eq(magicTokensTable.token, token),
  });

  if (!record) {
    res.status(400).json({ error: "Invalid token" });
    return;
  }
  if (record.confirmed) {
    res.status(400).json({ error: "This link has already been used" });
    return;
  }
  if (new Date() > record.expiresAt) {
    res.status(400).json({ error: "This link has expired. Please request a new one." });
    return;
  }

  await db
    .update(magicTokensTable)
    .set({ confirmed: true, usedAt: new Date() })
    .where(eq(magicTokensTable.token, token));

  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, record.userId),
  });

  if (!user) {
    res.status(500).json({ error: "User not found" });
    return;
  }

  await db
    .update(magicTokensTable)
    .set({ confirmed: true, usedAt: new Date() })
    .where(eq(magicTokensTable.token, token));

  issueSession(res, user);
  res.json({ ok: true, user: { id: user.id, email: user.email } });
});

router.get("/me", async (req: any, res) => {
  const token = req.cookies?.mi_session;
  if (!token) {
    res.json({ user: null });
    return;
  }

  try {
    const secret = process.env.SESSION_SECRET!;
    const payload = jwt.verify(token, secret) as { id: string; email: string };
    res.json({ user: { id: payload.id, email: payload.email } });
  } catch {
    res.json({ user: null });
  }
});

router.post("/logout", (_req, res) => {
  res.clearCookie("mi_session", { path: "/" });
  res.json({ ok: true });
});

export default router;
