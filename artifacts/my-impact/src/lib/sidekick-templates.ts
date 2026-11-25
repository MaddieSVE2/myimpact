/**
 * Sidekick prompt template library.
 *
 * Each template defines a one-tap prompt that pre-fills Sidekick with a
 * contextual request built from the user's score, top activity, persona,
 * and recent record.
 *
 * The copy lives in plain strings (`personaPrompts`) with a few
 * placeholders that get filled in at runtime:
 *   {activity} — the user's top / most recent activity
 *   {numbers}  — a sentence about their current social value score
 *   {recent}   — a sentence listing their recent activities (may be empty)
 *
 * Admins can override any label, description or persona prompt from
 * /admin/sidekick-templates — those overrides are stored in the database
 * and merged over these defaults at runtime.
 */

export type SidekickPersona =
  | "default"
  | "veteran"
  | "carer"
  | "student"
  | "apprenticeship"
  | "career_break"
  | "org_manager";

export type SidekickTemplateCategory =
  | "ucas"
  | "linkedin"
  | "cv"
  | "cover_letter"
  | "employer"
  | "dofe";

/**
 * The organisation's dashboard totals for one reporting period. Used in
 * place of the person's own score when Sidekick is in organisation mode.
 */
export interface SidekickOrgFigures {
  name?: string;
  /** e.g. "1 Jan 2026 – 31 Dec 2026" */
  periodLabel?: string;
  totalSocialValue: number;
  totalHours: number;
  /** People with activity counted in the period. */
  people: number;
}

export interface SidekickUserContext {
  totalValue?: number;
  totalHours?: number;
  topActivity?: string;
  recentActivities?: string[];
  topSdg?: string;
  persona: SidekickPersona;
  /**
   * Whether the person is signed in. Sidekick is then given their saved
   * record by the server, so a prompt can point to it instead of saying
   * there is no score when no calculation is open in this browser.
   */
  signedIn?: boolean;
  /**
   * Organisation totals, for the org_manager persona. Undefined means the
   * figures are not known (not loaded, or the request failed).
   */
  org?: SidekickOrgFigures;
}

/** Persona → prompt copy. `default` is required; others fall back to it. */
export type SidekickPersonaPrompts = Partial<Record<SidekickPersona, string>> & {
  default: string;
};

export interface SidekickTemplate {
  id: string;
  category: SidekickTemplateCategory;
  label: string;
  description: string;
  personaPrompts: SidekickPersonaPrompts;
  /**
   * Card copy shown to organisation managers in place of the heading, label
   * and description above, which are written for one person ("my impact",
   * "in interviews") and do not describe the organisation prompt.
   */
  orgCard?: SidekickTemplateCardCopy;
}

export interface SidekickTemplateCardCopy {
  heading: string;
  label: string;
  description: string;
}

/** The heading, label and description to show on a template card. */
export function templateCardCopy(
  template: SidekickTemplate,
  persona: SidekickPersona,
): SidekickTemplateCardCopy {
  if (persona === "org_manager" && template.orgCard) return template.orgCard;
  return {
    heading: SIDEKICK_CATEGORY_LABELS[template.category],
    label: template.label,
    description: template.description,
  };
}

/** A database override for a single template (all fields optional). */
export interface SidekickTemplateOverride {
  templateId: string;
  label?: string | null;
  description?: string | null;
  personaPrompts?: Partial<Record<SidekickPersona, string>> | null;
}

export const SIDEKICK_CATEGORY_LABELS: Record<SidekickTemplateCategory, string> = {
  ucas: "UCAS personal statement",
  linkedin: "LinkedIn post",
  cv: "CV bullet",
  cover_letter: "Cover letter line",
  employer: "Employer one-liner",
  dofe: "DofE write-up",
};

export const SIDEKICK_PERSONA_LABELS: Record<SidekickPersona, string> = {
  default: "Default",
  student: "Student",
  veteran: "Veteran / forces",
  carer: "Unpaid carer",
  apprenticeship: "Apprenticeship",
  career_break: "Career break",
  org_manager: "Organisation manager",
};

// ---- helpers ------------------------------------------------------------

const POUNDS = (n?: number) =>
  typeof n === "number" && n > 0 ? `£${Math.round(n).toLocaleString("en-GB")}` : "(no score yet)";

/**
 * Longest message Sidekick accepts from a person. Must equal the server's
 * MAX_USER_MESSAGE_CHARS (api-server `lib/sidekickHistory.ts`); a test
 * checks the two match and that every template fits inside it.
 */
