/**
 * The email sent on the day a member's regular activities are due
 * (jobs/activityReminders.ts). One email lists every activity due that day.
 * The button opens My Impact, where the due prompt logs or skips each one;
 * the email itself never logs anything, because mail scanners follow links.
 */
import {
  BORDER,
  MUTED,
  ctaButton,
  escapeHtml,
  greeting,
  logoBlock,
  shellOpen,
  type EmailLocale,
} from "./onboardingEmails.js";

export interface DueActivity {
  label: string;
  cadence: string;
}

export interface ActivityReminderContext {
  displayName: string | null;
  appUrl: string;
  locale?: EmailLocale;
  /** Frontend page that switches activity reminders off. */
  unsubscribeUrl: string;
}

const COPY = {
  en: {
    subjectOne: (label: string) => `Reminder: ${label} today`,
    subjectMany: (n: number) => `Reminder: ${n} regular activities today`,
    introOne: "You set this up as a regular activity, and it's on for today:",
    introMany: "You set these up as regular activities, and they're on for today:",
    body: "When you've done it, log it in My Impact with one tap. If it didn't happen this time, you can skip it there.",
    cta: "Log it in My Impact",
    cadence: { weekly: "every week", fortnightly: "every two weeks", monthly: "every month" } as Record<string, string>,
    footer: "You're getting this because you set up a regular activity in My Impact.",
    stop: "Stop activity reminders with one click",
    or: "or",
    manage: "manage email preferences",
  },
  cy: {
    subjectOne: (label: string) => `Nodyn atgoffa: ${label} heddiw`,
    subjectMany: (n: number) => `Nodyn atgoffa: ${n} gweithgaredd rheolaidd heddiw`,
    introOne: "Rydych wedi gosod hwn fel gweithgaredd rheolaidd, ac mae ar gyfer heddiw:",
    introMany: "Rydych wedi gosod y rhain fel gweithgareddau rheolaidd, ac maen nhw ar gyfer heddiw:",
    body: "Pan fyddwch wedi'i wneud, cofnodwch ef yn My Impact gydag un tap. Os na ddigwyddodd y tro hwn, gallwch ei hepgor yno.",
    cta: "Cofnodi yn My Impact",
    cadence: { weekly: "bob wythnos", fortnightly: "bob pythefnos", monthly: "bob mis" } as Record<string, string>,
    footer: "Rydych yn derbyn hwn oherwydd i chi osod gweithgaredd rheolaidd yn My Impact.",
    stop: "Atal nodiadau atgoffa gydag un clic",
    or: "neu",
    manage: "rheoli dewisiadau e-bost",
  },
};

export function buildActivityReminderEmail(
  ctx: ActivityReminderContext,
  activities: DueActivity[],
): { subject: string; html: string; text: string } {
  const c = COPY[ctx.locale ?? "en"];
  const one = activities.length === 1;
  const subject = one ? c.subjectOne(activities[0]!.label) : c.subjectMany(activities.length);
  const line = (a: DueActivity) => `${a.label} (${c.cadence[a.cadence] ?? a.cadence})`;

  const html = `${shellOpen()}
    ${logoBlock(ctx.appUrl)}
    <p style="font-size:16px;line-height:1.6;margin:0 0 16px;">${greeting(ctx.displayName, ctx.locale)}</p>
    <p style="font-size:16px;line-height:1.6;margin:0 0 12px;">${one ? c.introOne : c.introMany}</p>
    <ul style="font-size:16px;line-height:1.6;margin:0 0 16px;padding-left:20px;">
      ${activities.map((a) => `<li><strong>${escapeHtml(a.label)}</strong> (${escapeHtml(c.cadence[a.cadence] ?? a.cadence)})</li>`).join("\n      ")}
    </ul>
    <p style="font-size:16px;line-height:1.6;margin:0 0 24px;">${c.body}</p>
    <p style="margin:0 0 8px;">${ctaButton(`${ctx.appUrl}/`, c.cta)}</p>
    <hr style="border:none;border-top:1px solid ${BORDER};margin:32px 0 16px;" />
    <p style="color:${MUTED};font-size:12px;line-height:1.6;margin:0;">
      ${c.footer} <a href="${ctx.unsubscribeUrl}" style="color:${MUTED};text-decoration:underline;">${c.stop}</a> ${c.or} <a href="${ctx.appUrl}/settings" style="color:${MUTED};text-decoration:underline;">${c.manage}</a>.
    </p>
  </div>`;

  const name = ctx.displayName?.trim();
  const text = [
    ctx.locale === "cy" ? (name ? `Helo ${name},` : "Helo,") : name ? `Hi ${name},` : "Hi there,",
    "",
    one ? c.introOne : c.introMany,
    ...activities.map((a) => `- ${line(a)}`),
    "",
    c.body,
    `${c.cta}: ${ctx.appUrl}/`,
    "",
    `${c.footer} ${c.stop}: ${ctx.unsubscribeUrl}`,
  ].join("\n");

  return { subject, html, text };
}
