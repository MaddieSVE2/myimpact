import type { Resend } from "resend";

export type OnboardingStep = 1 | 7 | 30;

export const ONBOARDING_STEPS: readonly OnboardingStep[] = [1, 7, 30] as const;

export interface OnboardingContext {
  email: string;
  displayName: string | null;
  appUrl: string;
}

export interface OnboardingActivity {
  totalHours: number;
  totalValue: number;
  recordCount: number;
  topCategoryLabel: string | null;
}

const ORANGE = "#F06127";
const TEXT = "#213547";
const MUTED = "#6b7280";
const BORDER = "#e5e7eb";

function logoBlock(appUrl: string): string {
  return `<img src="${appUrl}/images/myimpact.png" alt="My Impact" style="height:48px;margin-bottom:24px;" />`;
}

function shellOpen(): string {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:${TEXT};">`;
}

function shellClose(appUrl: string): string {
  return `
    <hr style="border:none;border-top:1px solid ${BORDER};margin:32px 0 16px;" />
    <p style="color:${MUTED};font-size:12px;line-height:1.6;margin:0;">
      You're receiving onboarding and monthly digest emails from My Impact.
      <a href="${appUrl}/settings" style="color:${MUTED};text-decoration:underline;">Manage email preferences</a>.
    </p>
  </div>`;
}

function ctaButton(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:${ORANGE};color:white;font-weight:700;padding:14px 28px;border-radius:8px;text-decoration:none;font-size:15px;">${label}</a>`;
}