export const SIDEKICK_MAX_MESSAGE_CHARS = 1000;

// Activities described in a person's own words can be any length. Cut them
// so a template prompt can never grow past the message limit.
const MAX_ACTIVITY_NAME_CHARS = 60;
const SHORT = (name: string) =>
  name.length > MAX_ACTIVITY_NAME_CHARS ? `${name.slice(0, MAX_ACTIVITY_NAME_CHARS - 1).trimEnd()}…` : name;

const ACTIVITY = (ctx: SidekickUserContext) =>
  SHORT(ctx.topActivity ?? ctx.recentActivities?.[0] ?? "my volunteering");

const HAS_SCORE = (ctx: SidekickUserContext) =>
  typeof ctx.totalValue === "number" && ctx.totalValue > 0;

const HOURS_LINE = (ctx: SidekickUserContext) =>
  ctx.totalHours && ctx.totalHours > 0
    ? ` (about ${Math.round(ctx.totalHours)} hours logged)`
    : "";

// With no calculation open in this browser, a signed-in person still has
// their saved record, which the server gives to Sidekick with each message.
// The figures are deliberately not fetched into the prompt: the server reads
// them itself, so they cannot be out of date or altered on the way. This
// sentence must stay no longer than the "no score" one, so that swapping it
// in can never push a prompt past the message limit.
const NUMBERS_LINE = (ctx: SidekickUserContext) =>
  HAS_SCORE(ctx)
    ? `My current My Impact total social value is ${POUNDS(ctx.totalValue)}${HOURS_LINE(ctx)}.`
    : ctx.signedIn
      ? `Use the activities, hours and social value in my saved record, and ask me for anything else.`
      : `I have not generated a score yet, so focus on the activity and ask me for any facts you need.`;

const RECENT_LINE = (ctx: SidekickUserContext) => {
  const acts = ctx.recentActivities ?? [];
  if (acts.length === 0) return "";
  const list = acts.slice(0, 3).map(SHORT).join(", ");
  return ` My most recent logged activities are: ${list}.`;
};

const JOIN_LIST = (items: string[]) =>
  items.length <= 1
    ? items.join("")
    : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

/**
 * The organisation version of the {numbers} sentence. It never mentions the
 * manager's own score: an organisation prompt followed by "I have not
 * generated a score yet" reads as two different people asking.
 */
const ORG_NUMBERS_LINE = (ctx: SidekickUserContext) => {
  const org = ctx.org;
  if (!org) {
    return `I do not have our dashboard figures to hand, so ask me for any facts you need.`;
  }
  const period = org.periodLabel ? ` for ${org.periodLabel}` : "";
  const facts: string[] = [];
  if (org.totalSocialValue > 0) facts.push(`${POUNDS(org.totalSocialValue)} of social value`);
  if (org.totalHours > 0) {
    facts.push(`about ${Math.round(org.totalHours).toLocaleString("en-GB")} hours of activity`);
  }
  if (facts.length === 0) {
    return `Our My Impact dashboard has no activity recorded${period} yet, so ask me for any facts you need.`;
  }
  if (org.people > 0) {
    facts.push(
      `${Math.round(org.people).toLocaleString("en-GB")} ${org.people === 1 ? "person" : "people"} taking part`,
    );
  }
  return `Our My Impact dashboard${period} shows ${JOIN_LIST(facts)}.`;
};

/** Fill {activity}/{numbers}/{recent} placeholders in a prompt string. */
export function fillTemplatePlaceholders(prompt: string, ctx: SidekickUserContext): string {
  // Organisation prompts speak for the organisation, so the manager's own
  // activities and score must not be mixed into them.
  if (ctx.persona === "org_manager") {
    return prompt
      .replaceAll("{activity}", "our volunteers' activity")
      .replaceAll("{numbers}", ORG_NUMBERS_LINE(ctx))
      .replaceAll("{recent}", "");
  }
  return prompt
    .replaceAll("{activity}", ACTIVITY(ctx))
    .replaceAll("{numbers}", NUMBERS_LINE(ctx))
    .replaceAll("{recent}", RECENT_LINE(ctx));
}

/** Pick the persona variant (falling back to default) and fill placeholders. */
export function buildTemplatePrompt(template: SidekickTemplate, ctx: SidekickUserContext): string {
  const raw = template.personaPrompts[ctx.persona] ?? template.personaPrompts.default;
  return fillTemplatePlaceholders(raw, ctx);
}

// ---- templates ----------------------------------------------------------

