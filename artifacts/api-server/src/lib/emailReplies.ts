/**
 * Replies to our emails. Member emails carry the reply inbox (EMAIL_REPLY_TO)
 * as Reply-To (lib/emailLog.ts). Resend receives every email for the domain
 * and sends an `email.received` webhook; this keeps only those addressed to
 * the reply inbox (hello@, log@ and the rest are other inboxes' business),
 * stores each once, links it to the latest email we sent that person, and
 * forwards a plain-text copy to EMAIL_REPLY_FORWARD_TO.
 */
import { db, emailLogTable, emailRepliesTable, type EmailLogEntry } from "@workspace/db";
import { and, desc, eq, lt, ne, sql } from "drizzle-orm";
import { getUncachableResendClient } from "./resend.js";
import { replyInboxAddress } from "./emailLog.js";

export const REPLY_TEXT_LIMIT = 20_000;

/** Resend's `email.received` webhook data (metadata only, no body). */
export interface ReceivedEmailEvent {
  email_id?: string;
  created_at?: string;
  from?: string;
  to?: string[] | string;
  received_for?: string[];
  subject?: string;
}

/** "Jo Bloggs <Jo@Example.org>" -> "jo@example.org". */
export function bareAddress(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return (match ? match[1]! : value).trim().toLowerCase();
}

export function isForReplyInbox(event: ReceivedEmailEvent, inbox: string): boolean {
  const to = Array.isArray(event.to) ? event.to : event.to ? [event.to] : [];
  return [...to, ...(event.received_for ?? [])].some((a) => bareAddress(String(a)) === inbox);
}

/** Rough plain text from HTML, for replies sent without a text part. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** The received email's text from Resend (the webhook carries no body). */
export async function fetchReceivedText(id: string): Promise<string | null> {
  const apiKey = process.env.RESEND_API_KEY;
  if (process.env.E2E_TEST_MODE === "1" || !apiKey) return null;
  const res = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`Resend responded ${res.status} for received email ${id}`);
  const body = (await res.json()) as { text?: string | null; html?: string | null };
  const text = body.text?.trim() || (body.html ? htmlToText(body.html) : "");
  return text ? text.slice(0, REPLY_TEXT_LIMIT) : null;
}

/** The plain-text copy sent to the team. */
export function buildForward(reply: {
  from: string;
  subject: string;
  text: string | null;
  original: Pick<EmailLogEntry, "subject" | "category" | "sentAt"> | null;
}): { subject: string; text: string } {
  const context = reply.original
    ? `In reply to "${reply.original.subject}" (${reply.original.category}), sent ${reply.original.sentAt.toLocaleString("en-GB", { timeZone: "Europe/London" })}.`
    : "This could not be matched to an email My Impact sent them.";
  return {
    subject: `Reply from ${reply.from}: ${reply.subject || "(no subject)"}`.slice(0, 250),
    text: [
      `${reply.from} replied to a My Impact email. Reply to this message to answer them directly.`,
      context,
      "",
      "----",
      reply.text ?? "(The message text could not be fetched. It is in Resend's received emails.)",
    ].join("\n"),
  };
}

async function forward(reply: Parameters<typeof buildForward>[0]): Promise<string> {
  const to = (process.env.EMAIL_REPLY_FORWARD_TO ?? "")
    .split(",")
    .map((a) => a.trim())
    .filter((a) => a.includes("@"));
  if (to.length === 0) return "not forwarded (EMAIL_REPLY_FORWARD_TO is not set)";
  try {
    const { client, fromEmail } = await getUncachableResendClient("internal");
    const message = buildForward(reply);
    const { error } = await client.emails.send({ from: fromEmail, to, replyTo: reply.from, ...message });
    if (error) throw new Error(error.message);
    return `forwarded to ${to.join(", ")}`;
  } catch (err) {
    console.error("[email-replies] forward failed:", err);
    return `forward failed: ${(err instanceof Error ? err.message : String(err)).slice(0, 200)}`;
  }
}

export type ReceivedResult = "ignored" | "duplicate" | "stored";

export async function handleReceivedEmail(event: ReceivedEmailEvent): Promise<ReceivedResult> {
  const inbox = replyInboxAddress();
  if (!inbox || !event.email_id || !event.from || !isForReplyInbox(event, inbox)) return "ignored";
  const from = bareAddress(event.from);
  // Never treat our own mail as a member's reply.
  if (from === inbox) return "ignored";

  const at = event.created_at ? new Date(event.created_at) : new Date();
  const receivedAt = Number.isNaN(at.getTime()) ? new Date() : at;
  const subject = (event.subject ?? "").slice(0, 500);

  // Claim it first: Resend retries webhooks, and a retry must not forward twice.
  const [claimed] = await db
    .insert(emailRepliesTable)
    .values({ resendReceivedId: event.email_id, fromAddress: from, subject, receivedAt })
    .onConflictDoNothing()
    .returning({ id: emailRepliesTable.id });
  if (!claimed) return "duplicate";

  // The latest member email to them. Replies are handled as they arrive, so
  // no time comparison is needed (sent_at is stored in the database's local
  // time, the webhook's time is UTC).
  const original =
    (await db.query.emailLogTable.findFirst({
      where: and(sql`${from} = ANY(${emailLogTable.toAddresses})`, ne(emailLogTable.category, "internal")),
      orderBy: desc(emailLogTable.id),
    })) ?? null;

  let text: string | null = null;
  try {
    text = await fetchReceivedText(event.email_id);
  } catch (err) {
    console.error("[email-replies] could not fetch the reply text:", err);
  }

  const forwardStatus = await forward({ from, subject, text, original });
  await db
    .update(emailRepliesTable)
    .set({ emailLogId: original?.id ?? null, textBody: text, forwardStatus })
    .where(eq(emailRepliesTable.id, claimed.id));
  console.log(`[email-replies] stored a reply from ${from} (${forwardStatus})`);
  return "stored";
}

export async function listEmailReplies(q: { beforeId?: number; limit: number }) {
  return db
    .select({
      id: emailRepliesTable.id,
      fromAddress: emailRepliesTable.fromAddress,
      subject: emailRepliesTable.subject,
      textBody: emailRepliesTable.textBody,
      forwardStatus: emailRepliesTable.forwardStatus,
      receivedAt: emailRepliesTable.receivedAt,
      inReplyToSubject: emailLogTable.subject,
      inReplyToCategory: emailLogTable.category,
      inReplyToSentAt: emailLogTable.sentAt,
    })
    .from(emailRepliesTable)
    .leftJoin(emailLogTable, eq(emailRepliesTable.emailLogId, emailLogTable.id))
    .where(q.beforeId ? lt(emailRepliesTable.id, q.beforeId) : undefined)
    .orderBy(desc(emailRepliesTable.id))
    .limit(q.limit);
}
