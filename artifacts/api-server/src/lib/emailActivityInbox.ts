/**
 * The activity inbox (EMAIL_ACTIVITY_INBOX, e.g. log@myimpact.uk): someone
 * emails what they did, and it is added to their record as a Quick Log
 * entry, or they get one short question back. Rules are in
 * lib/emailActivity.ts.
 *
 * Who is read: senders in EMAIL_ACTIVITY_TEST_SENDERS, into demo accounts
 * (see parseTestSenders); and, when EMAIL_ACTIVITY_LIVE is "true", members
 * emailing from their account's address, into their own record. A From
 * address is easy to forge, so a member's email is only read when Resend's
 * receiving server confirmed the sender (senderVerified); otherwise nothing
 * is added and they are pointed to the app.
 *
 * Evidence is never sent by email: when the person's organisation requires
 * it, the reply links to the page where they log in, add a photo and share
 * the entry, and the usual evidence check there applies.
 */
import { db, emailActivityMessagesTable, impactRecordsTable, organisationsTable, usersTable } from "@workspace/db";
import { and, desc, eq, gte, lt, ne } from "drizzle-orm";
import { ACTIVITIES, calculateImpact } from "./impactData.js";
import { completeJson } from "./aiJson.js";
import { deriveReportingYear } from "./contributionModel.js";
import { activeOrgIdFor, defaultGroupFor } from "./orgGroups.js";
import { autoVerifyRecordsForUser, calendarMonthLabel, extractActivityIds, oneOffValuation } from "./recordHelpers.js";
import { getUncachableResendClient } from "./resend.js";
import { bareAddress, fetchReceivedEmail, isForReplyInbox, type ReceivedEmail, type ReceivedEmailEvent } from "./emailReplies.js";
import { replyInboxAddress } from "./emailLog.js";
import type { Resend } from "resend";
import {
  activityInboxAddress,
  activityInboxLive,
  activityReplyFrom,
  threadHeaders,
  addedReply,
  buildInterpretMessages,
  decideSender,
  isAutomatedEmail,
  isReplySubject,
  itemToEntry,
  needsCount,
  newText,
  noAccountReply,
  parseTestSenders,
  questionReply,
  replySubject,
  REVIEW_REPLY,
  senderVerified,
  storedLocation,
  threadKey,
  unverifiedReply,
  validateInterpretation,
  type AddedLine,
  type ConversationTurn,
  type Interpretation,
  type LoggableItem,
} from "./emailActivity.js";
import { isPersonaEmail } from "../routes/auth.js";

/** A conversation is the sender's "asked" emails within this window. */
const CONVERSATION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
/** More than this many emails a day from one sender are not read (loops, cost). */
const DAILY_LIMIT = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
/** A member whose emails can't be verified is told so at most this often. */
const UNVERIFIED_NOTICE_EVERY_MS = DAY_MS;
/** An address with no account is told so at most this often... */
const NO_ACCOUNT_NOTICE_EVERY_MS = 7 * DAY_MS;
/** ...and no more than this many such addresses a day, so junk mail can't make us a source of it. */
const NO_ACCOUNT_NOTICES_PER_DAY = 20;
export const ENTRY_NAME = "Logged by email";

