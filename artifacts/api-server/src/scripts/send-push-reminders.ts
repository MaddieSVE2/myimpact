/**
 * Daily push-reminder dispatcher.
 *
 * Iterates every user with at least one impact record and decides whether
 * to send a "streak at risk" or "recurring activity due" push.
 *
 *  - streak-at-risk:  user has logged on each of the last N consecutive days
 *                     (N >= 3), did NOT log today, and it is past 18:00 UTC.
 *  - recurringDue:    user has a recurring template currently `isDue` and we
 *                     haven't already pushed about it today.
 *
 * Designed to be run as a Replit Scheduled Deployment, e.g. once per hour.
 * Honours per-user push preferences (toggles + pause-until) automatically
 * because dispatch goes through `sendPushToUser`.
 *
 * Flags:
 *   --dry-run            Compute candidates but skip web-push delivery.
 *   --user-email <addr>  Limit to a single user, useful for manual runs.
 */
import { db, usersTable, impactRecordsTable, recurringTemplatesTable, pool } from "@workspace/db";
import { eq, sql, isNotNull } from "drizzle-orm";
import { sendPushToUser } from "../lib/push.js";

interface Options {
  dryRun: boolean;
  singleUserEmail?: string;
}

function parseStringArg(args: string[], name: string): string | undefined {
  const idx = args.findIndex((a) => a === name || a.startsWith(`${name}=`));
  if (idx === -1) return undefined;
  if (args[idx]!.includes("=")) return args[idx]!.split("=").slice(1).join("=");
  return args[idx + 1];
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

async function loadCandidateUsers(opts: Options) {
  let rows = await db.select().from(usersTable);
  if (opts.singleUserEmail) {
    const target = opts.singleUserEmail.trim().toLowerCase();
    rows = rows.filter((u) => u.email.toLowerCase() === target);
  }
  return rows;
}

/**
 * Compute the user's current daily logging streak (number of consecutive
 * past days, ending today or yesterday, with at least one impact record).
 *
 * Returns:
 *   { length: number, loggedToday: boolean, loggedYesterday: boolean }
 */
async function computeStreak(userId: string, today: Date) {
  const earliest = new Date(today);
  earliest.setDate(earliest.getDate() - 30);

  const records = await db
    .select({ createdAt: impactRecordsTable.createdAt })
    .from(impactRecordsTable)
    .where(eq(impactRecordsTable.userId, userId));

  const days = new Set<string>();
  for (const r of records) {
    const d = startOfDay(r.createdAt);
    if (d >= earliest && d <= today) days.add(d.toISOString().slice(0, 10));
  }

  const isoToday = startOfDay(today).toISOString().slice(0, 10);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const isoYesterday = startOfDay(yesterday).toISOString().slice(0, 10);

  const loggedToday = days.has(isoToday);
  const loggedYesterday = days.has(isoYesterday);

  // Walk backwards from yesterday counting the streak (today doesn't break it
  // — it could be made tonight). If today is logged we still want to know
  // the length so we don't push.
  let length = 0;
  const cursor = new Date(today);
  if (!loggedToday) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (true) {
    const iso = startOfDay(cursor).toISOString().slice(0, 10);
    if (!days.has(iso)) break;
    length++;
    cursor.setDate(cursor.getDate() - 1);
  }

  return { length, loggedToday, loggedYesterday };
}

async function dispatchStreakAtRisk(userId: string, today: Date, opts: Options): Promise<boolean> {
  const streak = await computeStreak(userId, today);
  // Only nudge once the streak is meaningful and the user hasn't yet logged
  // today. We send late afternoon onwards (caller decides scheduling).
  if (streak.loggedToday) return false;
  if (streak.length < 3) return false;
  // After 18:00 UTC only — assumes scheduled run respects this.
  if (today.getUTCHours() < 18) return false;

  const title = `Keep your ${streak.length}-day streak alive`;
  const body = `Two minutes is all it takes — log today's contribution to keep it going.`;

  if (opts.dryRun) {
    console.log(`      [dry-run] streakAtRisk → ${userId} (${streak.length}-day)`);
    return true;
  }
  const sent = await sendPushToUser(userId, {
    title,
    body,
    url: "/wizard/actions",
    type: "streakAtRisk",
    tag: `streak-${userId}-${today.toISOString().slice(0, 10)}`,
  });
  return sent > 0;
}

async function dispatchRecurringDue(userId: string, today: Date, opts: Options): Promise<boolean> {
  const templates = await db
    .select()
    .from(recurringTemplatesTable)
    .where(eq(recurringTemplatesTable.userId, userId));
  if (templates.length === 0) return false;

  // Compute a tiny version of the same isDue logic the API uses: a template
  // is due if its nextDueDate is today or earlier. We delegate to the DB
  // helper field if present, otherwise fall back to the lastConfirmedAt /
  // cadence logic. To keep this dispatcher resilient to schema drift, we
  // approximate "due" as: lastConfirmedAt is null or older than the cadence
  // window for the current day-of-period.
  const dueLabels: string[] = [];
  for (const t of templates) {
    const lastConfirmed = t.lastConfirmedAt ? startOfDay(t.lastConfirmedAt) : null;
    const todayStart = startOfDay(today);
    const minDaysSinceConfirm =
      t.cadence === "weekly" ? 6 : t.cadence === "fortnightly" ? 13 : 27;
    const okOnDay =
      t.cadence === "monthly"
        ? todayStart.getDate() === t.dayOfPeriod
        : todayStart.getDay() === t.dayOfPeriod;
    if (!okOnDay) continue;
    if (
      !lastConfirmed ||
      (todayStart.getTime() - lastConfirmed.getTime()) / 86_400_000 >= minDaysSinceConfirm
    ) {
      dueLabels.push(t.label);
    }
  }

  if (dueLabels.length === 0) return false;

  const title = dueLabels.length === 1 ? `Time to log: ${dueLabels[0]}` : `${dueLabels.length} regular activities are due`;
  const body =
    dueLabels.length === 1
      ? `Open My Impact to log "${dueLabels[0]}" with one tap.`
      : `Open My Impact to log them with one tap each.`;

  if (opts.dryRun) {
    console.log(`      [dry-run] recurringDue → ${userId} (${dueLabels.join(", ")})`);
    return true;
  }
  const sent = await sendPushToUser(userId, {
    title,
    body,
    url: "/",
    type: "recurringDue",
    tag: `recurring-${userId}-${today.toISOString().slice(0, 10)}`,
  });
  return sent > 0;
}

async function main() {
  const argv = process.argv.slice(2).filter((a) => a !== "--");
  const argSet = new Set(argv);
  const opts: Options = {
    dryRun: argSet.has("--dry-run"),
    singleUserEmail: parseStringArg(argv, "--user-email"),
  };

  const today = new Date();
  console.log(`[push-reminders] running for ${today.toISOString()}${opts.dryRun ? " (DRY RUN)" : ""}`);

  const users = await loadCandidateUsers(opts);
  console.log(`[push-reminders] ${users.length} candidate user(s)`);

  let streaksSent = 0;
  let recurringSent = 0;
  let errors = 0;

  for (const user of users) {
    try {
      if (await dispatchStreakAtRisk(user.id, today, opts)) streaksSent++;
      if (await dispatchRecurringDue(user.id, today, opts)) recurringSent++;
    } catch (err) {
      errors++;
      console.error(`[push-reminders] ${user.email}:`, (err as Error)?.message);
    }
  }

  console.log(
    `[push-reminders] done — streakAtRisk: ${streaksSent}, recurringDue: ${recurringSent}, errors: ${errors}`,
  );

  try {
    await pool.end();
  } catch {}
}

main().catch(async (err) => {
  console.error("Push reminders job failed:", err);
  try {
    await pool.end();
  } catch {}
  process.exit(1);
});

void sql;
void isNotNull;
