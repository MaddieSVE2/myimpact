/**
 * The monthly email asking members whether they have anything to add to
 * their record this month (jobs/monthlyActivityPrompt.ts). When the activity
 * inbox reads members' emails, it invites a reply, which is logged like any
 * other email to the inbox (lib/emailActivityInbox.ts); otherwise it only
 * links to the app. The email itself never logs anything.
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

export interface MonthlyPromptContext {
  displayName: string | null;
  appUrl: string;
  locale?: EmailLocale;
  /** The month being asked about, in the email's language: "November". */
  month: string;
  /** True when a reply to this email is read and added to their record. */
  canReply: boolean;
  /** Frontend page that switches these monthly emails off. */
  unsubscribeUrl: string;
}

const COPY = {
  en: {
    subject: (month: string) => `Anything to add for ${month}?`,
    intro: (month: string) =>
      `Have you done anything for others in ${month} that isn't on your My Impact record yet? Volunteering, helping a neighbour, a donation, a fundraiser: it all counts.`,
    reply:
      'The quickest way to add it is to reply to this email and tell me what you did, when, and roughly how long it took. For example: "I helped at the food bank on Saturday for 3 hours." I\'ll add it to your record and let you know.',
    orLog: "Or add it in My Impact:",
    logOnly: "It only takes a minute or two to add it in My Impact:",
    cta: "Add an activity",
    nothing: "Nothing to add this month? No need to do anything.",
    footer: "You're getting this monthly email because you have a My Impact account.",
    stop: "Stop these monthly emails with one click",
    or: "or",
    manage: "manage email preferences",
  },
  cy: {
    subject: (month: string) => `Unrhyw beth i'w ychwanegu ar gyfer mis ${month}?`,
    intro: (month: string) =>
      `Ydych chi wedi gwneud rhywbeth dros eraill ym mis ${month} sydd heb ei gofnodi yn My Impact eto? Gwirfoddoli, helpu cymydog, rhoi arian, codi arian: mae'r cyfan yn cyfrif.`,
    reply:
      'Y ffordd gyflymaf yw ateb yr e-bost hwn a dweud wrthyf beth wnaethoch chi, pryd, a thua faint o amser gymerodd. Er enghraifft: "Bues i\'n helpu yn y banc bwyd ddydd Sadwrn am 3 awr." Byddaf yn ei ychwanegu at eich cofnod ac yn rhoi gwybod i chi.',
    orLog: "Neu ychwanegwch ef yn My Impact:",
    logOnly: "Dim ond munud neu ddwy mae'n ei gymryd i'w ychwanegu yn My Impact:",
    cta: "Ychwanegu gweithgaredd",
    nothing: "Dim byd i'w ychwanegu y mis hwn? Does dim angen gwneud dim.",
    footer: "Rydych yn derbyn yr e-bost misol hwn oherwydd bod gennych gyfrif My Impact.",
    stop: "Atal yr e-byst misol hyn gydag un clic",
    or: "neu",
    manage: "rheoli dewisiadau e-bost",
  },
};

/** The month `now` falls in, in UK time and the email's language: "November", "Tachwedd". */
export function promptMonth(now: Date, locale: EmailLocale = "en"): string {
  return new Intl.DateTimeFormat(locale === "cy" ? "cy-GB" : "en-GB", { month: "long", timeZone: "Europe/London" }).format(now);
}

export function buildMonthlyPromptEmail(ctx: MonthlyPromptContext): { subject: string; html: string; text: string } {
  const c = COPY[ctx.locale ?? "en"];
  const logUrl = `${ctx.appUrl}/log`;
  const lead = ctx.canReply ? c.orLog : c.logOnly;
  const p = (body: string, margin = "0 0 16px") => `<p style="font-size:16px;line-height:1.6;margin:${margin};">${body}</p>`;

  const html = `${shellOpen()}
    ${logoBlock(ctx.appUrl)}
    ${p(greeting(ctx.displayName, ctx.locale))}
    ${p(escapeHtml(c.intro(ctx.month)))}
    ${ctx.canReply ? p(escapeHtml(c.reply)) : ""}
    ${p(escapeHtml(lead), "0 0 12px")}
    <p style="margin:0 0 24px;">${ctaButton(logUrl, c.cta)}</p>
    ${p(escapeHtml(c.nothing), "0 0 8px")}
    <hr style="border:none;border-top:1px solid ${BORDER};margin:32px 0 16px;" />
    <p style="color:${MUTED};font-size:12px;line-height:1.6;margin:0;">
      ${escapeHtml(c.footer)} <a href="${ctx.unsubscribeUrl}" style="color:${MUTED};text-decoration:underline;">${c.stop}</a> ${c.or} <a href="${ctx.appUrl}/settings" style="color:${MUTED};text-decoration:underline;">${c.manage}</a>.
    </p>
  </div>`;

  const name = ctx.displayName?.trim();
  const text = [
    ctx.locale === "cy" ? (name ? `Helo ${name},` : "Helo,") : name ? `Hi ${name},` : "Hi there,",
    "",
    c.intro(ctx.month),
    ...(ctx.canReply ? ["", c.reply] : []),
    "",
    `${lead} ${logUrl}`,
    "",
    c.nothing,
    "",
    `${c.footer} ${c.stop}: ${ctx.unsubscribeUrl}`,
  ].join("\n");

  return { subject: c.subject(ctx.month), html, text };
}
