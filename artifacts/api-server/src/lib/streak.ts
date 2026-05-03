const UK_TZ = "Europe/London";

const ymdFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: UK_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function ukDateParts(d: Date): { year: number; month: number; day: number } {
  const parts = ymdFormatter.formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

function toUkUtcMidnight(d: Date): Date {
  const { year, month, day } = ukDateParts(d);
  return new Date(Date.UTC(year, month - 1, day));
}

function mondayOf(utcDay: Date): Date {
  const dow = utcDay.getUTCDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  const m = new Date(utcDay);
  m.setUTCDate(m.getUTCDate() + diff);
  return m;
}

function weekKey(d: Date): string {
  return mondayOf(toUkUtcMidnight(d)).toISOString().slice(0, 10);
}

const MILESTONES = [4, 12, 26, 52] as const;

export interface StreakInfo {
  current: number;
  longest: number;
  atRisk: boolean;
  weekStart: string;
  nextMilestone: number | null;
}

export function calculateStreak(timestamps: Date[], now: Date = new Date()): StreakInfo {
  const currentWeekMon = mondayOf(toUkUtcMidnight(now));
  const currentKey = currentWeekMon.toISOString().slice(0, 10);

  const weeksWithLogs = new Set<string>();
  for (const ts of timestamps) weeksWithLogs.add(weekKey(ts));

  const sorted = Array.from(weeksWithLogs).sort();

  let longest = 0;
  let run = 0;
  let prev: Date | null = null;
  for (const k of sorted) {
    const d = new Date(k + "T00:00:00.000Z");
    if (prev) {
      const diffWeeks = Math.round((d.getTime() - prev.getTime()) / (7 * 86400 * 1000));
      run = diffWeeks === 1 ? run + 1 : 1;
    } else {
      run = 1;
    }
    if (run > longest) longest = run;
    prev = d;
  }

  const lastWeekMon = new Date(currentWeekMon);
  lastWeekMon.setUTCDate(lastWeekMon.getUTCDate() - 7);
  const lastKey = lastWeekMon.toISOString().slice(0, 10);

  let current = 0;
  let cursor: Date;
  if (weeksWithLogs.has(currentKey)) {
    cursor = new Date(currentWeekMon);
  } else if (weeksWithLogs.has(lastKey)) {
    cursor = new Date(lastWeekMon);
  } else {
    cursor = new Date(0);
    current = 0;
  }
  if (current === 0 && (weeksWithLogs.has(currentKey) || weeksWithLogs.has(lastKey))) {
    while (weeksWithLogs.has(cursor.toISOString().slice(0, 10))) {
      current += 1;
      cursor.setUTCDate(cursor.getUTCDate() - 7);
    }
  }

  const dayOfWeekUk = toUkUtcMidnight(now).getUTCDay();
  const dayIdx = dayOfWeekUk === 0 ? 7 : dayOfWeekUk;
  const atRisk =
    !weeksWithLogs.has(currentKey) && weeksWithLogs.has(lastKey) && dayIdx >= 6;

  const nextMilestone = MILESTONES.find((m) => m > current) ?? null;

  return { current, longest, atRisk, weekStart: currentKey, nextMilestone };
}

export function isStreakMilestone(n: number): boolean {
  return (MILESTONES as readonly number[]).includes(n);
}

export const STREAK_MILESTONES = MILESTONES;
