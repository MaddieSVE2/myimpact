import express, { type Request, type Response } from "express";
import { createHmac, timingSafeEqual } from "crypto";
import { db, emailSuppressionsTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { applyEmailEvent } from "../lib/emailLog.js";
import { handleReceivedEmail, type ReceivedEmailEvent } from "../lib/emailReplies.js";
import { handleActivityEmail } from "../lib/emailActivityInbox.js";

// Resend signs webhooks with Svix. The signature is an HMAC-SHA256 over
// `${svix-id}.${svix-timestamp}.${rawBody}` keyed with the base64-decoded
// portion of the signing secret (after the "whsec_" prefix). We verify it
// manually here so the raw body (preserved by express.raw below) is used
// byte-for-byte — parsing and re-serialising JSON would break verification.
export const resendWebhookRawParser = express.raw({ type: "application/json" });

const TOLERANCE_SECONDS = 5 * 60;

function verifySvixSignature(
  secret: string,
  id: string,
  timestamp: string,
  signatureHeader: string,
  payload: Buffer,
): boolean {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - ts) > TOLERANCE_SECONDS) return false;

  const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
  const expected = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${payload.toString("utf8")}`)
    .digest("base64");
  const expectedBuf = Buffer.from(expected);

  // Header may contain multiple space-separated signatures like "v1,<base64>".
  for (const part of signatureHeader.split(" ")) {
    const [version, sig] = part.split(",", 2);
    if (version !== "v1" || !sig) continue;
    const sigBuf = Buffer.from(sig);
    if (sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf)) {
      return true;
    }
  }
  return false;
}

// Event types that mean "we could not (or must not) deliver to this address".
const SUPPRESSION_EVENTS: Record<string, string> = {
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.failed": "failed",
  "email.suppressed": "suppressed",
};

interface ResendWebhookPayload {
  type?: string;
  created_at?: string;
  data?: {
    email_id?: string;
    to?: string[] | string;
    bounce?: { message?: string; type?: string; subType?: string };
    failed?: { reason?: string };
    suppressed?: { message?: string; type?: string };
  };
}

function extractReason(type: string, data: ResendWebhookPayload["data"]): string | null {
  if (!data) return null;
  switch (type) {
    case "email.bounced": {
      const b = data.bounce;
      if (!b) return null;
      const label = [b.type, b.subType].filter(Boolean).join("/");
      return [label, b.message].filter(Boolean).join(": ") || null;
    }
    case "email.failed":
      return data.failed?.reason ?? null;
    case "email.suppressed": {
      const s = data.suppressed;
      if (!s) return null;
      return [s.type, s.message].filter(Boolean).join(": ") || null;
    }
    case "email.complained":
      return "Recipient marked the email as spam";
    default:
      return null;
  }
}

export async function resendWebhookHandler(req: Request, res: Response): Promise<void> {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[resend-webhook] RESEND_WEBHOOK_SECRET is not set — rejecting webhook");
    res.status(503).json({ error: "Webhook not configured" });
    return;
  }

  const id = req.header("svix-id");
  const timestamp = req.header("svix-timestamp");
  const signature = req.header("svix-signature");
  if (!id || !timestamp || !signature || !Buffer.isBuffer(req.body)) {
    res.status(400).json({ error: "Missing signature headers" });
    return;
  }

  if (!verifySvixSignature(secret, id, timestamp, signature, req.body)) {
    console.warn("[resend-webhook] signature verification failed");
    res.status(401).json({ error: "Invalid signature" });
    return;
  }

  let payload: ResendWebhookPayload;
  try {
    payload = JSON.parse(req.body.toString("utf8"));
  } catch {
    res.status(400).json({ error: "Invalid JSON payload" });
    return;
  }

  const eventType = payload.type ?? "";
  const eventAt = payload.created_at ? new Date(payload.created_at) : new Date();
  const eventDate = Number.isNaN(eventAt.getTime()) ? new Date() : eventAt;

  // Inbound mail for the domain. The reply inbox and the activity inbox are
  // ours to handle; each handler ignores mail for the other.
  if (eventType === "email.received") {
    try {
      const event = (payload.data ?? {}) as ReceivedEmailEvent;
      const result = await handleReceivedEmail(event);
      const activity = await handleActivityEmail(event);
      res.json({ ok: true, result, activity });
    } catch (err) {
      // 500 so Resend retries; the stored claim stops a retry forwarding twice.
      console.error("[resend-webhook] could not handle a received email:", err);
      res.status(500).json({ error: "Could not handle the received email" });
    }
    return;
  }

  // Every email event moves its email_log entry on (delivered, opened, ...).
  const emailId = payload.data?.email_id;
  if (eventType.startsWith("email.") && emailId) {
    try {
      await applyEmailEvent(emailId, eventType, eventDate);
    } catch (err) {
      console.error("[resend-webhook] could not update the email log:", err);
    }
  }

  const mapped = SUPPRESSION_EVENTS[eventType];
  if (!mapped) {
    res.json({ ok: true });
    return;
  }

  const rawTo = payload.data?.to;
  const recipients = (Array.isArray(rawTo) ? rawTo : rawTo ? [rawTo] : [])
    .map((e) => String(e).trim().toLowerCase())
    .filter((e) => e.includes("@"));
  if (recipients.length === 0) {
    res.json({ ok: true, ignored: true });
    return;
  }

  const reason = extractReason(eventType, payload.data);

  try {
    for (const email of recipients) {
      await db
        .insert(emailSuppressionsTable)
        .values({
          email,
          eventType: mapped,
          reason,
          firstEventAt: eventDate,
          lastEventAt: eventDate,
        })
        .onConflictDoUpdate({
          target: emailSuppressionsTable.email,
          set: {
            eventType: mapped,
            reason,
            lastEventAt: sql`GREATEST(${emailSuppressionsTable.lastEventAt}, ${eventDate.toISOString()}::timestamp)`,
          },
        });
      console.log(`[resend-webhook] recorded ${mapped} for ${email}${reason ? ` (${reason})` : ""}`);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("[resend-webhook] failed to record suppression:", err);
    res.status(500).json({ error: "Failed to record event" });
  }
}