function greeting(displayName: string | null): string {
  const name = displayName?.trim();
  return name ? `Hi ${escapeHtml(name)},` : "Hi there,";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function gbp(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

// ---------------------------------------------------------------------------
// Day 1 — Welcome
// ---------------------------------------------------------------------------
export function buildDay1Email(ctx: OnboardingContext): { subject: string; html: string } {
  const subject = "Welcome to My Impact";
  const html = `
    ${shellOpen()}
    ${logoBlock(ctx.appUrl)}
    <h2 style="margin:0 0 12px;font-size:22px;">${greeting(ctx.displayName)}</h2>
    <p style="line-height:1.6;margin:0 0 16px;">
      Welcome to My Impact, and thanks for signing up. Your account is ready to go.
    </p>
    <p style="line-height:1.6;margin:0 0 24px;">
      My Impact is a free way to capture the volunteering, caring and good things you do, then turn them
      into a number you can share — your social value. The more you log, the clearer the picture, and the
      easier it becomes to point at it on a CV, a UCAS form or a funding bid.
    </p>
    <p style="margin:0 0 24px;">
      ${ctaButton(`${ctx.appUrl}/wizard`, "Log your first activity")}
    </p>
    <p style="color:${MUTED};line-height:1.6;margin:0;font-size:14px;">
      Takes about two minutes. We'll save it to your profile and you can come back any time to add more.
    </p>
    ${shellClose(ctx.appUrl)}
  `;
  return { subject, html };
}

// ---------------------------------------------------------------------------
// Day 7 — Active vs gentle
// ---------------------------------------------------------------------------
export function buildDay7ActiveEmail(
  ctx: OnboardingContext,
  activity: OnboardingActivity
): { subject: string; html: string } {
  const subject = "Look what you've already done";
  const lines: string[] = [];
  lines.push(`<li style="margin:6px 0;"><strong>${activity.recordCount}</strong> ${activity.recordCount === 1 ? "thing" : "things"} logged</li>`);
  if (activity.totalHours > 0) {
    lines.push(`<li style="margin:6px 0;"><strong>${activity.totalHours}</strong> ${activity.totalHours === 1 ? "hour" : "hours"} of your time captured</li>`);
  }
  if (activity.totalValue > 0) {
    lines.push(`<li style="margin:6px 0;"><strong>${gbp(activity.totalValue)}</strong> in social value created</li>`);
  }
  if (activity.topCategoryLabel) {
    lines.push(`<li style="margin:6px 0;">Most of it sits under <strong>${escapeHtml(activity.topCategoryLabel)}</strong></li>`);
  }

  const html = `
    ${shellOpen()}
    ${logoBlock(ctx.appUrl)}
    <h2 style="margin:0 0 12px;font-size:22px;">${greeting(ctx.displayName)}</h2>
    <p style="line-height:1.6;margin:0 0 16px;">
      You've made a strong start. Here's what your first week looks like:
    </p>
    <ul style="line-height:1.7;margin:0 0 24px;padding-left:20px;">
      ${lines.join("")}
    </ul>
    <p style="line-height:1.6;margin:0 0 24px;">
      Keep going — small things add up fast, and a streak of even one entry a week starts to look like
      something proper after a month.
    </p>
    <p style="margin:0 0 8px;">
      ${ctaButton(`${ctx.appUrl}/wizard`, "Add another activity")}
    </p>
    ${shellClose(ctx.appUrl)}
  `;
  return { subject, html };
}

export function buildDay7GentleEmail(ctx: OnboardingContext): { subject: string; html: string } {
  const subject = "Still here whenever you're ready";
  const html = `
    ${shellOpen()}
    ${logoBlock(ctx.appUrl)}
    <h2 style="margin:0 0 12px;font-size:22px;">${greeting(ctx.displayName)}</h2>
    <p style="line-height:1.6;margin:0 0 16px;">
      No pressure — your account is sat there waiting whenever you've got two minutes.
    </p>
    <p style="line-height:1.6;margin:0 0 24px;">
      Most people start with one small thing they already do — a regular volunteering shift, helping a
      neighbour, looking after a relative, raising money. The wizard takes you through it step by step
      and turns it into a number you can actually point at.
    </p>
    <p style="margin:0 0 8px;">
      ${ctaButton(`${ctx.appUrl}/wizard`, "Log your first activity")}
    </p>
    ${shellClose(ctx.appUrl)}
  `;
  return { subject, html };
}

// ---------------------------------------------------------------------------
// Day 30 — Look how far you've come
// ---------------------------------------------------------------------------
export function buildDay30Email(
  ctx: OnboardingContext,
  activity: OnboardingActivity
): { subject: string; html: string } {
  const subject = "Your first month on My Impact";
  const stats: string[] = [];
  if (activity.recordCount > 0) {
    stats.push(`<li style="margin:6px 0;"><strong>${activity.recordCount}</strong> ${activity.recordCount === 1 ? "activity" : "activities"} logged</li>`);
  }
  if (activity.totalHours > 0) {
    stats.push(`<li style="margin:6px 0;"><strong>${activity.totalHours}</strong> ${activity.totalHours === 1 ? "hour" : "hours"} of contribution</li>`);
  }
  if (activity.totalValue > 0) {
    stats.push(`<li style="margin:6px 0;"><strong>${gbp(activity.totalValue)}</strong> of social value</li>`);
  }
  if (activity.topCategoryLabel) {
    stats.push(`<li style="margin:6px 0;">Strongest area: <strong>${escapeHtml(activity.topCategoryLabel)}</strong></li>`);
  }

  const statsBlock = stats.length
    ? `<ul style="line-height:1.7;margin:0 0 24px;padding-left:20px;">${stats.join("")}</ul>`
    : `<p style="line-height:1.6;margin:0 0 24px;">You haven't added anything yet — but you can start in two minutes.</p>`;

  const html = `
    ${shellOpen()}
    ${logoBlock(ctx.appUrl)}
    <h2 style="margin:0 0 12px;font-size:22px;">${greeting(ctx.displayName)}</h2>
    <p style="line-height:1.6;margin:0 0 16px;">
      A month in. Here's the picture so far:
    </p>
    ${statsBlock}
    <p style="line-height:1.6;margin:0 0 16px;">
      A lot of people get to this point and realise they've been doing more than they thought. Two ways to
      make it work harder for you:
    </p>
    <ol style="line-height:1.7;margin:0 0 24px;padding-left:20px;">
      <li style="margin:6px 0;">Turn on your <a href="${ctx.appUrl}/settings" style="color:${ORANGE};">public profile</a> so you can share a single link.</li>
      <li style="margin:6px 0;">Pick one milestone and share it — a CV bullet, a LinkedIn post, a sentence in a UCAS form.</li>
    </ol>
    <p style="margin:0 0 8px;">
      ${ctaButton(`${ctx.appUrl}/milestones`, "See your milestones")}
    </p>
    ${shellClose(ctx.appUrl)}
  `;
  return { subject, html };
}

// ---------------------------------------------------------------------------
// Send helper
// ---------------------------------------------------------------------------
export async function sendOnboardingEmail(
  client: Resend,
  fromEmail: string,
  to: string,
  subject: string,
  html: string
): Promise<void> {
  const { error } = await client.emails.send({ from: fromEmail, to, subject, html });
  if (error) {
    throw new Error(`Resend error: ${JSON.stringify(error)}`);
  }
}