export const SIDEKICK_TEMPLATES: SidekickTemplate[] = [
  // ─── UCAS personal statement ────────────────────────────────────────
  {
    id: "ucas_paragraph",
    category: "ucas",
    label: "Evidence for my UCAS statement",
    description: "Choose facts and reflection questions, then write it in your own voice.",
    personaPrompts: {
      default: `Help me choose factual evidence and reflection points for a UCAS personal statement about {activity}. {numbers}{recent} Do not write the statement for me. Ask useful questions and give me a short outline so I can write it in my own voice.`,
      veteran: `Help me identify factual evidence from {activity} for my UCAS personal statement. {numbers}{recent} I'm a veteran / forces background applicant, so suggest plain civilian descriptions of relevant skills, but do not write submission-ready wording. Ask questions and give me an outline to write in my own voice.`,
      carer: `Help me identify factual evidence and reflection points from unpaid caring and {activity} for my UCAS personal statement. {numbers}{recent} Focus on coordination, advocacy and resilience without over-claiming. Do not write the statement for me; help me plan my own wording.`,
      career_break: `Help me select factual evidence from {activity} for a UCAS personal statement as a mature applicant returning after a career break. {numbers}{recent} Give me questions and a short structure, not submission-ready wording.`,
      apprenticeship: `Help me choose evidence from {activity} for an apprenticeship supporting statement. {numbers}{recent} Identify examples of commitment, reliability and teamwork, then give me questions and an outline so I can write it myself.`,
    },
  },

  // ─── LinkedIn post ──────────────────────────────────────────────────
  {
    id: "linkedin_post",
    category: "linkedin",
    label: "LinkedIn post about my impact",
    description: "A short, sharable post about what you've contributed.",
    orgCard: {
      heading: "LinkedIn post",
      label: "LinkedIn post about our volunteers' impact",
      description: "A short, sharable post celebrating what your volunteers have contributed.",
    },
    personaPrompts: {
      default: `Please write a short LinkedIn post (around 100 words, 3 short paragraphs) about the social value I've created through {activity}. {numbers}{recent} Specific, plain English, no humblebrag. British English, first person, no emojis, no hashtags.`,
      veteran: `Please write a short LinkedIn post (around 100 words, 3 short paragraphs) about the social value I've created through {activity}. {numbers}{recent} I'm a forces veteran, frame the leadership and teamwork side without jargon. End with a single quiet line, not a call to action. British English, first person, no emojis, no hashtags.`,
      carer: `Please write a short LinkedIn post (around 100 words) about the contribution I've made through {activity} alongside being an unpaid carer. {numbers}{recent} Be matter-of-fact, not heroic. British English, first person, no emojis, no hashtags.`,
      org_manager: `Please draft a short LinkedIn post (around 100 words) on behalf of our organisation, celebrating the collective impact our volunteers have created. {numbers} Highlight what the figures mean for the people we support, not just the headline number. British English, warm but credible tone, no emojis, no hashtags.`,
      career_break: `Please write a short LinkedIn post (around 100 words) for someone returning to work after a career break, talking about the contribution I've made through {activity}. {numbers}{recent} Honest and grounded, not over-polished. British English, first person, no emojis, no hashtags.`,
    },
  },

  // ─── CV bullet ──────────────────────────────────────────────────────
  {
    id: "cv_bullets",
    category: "cv",
    label: "Evidence for my CV",
    description: "Choose strong facts and outcomes to describe in your own words.",
    personaPrompts: {
      default: `Help me select three factual examples from {activity} that could support my CV. {numbers}{recent} For each, identify the action, skill and outcome, then ask me to write the final bullet in my own words.`,
      veteran: `Help me select three factual examples from {activity} for my CV. {numbers}{recent} I'm ex-forces, so explain relevant skills in plain civilian terms, but do not produce finished CV bullets. Identify action, contribution and measurable outcome for me to verify and write.`,
      carer: `Help me select three factual examples from unpaid caring and {activity} for my CV. {numbers}{recent} Identify evidence of coordination, advocacy or multi-stakeholder management without producing submission-ready bullets.`,
      career_break: `Help me select three factual examples from {activity} that evidence active contribution during my career break. {numbers}{recent} Identify action, skill and outcome so I can write accurate CV bullets in my own words.`,
      apprenticeship: `Help me select evidence from {activity} for an apprenticeship CV. {numbers}{recent} Identify examples of reliability, teamwork or initiative and questions I should answer before writing the final bullets myself.`,
    },
  },

  // ─── Cover letter line ──────────────────────────────────────────────
  {
    id: "cover_letter_line",
    category: "cover_letter",
    label: "Plan a cover-letter example",
    description: "Choose evidence and structure it before writing your own wording.",
    personaPrompts: {
      default: `Help me plan a cover-letter example using factual evidence from {activity}. {numbers} Identify the action, outcome and job-relevant skill, then give me a structure to complete in my own words. Do not write finished application text.`,
      veteran: `Help me plan a cover-letter example using {activity}. {numbers} I'm a veteran, so suggest civilian-friendly skill descriptions without acronyms, but leave the final wording for me to write.`,
      carer: `Help me plan a cover-letter example using unpaid caring and {activity}. {numbers} Identify honest, specific evidence and a structure, not finished application sentences.`,
      career_break: `Help me plan how to discuss my career break and {activity} in a cover letter. {numbers} Identify evidence and questions I should answer, then let me write the final wording myself.`,
      apprenticeship: `Help me plan a cover-letter example using {activity} as evidence of commitment and teamwork. {numbers} Give me a structure and questions, not submission-ready wording.`,
    },
  },

  // ─── Employer one-liner ─────────────────────────────────────────────
  {
    id: "employer_one_liner",
    category: "employer",
    label: "One-line summary for an employer",
    description: "A single sentence to introduce your impact in interviews.",
    orgCard: {
      heading: "Funder or trustee one-liner",
      label: "One-line summary for funders or trustees",
      description: "A single sentence on your organisation's collective volunteer impact.",
    },
    personaPrompts: {
      default: `Please give me a single sentence I can say in an interview to summarise the impact of {activity}. {numbers} Conversational, not corporate. British English, first person.`,
      veteran: `Please give me a single sentence I can say in an interview to summarise my contribution through {activity}, in plain civilian language. {numbers} British English, first person, conversational not corporate.`,
      carer: `Please give me one sentence I can say in an interview to summarise my contribution through {activity} and my caring responsibilities. {numbers} Honest and matter-of-fact. British English, first person.`,
      career_break: `Please give me one sentence I can use in an interview to summarise what I've been contributing during my career break, anchored on {activity}. {numbers} Confident, not defensive. British English, first person.`,
      org_manager: `Please give me one sentence we can use to summarise our organisation's collective volunteer impact for a funder pitch or trustee update. {numbers} Credible, plain English, no jargon. British English.`,
    },
  },

  // ─── DofE write-up ──────────────────────────────────────────────────
  {
    id: "dofe_writeup",
    category: "dofe",
    label: "DofE volunteering write-up",
    description: "A short reflection for the DofE volunteering section.",
    personaPrompts: {
      default: `Please draft a short DofE volunteering write-up (around 80 words) about {activity}: what I did, what I learned, and what difference it made. {numbers}{recent} First person, plain language, British English. No clichés.`,
      carer: `Please draft a short DofE volunteering write-up (around 80 words) about {activity}, reflecting honestly that I balance this alongside caring responsibilities. {numbers}{recent} First person, British English, plain language a DofE assessor will understand.`,
      veteran: `Please draft a short DofE-style volunteering write-up (around 80 words) about {activity}: action, learning, difference. {numbers}{recent} Plain English, first person, British English.`,
    },
  },
];

