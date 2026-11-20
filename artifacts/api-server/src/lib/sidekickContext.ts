/**
 * Builds the per-request context message for Sidekick chat: who is asking
 * (an individual, or a manager speaking for their organisation) and the
 * figures that go with that.
 *
 * The two framings are kept strictly apart. A request is either about one
 * person's own impact or about an organisation's collective impact, never a
 * blend: mixing a personal score into an organisation request is what makes
 * replies sound unsure who they are talking to.
 */

export interface SidekickOrgContext {
  name?: unknown;
  periodLabel?: unknown;
  totalSocialValue?: unknown;
  totalHours?: unknown;
  people?: unknown;
}

export interface SidekickChatContext {
  totalValue?: number;
  activities?: string[];
  sdgs?: string[];
  interests?: string[];
  situation?: string;
  locale?: string;
  /** Organisation dashboard totals, sent only in organisation mode. */
  org?: SidekickOrgContext;
}

const MAX_ORG_NAME_CHARS = 120;
const MAX_PERIOD_LABEL_CHARS = 60;
const MAX_FIGURE = 1e12;

/** Single-line plain text, safe to place inside a system message. */
function cleanText(value: unknown, maxChars: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxChars);
  return cleaned.length > 0 ? cleaned : null;
}

function cleanFigure(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < 0 || value > MAX_FIGURE) return null;
  return value;
}

const whole = (n: number) => Math.round(n).toLocaleString("en-GB");

function orgManagerLine(orgName: string | null): string {
  const who = orgName
    ? `This user is an organisation manager at ${orgName}`
    : "This user is an organisation manager";
  return (
    `${who} — someone who runs or coordinates a charity, voluntary group, or community organisation and uses My Impact to manage volunteers and report collective impact. ` +
    "They are speaking for the organisation, not about their own activity. When they say 'we', 'our', or 'us' they mean the organisation and its volunteers. When they say 'I' or 'me' they mean themselves as its manager, not as an individual volunteer. " +
    "Do not refer to a personal score, and do not ask them to generate one. " +
    "Their questions are likely to be about the organisation dashboard, funder reporting, getting volunteers to adopt the platform, and responding to trustee or governance scrutiny. " +
    "Use the FUNDER REPORTING GUIDANCE, VOLUNTEER ONBOARDING GUIDANCE, and trustee sections of your instructions when relevant. Do not default to individual-user framing."
  );
}

function orgFiguresLine(org: SidekickOrgContext | undefined): string {
  const value = cleanFigure(org?.totalSocialValue);
  const hours = cleanFigure(org?.totalHours);
  const people = cleanFigure(org?.people);
  const period = cleanText(org?.periodLabel, MAX_PERIOD_LABEL_CHARS);

  const facts: string[] = [];
  if (value !== null && value > 0) facts.push(`£${whole(value)} total social value`);
  if (hours !== null && hours > 0) facts.push(`${whole(hours)} hours of activity`);
  if (people !== null && people > 0) {
    facts.push(`${whole(people)} ${Math.round(people) === 1 ? "person" : "people"} taking part`);
  }

  if (facts.length === 0) {
    if (org && value !== null) {
      return (
        `The organisation's My Impact dashboard has no activity recorded${period ? ` for ${period}` : ""} yet. ` +
        "Say so plainly if figures are needed, and ask the manager for any facts they can supply. Do not invent figures."
      );
    }
    return (
      "No dashboard figures were supplied with this request. Use any figures the manager gives in their own message. " +
      "If more are needed, ask the manager for them or point them to the organisation dashboard. Do not invent figures."
    );
  }

  return (
    `The organisation's My Impact dashboard${period ? ` for ${period}` : ""} shows ${facts.join(", ")}. ` +
    "These are the organisation's collective figures, not one person's. Use them directly when drafting or summarising instead of asking for them. " +
    "Ask only for facts the platform does not hold, such as who benefited or what changed as a result."
  );
}

/** How the caller's organisation shares member data, read from the database. */
export type OrgSharingMode = "explicit_submission" | "consented_logging";

const SHARING_MODE_NAMES: Record<OrgSharingMode, string> = {
  explicit_submission: "explicit submission",
  consented_logging: "consented logging",
};

