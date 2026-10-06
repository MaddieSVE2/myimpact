/**
 * Log of every email sent through Resend (table email_log). The Resend
 * client from getUncachableResendClient() is wrapped so each emails.send()
 * is recorded with its recipients, subject, category and outcome, never the
 * body. Resend's webhook (routes/resend-webhook.ts) then moves each row on to
 * delivered, opened, bounced and so on. Logging never blocks or fails a send.
 */
import type { Resend } from "resend";
import { db, emailLogTable, emailRepliesTable } from "@workspace/db";
import { and, desc, eq, lt, sql, type SQL } from "drizzle-orm";

export type EmailCategory =
  | "sign-in"
  | "onboarding"
  | "monthly-digest"
  | "approval-digest"
  | "organisation"
  | "account"
  | "challenge"
  /** Alerts and notices to the My Impact team, not to members. */
  | "internal";

export const EMAIL_LOG_RETENTION_DAYS = 365;

type SendPayload = Parameters<Resend["emails"]["send"]>[0];
type SendOptions = Parameters<Resend["emails"]["send"]>[1];
type SendResult = Awaited<ReturnType<Resend["emails"]["send"]>>;

function recipientsOf(payload: SendPayload): string[] {
  const to = (payload as { to?: string | string[] }).to;
  return (Array.isArray(to) ? to : to ? [to] : []).map((e) => String(e).trim().toLowerCase());
}

async function recordSend(
  category: EmailCategory,
  payload: SendPayload,
  result: SendResult | null,
  thrown?: unknown,
): Promise<void> {
  const failure = thrown ?? result?.error ?? null;
  try {
    await db
      .insert(emailLogTable)
      .values({
        resendId: result?.data?.id ?? null,
        toAddresses: recipientsOf(payload),
        subject: String((payload as { subject?: string }).subject ?? ""),
        category,
        status: failure ? "failed" : "sent",
        error: failure ? (failure instanceof Error ? failure.message : JSON.stringify(failure)).slice(0, 500) : null,
      })
      .onConflictDoNothing();
  } catch (err) {
    console.error("[email-log] could not record a send:", err);
  }
}

/** The reply inbox (EMAIL_REPLY_TO), or null when replies are not collected. */
export function replyInboxAddress(env: NodeJS.ProcessEnv = process.env): string | null {
  const address = (env.EMAIL_REPLY_TO ?? "").trim().toLowerCase();
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address) ? address : null;
}

/**
 * Member emails get the reply inbox as Reply-To so replies are collected
 * (lib/emailReplies.ts). Internal alerts and emails that already set their
 * own Reply-To are left alone.
 */
export function withReplyTo(payload: SendPayload, category: EmailCategory, env: NodeJS.ProcessEnv = process.env): SendPayload {
  const inbox = replyInboxAddress(env);
  const own = payload as { replyTo?: unknown; reply_to?: unknown };
  if (!inbox || category === "internal" || own.replyTo || own.reply_to) return payload;
  return { ...payload, replyTo: inbox } as SendPayload;
}

/** Returns `client` with emails.send() recording each send in email_log. */
export function withEmailLog(client: Resend, category: EmailCategory): Resend {
  const send = client.emails.send.bind(client.emails);
  const emails = Object.create(client.emails) as Resend["emails"];
  emails.send = async (original: SendPayload, options?: SendOptions) => {
    const payload = withReplyTo(original, category);
    let result: SendResult;
    try {
      result = await send(payload, options);
    } catch (err) {
      await recordSend(category, payload, null, err);
      throw err;
    }
    await recordSend(category, payload, result);
    return result;
  };
  return Object.assign(Object.create(client) as Resend, { emails });
}

// Resend webhook event -> email_log status.
const EVENT_STATUS: Record<string, string> = {
  "email.sent": "sent",
  "email.delivery_delayed": "delayed",
  "email.delivered": "delivered",
  "email.opened": "opened",
  "email.clicked": "clicked",
  "email.bounced": "bounced",
  "email.failed": "failed",
  "email.suppressed": "suppressed",
  "email.complained": "complained",
};

// Events can arrive out of order: a status only replaces one ranked lower,
// and a delivery problem outranks any progress.
const STATUS_RANK: Record<string, number> = {
  sent: 1,
  delayed: 2,
  delivered: 3,
  opened: 4,
  clicked: 5,
  failed: 10,
  bounced: 10,
  suppressed: 10,
  complained: 11,
};

/** The status after `eventType`, or null when the event changes nothing. */
export function nextEmailStatus(current: string, eventType: string): string | null {
  const next = EVENT_STATUS[eventType];
  if (!next) return null;
  return (STATUS_RANK[next] ?? 0) > (STATUS_RANK[current] ?? 0) ? next : null;
}

/** Applies a Resend webhook event to the logged email it belongs to. */
export async function applyEmailEvent(resendId: string, eventType: string, at: Date): Promise<void> {
  const row = await db.query.emailLogTable.findFirst({ where: eq(emailLogTable.resendId, resendId) });
  if (!row) return;
  const status = nextEmailStatus(row.status, eventType);
  await db
    .update(emailLogTable)
    .set({ lastEventAt: at, ...(status ? { status } : {}) })
    .where(eq(emailLogTable.id, row.id));
}

/** Deletes log entries and replies older than EMAIL_LOG_RETENTION_DAYS. */
export async function pruneEmailLog(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - EMAIL_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  await db.delete(emailRepliesTable).where(lt(emailRepliesTable.receivedAt, cutoff));
  const deleted = await db.delete(emailLogTable).where(lt(emailLogTable.sentAt, cutoff)).returning({ id: emailLogTable.id });
  return deleted.length;
}

/** Erases every entry sent to `email` and every reply from it (account deletion). */
export async function deleteEmailLogFor(email: string): Promise<void> {
  const address = email.trim().toLowerCase();
  await db.delete(emailRepliesTable).where(eq(emailRepliesTable.fromAddress, address));
  // Also team emails that name them, such as forwarded replies.
  await db
    .delete(emailLogTable)
    .where(
      sql`(${address} = ANY(${emailLogTable.toAddresses}) OR ${emailLogTable.subject} ILIKE ${likePattern(address)})`,
    );
}

/** `%value%` for ILIKE, with LIKE wildcards in `value` matched literally. */
function likePattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export interface EmailLogQuery {
  category?: string;
  status?: string;
  /** Matches part of a recipient address or the subject. */
  search?: string;
  /** Only entries with an id below this (paging, newest first). */
  beforeId?: number;
  limit: number;
}

export async function listEmailLog(q: EmailLogQuery) {
  const conditions: SQL[] = [];
  if (q.category) conditions.push(eq(emailLogTable.category, q.category));
  if (q.status) conditions.push(eq(emailLogTable.status, q.status));
  if (q.beforeId) conditions.push(lt(emailLogTable.id, q.beforeId));
  if (q.search) {
    const pattern = likePattern(q.search);
    conditions.push(
      sql`(${emailLogTable.subject} ILIKE ${pattern} OR array_to_string(${emailLogTable.toAddresses}, ',') ILIKE ${pattern})`,
    );
  }
  return db
    .select()
    .from(emailLogTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(emailLogTable.id))
    .limit(q.limit);
}