// ---- overrides ----------------------------------------------------------

const VALID_PERSONAS: SidekickPersona[] = [
  "default",
  "veteran",
  "carer",
  "student",
  "apprenticeship",
  "career_break",
  "org_manager",
];

/**
 * Merge database overrides over the in-code default templates. Overrides
 * only replace fields that are present and non-empty; unknown template ids
 * and personas are ignored.
 */
export function applyTemplateOverrides(
  templates: SidekickTemplate[],
  overrides: SidekickTemplateOverride[] | undefined | null
): SidekickTemplate[] {
  if (!overrides || overrides.length === 0) return templates;
  const byId = new Map(overrides.map((o) => [o.templateId, o]));
  return templates.map((t) => {
    // Application-writing templates are safety-controlled product copy.
    // Stored admin overrides may pre-date the own-words policy, so they must
    // never replace these labels, descriptions, or prompts.
    if (t.category === "ucas" || t.category === "cv" || t.category === "cover_letter") {
      return t;
    }
    const o = byId.get(t.id);
    if (!o) return t;
    const mergedPrompts: SidekickPersonaPrompts = { ...t.personaPrompts };
    if (o.personaPrompts) {
      for (const persona of VALID_PERSONAS) {
        const v = o.personaPrompts[persona];
        if (typeof v === "string" && v.trim().length > 0) {
          mergedPrompts[persona] = v;
        }
      }
    }
    return {
      ...t,
      label: o.label && o.label.trim().length > 0 ? o.label : t.label,
      description:
        o.description && o.description.trim().length > 0 ? o.description : t.description,
      personaPrompts: mergedPrompts,
    };
  });
}