/**
 * Tells Sidekick which organisation rules apply to this person, so a
 * question about who can see their data gets the answer for their own
 * organisation rather than a general one.
 */
function sharingModeLine(mode: OrgSharingMode, asManager: boolean): string {
  const kind = SHARING_MODE_NAMES[mode];
  if (asManager) {
    return `This organisation uses ${kind}. If asked what the organisation can see of its members, answer from WHAT AN ORGANISATION CAN SEE OF ITS MEMBERS using the ${kind} rules.`;
  }
  return (
    `This person belongs to an organisation on My Impact that uses ${kind}. ` +
    `If they ask who can see their score, activities or data, answer from WHAT AN ORGANISATION CAN SEE OF ITS MEMBERS using the ${kind} rules. ` +
    "That is the one case where you should talk about their organisation."
  );
}

/**
 * Returns the context system message for this request, or null when there
 * is nothing to say (no client context and no organisation).
 *
 * `sharingMode` is set when the signed-in caller belongs to an organisation.
 */
export function buildSidekickContextMessage(
  context: SidekickChatContext | undefined | null,
  sharingMode?: OrgSharingMode,
): string | null {
  if (!context) return sharingMode ? sharingModeLine(sharingMode, false) : null;
  const contextParts: string[] = [];

  if (context.interests?.includes("org_manager")) {
    contextParts.push(orgManagerLine(cleanText(context.org?.name, MAX_ORG_NAME_CHARS)));
    contextParts.push(orgFiguresLine(context.org));
    if (sharingMode) contextParts.push(sharingModeLine(sharingMode, true));
    return contextParts.join(" ");
  }

  if (context.totalValue !== undefined) {
    contextParts.push(`The user's current social value score is £${context.totalValue.toLocaleString("en-GB")}.`);
  }
  if (context.activities?.length) {
    contextParts.push(`Their logged activities include: ${context.activities.join(", ")}.`);
  }
  if (context.sdgs?.length) {
    contextParts.push(`Their activities align with these SDGs: ${context.sdgs.join(", ")}.`);
  }
  if (context.interests?.includes("military")) {
    contextParts.push("This user has a military or forces service background. When helping with CV or interview preparation, translate any military experience into civilian-friendly language and frame their skills (leadership, logistics, crisis management, cross-cultural communication, training) in terms a civilian employer will immediately recognise.");
  }
  if (context.interests?.includes("career_break")) {
    contextParts.push("This user is returning to work after a career break. Their break may have involved caring responsibilities, redundancy, a period of poor mental health, or other difficult life circumstances. When helping with CV or interview preparation, frame their career break as a period of active contribution rather than absence, and help them present it positively without over-explaining. If they express doubt or low confidence about what they have been doing, lead with acknowledgment of how that feels before moving to practical help.");
  }
  if (context.situation === "apprenticeship" || context.interests?.includes("apprenticeship")) {
    contextParts.push("This user is applying for an apprenticeship. When helping them, focus on how their community activity and volunteering can be framed as direct evidence of what apprenticeship assessors look for: commitment, reliability, teamwork, and initiative. Help them translate their logged activities into supporting statement language. If they ask whether My Impact will help them get an apprenticeship, be honest — it does not guarantee a place but gives them something specific and evidenced to reference in their application, which is a concrete advantage over making a vague claim.");
  }
  contextParts.push("This user is asking as an individual about their own personal impact. Talk to them about their own activities, hours, and evidence. For applications, follow the APPLICATION-WRITING SAFETY rules and help them plan wording they will write themselves. LinkedIn posts, interview practice, and DofE records remain allowed. Do not frame answers around running, leading, or managing an organisation. Do not mention funders, trustees, the board, volunteer onboarding, the organisation dashboard, 'your volunteers', 'your charity', 'your organisation', or 'your members'. Do not suggest activities that imply the user is in charge of other volunteers (such as 'coordinate a group of volunteers', 'train your team', 'organise events for your charity'). If the user explicitly says in their message that they are asking on behalf of a charity, voluntary group, or organisation they manage, you may switch to organisation-manager framing for that message — otherwise keep everything firmly focused on what THIS PERSON does.");
  if (sharingMode) contextParts.push(sharingModeLine(sharingMode, false));

  return contextParts.join(" ");
}
