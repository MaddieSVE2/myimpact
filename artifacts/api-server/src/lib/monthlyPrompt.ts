/**
 * Who gets the monthly "anything to add?" email (jobs/
 * monthlyActivityPrompt.ts). No database or network access, so it can be
 * tested directly.
 *
 * Two settings decide whether anything is sent:
 *   EMAIL_MONTHLY_PROMPT_LIVE=true   every eligible member is emailed.
 *   EMAIL_MONTHLY_PROMPT_TEST_TO     comma-separated account addresses. Until
 *                                    it is live, only these are emailed, so
 *                                    the real email can be read first.
 * With neither, the job sends nothing.
 */

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

export interface MonthlyPromptSettings {
  /** Every eligible member is emailed. */
  live: boolean;
  /** Accounts emailed while it is not live. */
  testTo: string[];
}

export function monthlyPromptSettings(env: NodeJS.ProcessEnv = process.env): MonthlyPromptSettings {
  return {
    live: (env.EMAIL_MONTHLY_PROMPT_LIVE ?? "").trim().toLowerCase() === "true",
    testTo: (env.EMAIL_MONTHLY_PROMPT_TEST_TO ?? "")
      .split(",")
      .map((a) => a.trim().toLowerCase())
      .filter((a) => EMAIL_RE.test(a)),
  };
}

/** Accounts newer than this are left to the onboarding emails. */
export const NEW_ACCOUNT_DAYS = 14;

export interface PromptCandidate {
  email: string;
  /** users.email_activity_prompt_opt_in: false once they have opted out. */
  optIn: boolean;
  createdAt: Date;
  /** When this email last went to them. */
  lastSentAt: Date | null;
}

export type PromptDecision = { send: true } | { send: false; reason: string };

/**
 * Whether `user` is emailed in this run. A test run goes only to the listed
 * accounts, whatever their preference or history, because someone asked to
 * see it. A live run goes to every member who has not opted out, has had an
 * account for a while and has not had this month's email. Demo accounts and
 * addresses that bounce or complained are never emailed.
 */
export function decidePrompt(
  user: PromptCandidate,
  opts: {
    settings: MonthlyPromptSettings;
    now: Date;
    /** Start of the month being asked about. */
    monthStart: Date;
    isSuppressed: (email: string) => boolean;
    isDemo: (email: string) => boolean;
  },
): PromptDecision {
  const email = user.email.trim().toLowerCase();
  if (opts.isDemo(email)) return { send: false, reason: "demo account" };
  if (opts.isSuppressed(email)) return { send: false, reason: "address can't be delivered to" };
  if (!opts.settings.live) {
    return opts.settings.testTo.includes(email) ? { send: true } : { send: false, reason: "not live" };
  }
  if (!user.optIn) return { send: false, reason: "opted out" };
  if (user.lastSentAt && user.lastSentAt.getTime() >= opts.monthStart.getTime()) {
    return { send: false, reason: "already sent this month" };
  }
  if (opts.now.getTime() - user.createdAt.getTime() < NEW_ACCOUNT_DAYS * 24 * 60 * 60 * 1000) {
    return { send: false, reason: "new account" };
  }
  return { send: true };
}