// ---- regenerate angles --------------------------------------------------

const REGENERATE_ANGLES = [
  "This time take a different angle: lead with what changed for the people I worked with, not what I did.",
  "This time take a different angle: be more concise, cut a third of the words and keep only the most specific detail.",
  "This time take a different angle: focus on a single transferable skill rather than describing the activity.",
  "This time take a different angle: open with a concrete moment or example rather than a summary.",
  "This time take a different angle: write it more conversationally, like I'm telling a friend.",
];

// The angles above are written for one person ("what I did", "telling a
// friend"). Organisation drafts need their own so a second attempt does not
// slip back into the manager's personal voice.
const ORG_REGENERATE_ANGLES = [
  "This time take a different angle: lead with what changed for the people we support, not what our volunteers did.",
  "This time take a different angle: be more concise, cut a third of the words and keep only the most specific detail.",
  "This time take a different angle: lead with the scale of what our volunteers gave, then what it made possible.",
  "This time take a different angle: open with one concrete example of our volunteers' work rather than a summary.",
  "This time take a different angle: write it more warmly, as we would say it to our own supporters.",
];

export function buildRegeneratePrompt(
  originalPrompt: string,
  attempt: number,
  persona: SidekickPersona = "default",
): string {
  const angles = persona === "org_manager" ? ORG_REGENERATE_ANGLES : REGENERATE_ANGLES;
  const angle = angles[attempt % angles.length];
  return `${originalPrompt}\n\n${angle}`;
}

// ---- organisation mode --------------------------------------------------

/**
 * Pages about the signed-in person's own impact. A manager who opens one of
 * these is looking at their own record, so Sidekick talks to them as an
 * individual there.
 */
const PERSONAL_PAGE_PREFIXES = [
  "/wizard",
  "/results",
  "/suggestions",
  "/profile",
  "/history",
  "/impact",
  "/journal",
  "/milestones",
  "/recap",
  "/quick-log",
  "/log",
  "/challenges",
  "/org/submit",
  "/org/share-report",
  "/org/member",
];

export function isPersonalImpactPage(location: string): boolean {
  return PERSONAL_PAGE_PREFIXES.some((p) => location === p || location.startsWith(`${p}/`));
}

/**
 * Whether Sidekick should speak to this person as an organisation manager.
 *
 * This is the single answer used for the templates on offer, the quick
 * questions, and the context sent to the server, so the three cannot
 * disagree. Being a member of an organisation is not enough: only an active
 * manager speaks for it, and not while they are on their own impact pages.
 */
export function isSidekickOrgMode(signals: {
  role?: string | null;
  membershipStatus?: string | null;
  location: string;
}): boolean {
  if (signals.role !== "manager") return false;
  if (signals.membershipStatus && signals.membershipStatus !== "active") return false;
  return !isPersonalImpactPage(signals.location);
}

// ---- persona resolution -------------------------------------------------

export interface PersonaSignals {
  interests: string[];
  situations: string[];
  careerBreak: boolean;
  /** Result of `isSidekickOrgMode`. */
  orgMode: boolean;
}

export function resolvePersona(signals: PersonaSignals): SidekickPersona {
  if (signals.orgMode) return "org_manager";
  if (signals.interests.includes("military") || signals.situations.includes("armed_forces")) {
    return "veteran";
  }
  if (signals.interests.includes("caring")) return "carer";
  if (signals.situations.includes("apprenticeship")) return "apprenticeship";
  if (signals.careerBreak || signals.situations.includes("career_break")) return "career_break";
  if (signals.situations.includes("student")) return "student";
  return "default";
}

export function templatesForPersona(
  persona: SidekickPersona,
  templates: SidekickTemplate[] = SIDEKICK_TEMPLATES
): SidekickTemplate[] {
  // Org managers don't realistically need DofE / UCAS / CV bullet personal templates,
  // but we still surface the LinkedIn and employer one-liner so they have something to use.
  if (persona === "org_manager") {
    return templates.filter((t) => t.category === "linkedin" || t.category === "employer");
  }
  return templates;
}
