/**
 * Recurring activity schedule rules, shared by the recurring-templates API
 * (routes/impact.ts) and the push reminder job so both agree on when an
 * occurrence is due. All dates are UTC calendar days.
 */

export type Cadence = "weekly" | "fortnightly" | "monthly";

export function isValidCadence(value: unknown): value is Cadence {
  return value === "weekly" || value === "fortnightly" || value === "monthly";
}

export function startOfDayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Compute the next due date (>= today, in UTC) for a template based on its
 * cadence and dayOfPeriod. Skipping does not break the schedule because we
 * always compute relative to today's calendar.
 *
 * weekly:      dayOfPeriod = 0–6 (Sun=0). Returns the next occurrence today or
 *              within the next 6 days.
 * fortnightly: dayOfPeriod = 0–6. Returns the next occurrence whose week
 *              parity (relative to anchorDate) matches.
 * monthly:     dayOfPeriod = 1–28. Returns this month's day if it hasn't
 *              passed, otherwise next month's.
 */
export function computeNextDueDate(cadence: Cadence, dayOfPeriod: number, anchor: Date, now: Date): Date {
  const today = startOfDayUTC(now);

  if (cadence === "monthly") {
    const day = Math.max(1, Math.min(28, Math.round(dayOfPeriod)));
    const candidate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), day));
    if (candidate.getTime() >= today.getTime()) return candidate;
    return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, day));
  }

  // weekly / fortnightly
  const targetDow = ((Math.round(dayOfPeriod) % 7) + 7) % 7;
  const todayDow = today.getUTCDay();
  let offset = (targetDow - todayDow + 7) % 7;
  let candidate = new Date(today);
  candidate.setUTCDate(candidate.getUTCDate() + offset);

  if (cadence === "fortnightly") {
    const anchorMidnight = startOfDayUTC(anchor);
    const msPerDay = 24 * 60 * 60 * 1000;
    const weeksFromAnchor = Math.floor((candidate.getTime() - anchorMidnight.getTime()) / (7 * msPerDay));
    if (((weeksFromAnchor % 2) + 2) % 2 !== 0) {
      candidate = new Date(candidate);
      candidate.setUTCDate(candidate.getUTCDate() + 7);
    }
  }

  return candidate;
}

/**
 * Compute the most recent scheduled occurrence on or before today. Used to
 * determine whether the user has confirmed it yet. Anchor-aware: returns
 * null when the template's first scheduled occurrence is still in the
 * future (e.g. a weekly template created on Monday for Friday has NO
 * current occurrence until that Friday — the previous Friday predates the
 * template and must never be presented or logged as due).
 */
export function computeLastScheduledDateRaw(
  cadence: Cadence,
  dayOfPeriod: number,
  anchor: Date,
  now: Date,
): Date {
  const today = startOfDayUTC(now);

  if (cadence === "monthly") {
    const day = Math.max(1, Math.min(28, Math.round(dayOfPeriod)));
    const candidate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), day));
    if (candidate.getTime() <= today.getTime()) return candidate;
    return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, day));
  }

  const targetDow = ((Math.round(dayOfPeriod) % 7) + 7) % 7;
  const todayDow = today.getUTCDay();
  let offset = (todayDow - targetDow + 7) % 7;
  let candidate = new Date(today);
  candidate.setUTCDate(candidate.getUTCDate() - offset);

  if (cadence === "fortnightly") {
    const anchorMidnight = startOfDayUTC(anchor);
    const msPerDay = 24 * 60 * 60 * 1000;
    const weeksFromAnchor = Math.floor((candidate.getTime() - anchorMidnight.getTime()) / (7 * msPerDay));
    if (((weeksFromAnchor % 2) + 2) % 2 !== 0) {
      candidate = new Date(candidate);
      candidate.setUTCDate(candidate.getUTCDate() - 7);
    }
  }

  return candidate;
}

/** Anchor-aware wrapper: null when no occurrence has been scheduled yet. */
export function computeCurrentOccurrence(
  cadence: Cadence,
  dayOfPeriod: number,
  anchor: Date,
  now: Date,
): Date | null {
  const candidate = computeLastScheduledDateRaw(cadence, dayOfPeriod, anchor, now);
  return candidate.getTime() < startOfDayUTC(anchor).getTime() ? null : candidate;
}

export interface DueStateInput {
  cadence: string;
  dayOfPeriod: number;
  anchorDate: Date;
  lastConfirmedAt: Date | null;
  lastSkippedAt?: Date | null;
}

/**
 * The occurrence a template is currently due for, or null when it is not
 * due. Confirming OR skipping the current occurrence both silence it until
 * the next scheduled occurrence, and a template whose first occurrence is
 * still in the future is never due.
 */
export function dueOccurrence(row: DueStateInput, now: Date): Date | null {
  const cadence = isValidCadence(row.cadence) ? row.cadence : "weekly";
  const lastScheduled = computeCurrentOccurrence(cadence, row.dayOfPeriod, row.anchorDate, now);
  if (lastScheduled === null) return null;
  const handledAt = Math.max(
    row.lastConfirmedAt ? row.lastConfirmedAt.getTime() : 0,
    row.lastSkippedAt ? row.lastSkippedAt.getTime() : 0,
  );
  if (handledAt >= lastScheduled.getTime()) return null;
  return lastScheduled.getTime() <= startOfDayUTC(now).getTime() ? lastScheduled : null;
}