function appUrl(): string {
  const url = process.env.APP_URL ?? (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "");
  return url.replace(/\/$/, "");
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** Swappable for tests and local runs, where neither Resend nor the model is reachable. */
export interface ActivityInboxDeps {
  /** The email's text and Resend's checks on its sender; null when it can't be fetched here. */
  fetchEmail: (emailId: string) => Promise<ReceivedEmail | null>;
  interpret: (messages: ReturnType<typeof buildInterpretMessages>) => Promise<Record<string, unknown> | null>;
  send: (message: ActivityReply) => Promise<void>;
  /** True for the demo accounts, the only ones a test sender may log into. */
  isAllowedAccount: (email: string) => boolean;
}

/** One reply to someone who emailed the activity inbox. */
export interface ActivityReply {
  to: string;
  subject: string;
  text: string;
  /** The Message-ID of the email being answered, so the reply sits under it. */
  inReplyTo?: string | null;
}

/** After Resend refuses the inbox's address as a sender, it is not tried again for this long. */
const INBOX_SENDER_RETRY_MS = 60 * 60 * 1000;
let inboxSenderRefusedAt = Number.NEGATIVE_INFINITY;

/**
 * Sends a reply as My Impact at the inbox's own address (the one the member
 * wrote to), under their email. Resend only sends from domains verified on
 * the account, so if it refuses that address the reply still goes, from
 * the usual sender (`fallbackFrom`).
 */
export async function sendActivityReply(
  client: { emails: Pick<Resend["emails"], "send"> },
  fallbackFrom: string,
  message: ActivityReply,
  now = Date.now(),
): Promise<void> {
  const headers = threadHeaders(message.inReplyTo);
  const payload = {
    to: message.to,
    // Answers come back to the activity inbox, keeping the conversation together.
    replyTo: activityInboxAddress()!,
    subject: message.subject,
    text: message.text,
    ...(headers ? { headers } : {}),
  };
  const ownFrom = activityReplyFrom();
  if (ownFrom && now - inboxSenderRefusedAt > INBOX_SENDER_RETRY_MS) {
    const { error } = await client.emails.send({ from: ownFrom, ...payload });
    if (!error) return;
    // Only a refusal of the sender itself pauses further attempts.
    if (/domain|verif|from/i.test(`${error.name ?? ""} ${error.message}`)) inboxSenderRefusedAt = now;
    console.warn(`[activity-inbox] could not send as ${ownFrom} (${error.message}); sending as ${fallbackFrom}`);
  }
  const { error } = await client.emails.send({ from: fallbackFrom, ...payload });
  if (error) throw new Error(error.message);
}

const defaultDeps: ActivityInboxDeps = {
  fetchEmail: fetchReceivedEmail,
  interpret: (messages) => completeJson(messages, 2500),
  send: async (message) => {
    const { client, fromEmail } = await getUncachableResendClient("activity-log");
    await sendActivityReply(client, fromEmail, message);
  },
  isAllowedAccount: isPersonaEmail,
};

export type ActivityEmailResult = "ignored" | "duplicate" | "handled";

/** How many of this sender's other emails (everyone's, without `from`) ended as `outcome` since `sinceMs`. */
async function earlierWith(outcome: string, sinceMs: number, exceptId: number, from?: string): Promise<number> {
  const rows = await db
    .select({ id: emailActivityMessagesTable.id })
    .from(emailActivityMessagesTable)
    .where(
      and(
        eq(emailActivityMessagesTable.outcome, outcome),
        gte(emailActivityMessagesTable.receivedAt, new Date(sinceMs)),
        ne(emailActivityMessagesTable.id, exceptId),
        from ? eq(emailActivityMessagesTable.fromAddress, from) : undefined,
      ),
    );
  return rows.length;
}

/**
 * Live mode, and no account has this address. They are told once (they may
 * have signed up with another address), but only when the sender is
 * verified, so a forged or junk email never makes us write to a stranger.
 * Nothing of the email is kept beyond who sent it and its subject.
 */
async function noAccount(
  id: number,
  emailId: string,
  from: string,
  receivedAt: Date,
  deps: ActivityInboxDeps,
  reply: (body: string) => Promise<void>,
): Promise<void> {
  const at = receivedAt.getTime();
  let note = "No account has this address.";
  let tell = false;
  if ((await earlierWith("no_account", at - NO_ACCOUNT_NOTICE_EVERY_MS, id, from)) > 0) note += " Already told this week.";
  else if ((await earlierWith("no_account", at - DAY_MS, id)) >= NO_ACCOUNT_NOTICES_PER_DAY) note += " Not told: too many of these today.";
  else {
    try {
      tell = senderVerified((await deps.fetchEmail(emailId))?.authentication);
    } catch (err) {
      console.error("[activity-inbox] could not fetch the email:", err);
    }
    note += tell ? " Told them." : " Not told: the sender could not be confirmed.";
  }
  await finish(id, { outcome: "no_account", note });
  if (tell) await reply(noAccountReply(appUrl())).catch((err) => console.error("[activity-inbox] notice failed:", err));
  console.log(`[activity-inbox] ${from}: no account`);
}

async function finish(id: number, values: Partial<typeof emailActivityMessagesTable.$inferInsert>) {
  await db.update(emailActivityMessagesTable).set(values).where(eq(emailActivityMessagesTable.id, id));
}

/** Sends an email the team should look at to EMAIL_REPLY_FORWARD_TO. */
async function forwardToTeam(from: string, subject: string, text: string, reason: string): Promise<void> {
  const to = (process.env.EMAIL_REPLY_FORWARD_TO ?? "").split(",").map((a) => a.trim()).filter((a) => a.includes("@"));
  if (to.length === 0) return;
  try {
    const { client, fromEmail } = await getUncachableResendClient("internal");
    await client.emails.send({
      from: fromEmail,
      to,
      replyTo: from,
      subject: `Activity email from ${from} needs a look: ${subject || "(no subject)"}`.slice(0, 250),
      text: [`${from} emailed the activity inbox and it couldn't be added automatically.`, `Why: ${reason}`, "", "----", text].join("\n"),
    });
  } catch (err) {
    console.error("[activity-inbox] forward failed:", err);
  }
}

/**
 * Adds one item as a Quick Log entry, valued and stored as /api/impact/save
 * stores one. Returns null when the same activity is already logged that
 * day (the Quick Log duplicate rule), so a repeated email adds nothing.
 */
async function addEntry(userId: string, item: LoggableItem): Promise<{ id: number; value: number } | null> {
  // Midnight UTC, as /api/impact/save stores a YYYY-MM-DD entry date.
  const entryDate = new Date(`${item.date}T00:00:00Z`);
  const entry = itemToEntry(item);
  if (item.kind === "activity") {
    const dayStart = new Date(`${item.date}T00:00:00Z`);
    const sameDay = await db
      .select({ activitiesJson: impactRecordsTable.activitiesJson })
      .from(impactRecordsTable)
      .where(
        and(
          eq(impactRecordsTable.userId, userId),
          gte(impactRecordsTable.entryDate, dayStart),
          lt(impactRecordsTable.entryDate, new Date(dayStart.getTime() + 86_400_000)),
        ),
      );
    if (sameDay.some((r) => extractActivityIds(r.activitiesJson).includes(item.activityId))) return null;
  }
  const result = calculateImpact(entry.activities, entry.donationsGBP, 0, [], await oneOffValuation(userId, entryDate));
  const { locationJson, outwardCode } = storedLocation(item.kind === "activity" ? item.location : null);
  const [inserted] = await db
    .insert(impactRecordsTable)
    .values({
      userId,
      orgGroupId: await defaultGroupFor(userId),
      name: ENTRY_NAME,
      periodLabel: calendarMonthLabel(entryDate),
      totalValue: String(result.totalValue),
      impactValue: String(result.impactValue),
      contributionValue: String(result.contributionValue),
      donationsValue: String(result.donationsValue),
      personalDevelopmentValue: String(result.personalDevelopmentValue),
      totalHours: result.totalHours,
      activitiesJson: entry.activities,
      resultJson: { ...result, capturedBy: "email", ...(item.note ? { emailNote: item.note } : {}) },
      entryDate,
      source: entryDate.getUTCFullYear() < new Date().getUTCFullYear() ? "retrospective" : "user",
      kind: "quick_log",
      reportingYear: deriveReportingYear(entryDate),
      locationJson,
      outwardCode,
    })
    .returning({ id: impactRecordsTable.id });
  await autoVerifyRecordsForUser(userId, [inserted!.id]);
  return { id: inserted!.id, value: result.totalValue };
}

/** How an item is listed in the reply: its name, "2 hours" or "3 young people, 4 hours", and where. */
function describeItem(item: LoggableItem): { name: string; detail: string; place: string | null } {
  if (item.kind === "donation") return { name: "Donation", detail: `£${item.amountGBP.toLocaleString("en-GB")}`, place: null };
  const activity = ACTIVITIES.find((a) => a.id === item.activityId)!;
  const hours = `${item.hours} ${item.hours === 1 ? "hour" : "hours"}`;
  const counted = needsCount(activity);
  const loc = item.location;
  const place = loc ? (loc.mode === "online" ? "online" : [loc.label, loc.townCity].filter(Boolean).join(", ") || loc.postcode) : null;
  return {
    name: activity.shortName,
    detail: counted ? `${item.quantity} ${activity.unitLabel.toLowerCase().replace(/ per year$/, "")}, ${hours}` : hours,
    place,
  };
}

/**
 * Handles one Resend `email.received` event if it is for the activity
 * inbox. Never throws for a problem with the email itself: those end as
 * "needs_review" and go to the team, so a webhook retry can't lose them.
 */
export async function handleActivityEmail(
  event: ReceivedEmailEvent,
  deps: ActivityInboxDeps = defaultDeps,
): Promise<ActivityEmailResult> {
  const inbox = activityInboxAddress();
  if (!inbox || !event.email_id || !event.from || !isForReplyInbox(event, inbox)) return "ignored";
  const from = bareAddress(event.from);
  const subject = (event.subject ?? "").slice(0, 500);
  const at = event.created_at ? new Date(event.created_at) : new Date();
  const receivedAt = Number.isNaN(at.getTime()) ? new Date() : at;

  const [claimed] = await db
    .insert(emailActivityMessagesTable)
    .values({ resendReceivedId: event.email_id, fromAddress: from, subject, receivedAt })
    .onConflictDoNothing()
    .returning({ id: emailActivityMessagesTable.id });
  if (!claimed) return "duplicate";
  const id = claimed.id;

  // Our own addresses and machine mail are never answered (no reply loops).
  if (from === inbox || from === replyInboxAddress() || isAutomatedEmail(from, subject)) {
    await finish(id, { outcome: "ignored", note: "Automatic or own email." });
    return "handled";
  }
  const decision = decideSender(from, {
    testSenders: parseTestSenders(process.env, deps.isAllowedAccount),
    live: activityInboxLive(),
    isDemoAccount: deps.isAllowedAccount,
  });
  if (decision.read === "no") {
    await finish(id, { outcome: "ignored", note: decision.note });
    console.log(`[activity-inbox] ignored an email from ${from}: ${decision.note}`);
    return "handled";
  }
  const recent = await db
    .select({ id: emailActivityMessagesTable.id })
    .from(emailActivityMessagesTable)
    .where(and(eq(emailActivityMessagesTable.fromAddress, from), gte(emailActivityMessagesTable.receivedAt, new Date(receivedAt.getTime() - DAY_MS))));
  if (recent.length > DAILY_LIMIT) {
    await finish(id, { outcome: "ignored", note: "Over the daily limit for this sender." });
    return "handled";
  }
  // Replies name the member's email, so they sit under it in their mail app.
  let messageId = event.message_id ?? null;
  const reply = async (body: string) =>
    deps.send({ to: from, subject: replySubject(subject), text: body, inReplyTo: messageId });

  // A test sender logs into its demo account; a member into the account with their address.
  const account = decision.read === "test" ? decision.account : from;
  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.email, account), columns: { id: true } });
  if (!user) {
    if (decision.read === "test") {
      await finish(id, { outcome: "ignored", note: `${account} has no account yet (sign in to it once).` });
    } else {
      await noAccount(id, event.email_id, from, receivedAt, deps, reply);
    }
    return "handled";
  }

  let email: ReceivedEmail | null = null;
  let fetched = false;
  try {
    email = await deps.fetchEmail(event.email_id);
    fetched = true;
    messageId ??= email?.messageId ?? null;
  } catch (err) {
    console.error("[activity-inbox] could not fetch the email:", err);
  }
  // A member's email is only read once the sender is confirmed. When the
  // fetch itself failed there is no text to read either, so nothing can be
  // added; it goes to the team below.
  if (decision.read === "member" && fetched && !senderVerified(email?.authentication)) {
    const told = (await earlierWith("unverified", receivedAt.getTime() - UNVERIFIED_NOTICE_EVERY_MS, id, from)) === 0;
    const a = email?.authentication;
    await finish(id, {
      outcome: "unverified",
      note: `The sender could not be confirmed (${a ? `SPF ${a.spf ?? "?"}, DKIM ${a.dkim ?? "?"}, DMARC ${a.dmarc ?? "?"}` : "no checks from Resend"}). ${told ? "Told them." : "Already told today."}`,
    });
    if (told) await reply(unverifiedReply(`${appUrl()}/log`)).catch((err) => console.error("[activity-inbox] notice failed:", err));
    console.log(`[activity-inbox] ${from}: sender not verified`);
    return "handled";
  }
  const text = newText(email?.text ?? "");
  await finish(id, { userId: user.id, textBody: text.slice(0, 20_000) });

  // The open conversation: the emails in this thread we asked a question
  // about, since its last finished one. A thread is a subject and the
  // replies to it, so only a reply can continue one. A new email is a new
  // conversation, even while a question in another is unanswered.
  const earlier = await db
    .select()
    .from(emailActivityMessagesTable)
    .where(
      and(
        eq(emailActivityMessagesTable.fromAddress, from),
        gte(emailActivityMessagesTable.receivedAt, new Date(receivedAt.getTime() - CONVERSATION_WINDOW_MS)),
        lt(emailActivityMessagesTable.id, id),
      ),
    )
    .orderBy(desc(emailActivityMessagesTable.id));
  const open = [];
  if (isReplySubject(subject)) {
    const thread = threadKey(subject);
    for (const row of earlier) {
      if (threadKey(row.subject) !== thread) continue;
      if (row.outcome !== "asked") break;
      open.unshift(row);
    }
  }
  const conversation: ConversationTurn[] = [];
  for (const row of open) {
    conversation.push({ from: "sender", text: row.textBody ?? "", date: isoDay(row.receivedAt) });
    if (row.question) conversation.push({ from: "my-impact", text: row.question, date: isoDay(row.receivedAt) });
  }
  conversation.push({ from: "sender", text: text || "(empty email)", date: isoDay(receivedAt) });

  const today = isoDay(receivedAt);
  let interpretation: Interpretation;
  try {
    interpretation = text
      ? validateInterpretation(await deps.interpret(buildInterpretMessages(conversation, today, ACTIVITIES)), {
          today,
          activities: ACTIVITIES,
          questionsAsked: open.length,
          senderText: conversation.filter((t) => t.from === "sender").map((t) => t.text).join("\n"),
        })
      : { outcome: "needs_review", reason: "The email text could not be read." };
  } catch (err) {
    console.error("[activity-inbox] could not read the email:", err);
    interpretation = { outcome: "needs_review", reason: "The email could not be read automatically." };
  }

  try {
    switch (interpretation.outcome) {
      case "ignore":
        await finish(id, { outcome: "ignored", note: interpretation.reason });
        break;
      case "no_activity":
        await finish(id, { outcome: "no_activity" });
        break;
      case "ask":
        await reply(questionReply(interpretation.question));
        await finish(id, { outcome: "asked", question: interpretation.question });
        break;
      case "needs_review": {
        await finish(id, { outcome: "needs_review", note: interpretation.reason });
        const thread = conversation.map((t) => `${t.from === "sender" ? from : "My Impact"} (${t.date}):\n${t.text}`).join("\n\n");
        await forwardToTeam(from, subject, thread, interpretation.reason);
        await reply(REVIEW_REPLY);
        break;
      }
      case "ready":
        await logItems(id, user.id, interpretation.items, interpretation.acknowledgement, reply);
        break;
    }
  } catch (err) {
    console.error("[activity-inbox] could not finish handling an email:", err);
    await finish(id, { outcome: "needs_review", note: `Failed while handling: ${err instanceof Error ? err.message : String(err)}`.slice(0, 500) });
  }
  console.log(`[activity-inbox] ${from} -> ${account}: ${interpretation.outcome}`);
  return "handled";
}

async function logItems(
  messageId: number,
  userId: string,
  items: LoggableItem[],
  acknowledgement: string,
  reply: (body: string) => Promise<void>,
) {
  // What the organisation needs before an entry counts for it. Only orgs
  // that collect submissions ask; consented-logging orgs see entries as
  // their member's consent allows, without an evidence step.
  const orgId = await activeOrgIdFor(userId);
  const org = orgId ? await db.query.organisationsTable.findFirst({ where: eq(organisationsTable.id, orgId) }) : null;
  const collectsSubmissions = !!org && !org.revokedAt && org.dataSharingMode === "explicit_submission";

  const added: AddedLine[] = [];
  const duplicates: { name: string; date: string }[] = [];
  const recordIds: number[] = [];
  for (const item of items) {
    const described = describeItem(item);
    const entry = await addEntry(userId, item);
    if (!entry) {
      duplicates.push({ name: described.name, date: item.date });
      continue;
    }
    recordIds.push(entry.id);
    added.push({
      ...described,
      date: item.date,
      value: entry.value,
      orgStep: collectsSubmissions
        ? { orgName: org!.name, evidenceRequired: org!.evidencePolicy === "required", link: `${appUrl()}/org/share-report/${entry.id}` }
        : null,
    });
  }
  await finish(messageId, { outcome: "logged", recordIds });
  await reply(addedReply(acknowledgement, added, duplicates, `${appUrl()}/history`));
}
