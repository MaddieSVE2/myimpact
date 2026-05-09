/**
 * Sidekick prompt template library.
 *
 * Each template defines a one-tap prompt that pre-fills Sidekick with a
 * contextual request built from the user's score, top activity, persona,
 * and recent record.
 *
 * This file is intentionally written so non-engineers can edit the copy:
 * the prompt strings are right there in the `build` functions, with
 * minimal logic around them.
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

export interface SidekickUserContext {
  totalValue?: number;
  totalHours?: number;
  topActivity?: string;
  recentActivities?: string[];
  topSdg?: string;
  persona: SidekickPersona;
}

export interface SidekickTemplate {
  id: string;
  category: SidekickTemplateCategory;
  label: string;
  description: string;
  /**
   * Build the user-facing prompt that gets sent to the chat endpoint.
   * Persona variants are picked here based on `ctx.persona`.
   */
  build: (ctx: SidekickUserContext) => string;
}

export const SIDEKICK_CATEGORY_LABELS: Record<SidekickTemplateCategory, string> = {
  ucas: "UCAS personal statement",
  linkedin: "LinkedIn post",
  cv: "CV bullet",
  cover_letter: "Cover letter line",
  employer: "Employer one-liner",
  dofe: "DofE write-up",
};

// ---- helpers ------------------------------------------------------------

const POUNDS = (n?: number) =>
  typeof n === "number" && n > 0 ? `£${Math.round(n).toLocaleString("en-GB")}` : "(no score yet)";

const ACTIVITY = (ctx: SidekickUserContext) =>
  ctx.topActivity ?? ctx.recentActivities?.[0] ?? "my volunteering";

const HAS_SCORE = (ctx: SidekickUserContext) =>
  typeof ctx.totalValue === "number" && ctx.totalValue > 0;

const HOURS_LINE = (ctx: SidekickUserContext) =>
  ctx.totalHours && ctx.totalHours > 0
    ? ` (about ${Math.round(ctx.totalHours)} hours logged)`
    : "";

const NUMBERS_LINE = (ctx: SidekickUserContext) =>
  HAS_SCORE(ctx)
    ? `My current My Impact total social value is ${POUNDS(ctx.totalValue)}${HOURS_LINE(ctx)}.`
    : `I have not generated a score yet, so please draft something I can adapt once I have my numbers.`;

const RECENT_LINE = (ctx: SidekickUserContext) => {
  const acts = ctx.recentActivities ?? [];
  if (acts.length === 0) return "";
  const list = acts.slice(0, 3).join(", ");
  return ` My most recent logged activities are: ${list}.`;
};

// ---- templates ----------------------------------------------------------

export const SIDEKICK_TEMPLATES: SidekickTemplate[] = [
  // ─── UCAS personal statement ────────────────────────────────────────
  {
    id: "ucas_paragraph",
    category: "ucas",
    label: "UCAS paragraph about my impact",
    description: "A short paragraph for the wider-experience section.",
    build: (ctx) => {
      const numbers = NUMBERS_LINE(ctx);
      const recent = RECENT_LINE(ctx);
      const top = ACTIVITY(ctx);

      switch (ctx.persona) {
        case "veteran":
          return `Please draft a UCAS personal statement paragraph (around 80 to 100 words) about the wider contribution I've made through ${top}. ${numbers}${recent} I'm a veteran / forces background applicant, frame the discipline, leadership and teamwork in plain civilian language an admissions tutor will recognise. Use British English, first person, no clichés.`;
        case "carer":
          return `Please draft a UCAS personal statement paragraph (around 80 to 100 words) about my wider contribution. ${numbers}${recent} I'm an unpaid carer, so please weave in what caring has taught me, coordination, advocacy, resilience, alongside ${top}. Honest, first person, British English, no over-claiming.`;
        case "career_break":
          return `Please draft a UCAS personal statement paragraph (around 80 to 100 words) about my wider contribution. ${numbers}${recent} I am a mature applicant returning to study after a career break. Frame ${top} as evidence of active contribution during that period. First person, British English, calm and honest tone.`;
        case "apprenticeship":
          return `Please draft a short supporting-statement paragraph (around 80 words) for my apprenticeship application about ${top}. ${numbers}${recent} Pull out commitment, reliability and teamwork, what apprenticeship assessors actually look for. First person, British English, no waffle.`;
        case "student":
        default:
          return `Please draft a UCAS personal statement paragraph (around 80 to 100 words) about my wider experience and the difference I've made through ${top}. ${numbers}${recent} First person, British English, specific not generic, no clichés like "I have always been passionate about…".`;
      }
    },
  },

  // ─── LinkedIn post ──────────────────────────────────────────────────
  {
    id: "linkedin_post",
    category: "linkedin",
    label: "LinkedIn post about my impact",
    description: "A short, sharable post about what you've contributed.",
    build: (ctx) => {
      const numbers = NUMBERS_LINE(ctx);
      const recent = RECENT_LINE(ctx);
      const top = ACTIVITY(ctx);

      switch (ctx.persona) {
        case "veteran":
          return `Please write a short LinkedIn post (around 100 words, 3 short paragraphs) about the social value I've created through ${top}. ${numbers}${recent} I'm a forces veteran, frame the leadership and teamwork side without jargon. End with a single quiet line, not a call to action. British English, first person, no emojis, no hashtags.`;
        case "carer":
          return `Please write a short LinkedIn post (around 100 words) about the contribution I've made through ${top} alongside being an unpaid carer. ${numbers}${recent} Be matter-of-fact, not heroic. British English, first person, no emojis, no hashtags.`;
        case "org_manager":
          return `Please draft a short LinkedIn post (around 100 words) on behalf of our organisation, celebrating the collective impact our volunteers have created. ${numbers} Highlight what the figures mean for the people we support, not just the headline number. British English, warm but credible tone, no emojis, no hashtags.`;
        case "career_break":
          return `Please write a short LinkedIn post (around 100 words) for someone returning to work after a career break, talking about the contribution I've made through ${top}. ${numbers}${recent} Honest and grounded, not over-polished. British English, first person, no emojis, no hashtags.`;
        case "student":
        default:
          return `Please write a short LinkedIn post (around 100 words, 3 short paragraphs) about the social value I've created through ${top}. ${numbers}${recent} Specific, plain English, no humblebrag. British English, first person, no emojis, no hashtags.`;
      }
    },
  },

  // ─── CV bullet ──────────────────────────────────────────────────────
  {
    id: "cv_bullets",
    category: "cv",
    label: "CV bullets from my impact",
    description: "Three CV bullet points an employer will actually read.",
    build: (ctx) => {
      const numbers = NUMBERS_LINE(ctx);
      const recent = RECENT_LINE(ctx);
      const top = ACTIVITY(ctx);

      switch (ctx.persona) {
        case "veteran":
          return `Please write 3 CV bullet points based on ${top}. ${numbers}${recent} I'm ex-forces, translate any military framing into plain civilian language. Each bullet: action verb, specific contribution, measurable outcome where possible. British English. No fluff.`;
        case "carer":
          return `Please write 3 CV bullet points covering my unpaid caring responsibilities and ${top}. ${numbers}${recent} Use professional language an HR reader will recognise, coordination, advocacy, multi-stakeholder management. Each bullet starts with a strong verb. British English.`;
        case "career_break":
          return `Please write 3 CV bullet points presenting my career-break period as active contribution, anchored on ${top}. ${numbers}${recent} Confident, not apologetic. Strong action verbs. British English.`;
        case "apprenticeship":
          return `Please write 3 CV-style bullet points I can use in my apprenticeship application, drawn from ${top}. ${numbers}${recent} Each one should evidence reliability, teamwork or initiative. Plain English. British English.`;
        case "student":
        default:
          return `Please write 3 CV bullet points based on ${top}. ${numbers}${recent} Each bullet: strong verb, specific action, outcome. No generic claims like "team player". British English.`;
      }
    },
  },

  // ─── Cover letter line ──────────────────────────────────────────────
  {
    id: "cover_letter_line",
    category: "cover_letter",
    label: "Cover letter line about impact",
    description: "Two or three sentences to drop into a cover letter.",
    build: (ctx) => {
      const numbers = NUMBERS_LINE(ctx);
      const top = ACTIVITY(ctx);

      switch (ctx.persona) {
        case "veteran":
          return `Please draft 2 to 3 sentences for a cover letter that reference my contribution through ${top}. ${numbers} I'm a veteran, keep it civilian-friendly, no acronyms, focus on what I'd bring to a workplace. British English, first person, no clichés.`;
        case "carer":
          return `Please draft 2 to 3 sentences for a cover letter that show how my unpaid caring and ${top} make me a strong candidate. ${numbers} Honest, specific, not over-explained. British English, first person.`;
        case "career_break":
          return `Please draft 2 to 3 sentences for a cover letter that acknowledge my career break and present ${top} as evidence of what I've been doing during that time. ${numbers} Calm, confident, not defensive. British English, first person.`;
        case "apprenticeship":
          return `Please draft 2 to 3 sentences for an apprenticeship covering letter that reference ${top} as evidence of commitment and teamwork. ${numbers} Plain English, first person, British English.`;
        case "student":
        default:
          return `Please draft 2 to 3 sentences for a cover letter that reference my contribution through ${top}. ${numbers} Specific, not generic. British English, first person.`;
      }
    },
  },

  // ─── Employer one-liner ─────────────────────────────────────────────
  {
    id: "employer_one_liner",
    category: "employer",
    label: "One-line summary for an employer",
    description: "A single sentence to introduce your impact in interviews.",
    build: (ctx) => {
      const numbers = NUMBERS_LINE(ctx);
      const top = ACTIVITY(ctx);

      switch (ctx.persona) {
        case "veteran":
          return `Please give me a single sentence I can say in an interview to summarise my contribution through ${top}, in plain civilian language. ${numbers} British English, first person, conversational not corporate.`;
        case "carer":
          return `Please give me one sentence I can say in an interview to summarise my contribution through ${top} and my caring responsibilities. ${numbers} Honest and matter-of-fact. British English, first person.`;
        case "career_break":
          return `Please give me one sentence I can use in an interview to summarise what I've been contributing during my career break, anchored on ${top}. ${numbers} Confident, not defensive. British English, first person.`;
        case "org_manager":
          return `Please give me one sentence we can use to summarise our organisation's collective volunteer impact for a funder pitch or trustee update. ${numbers} Credible, plain English, no jargon. British English.`;
        case "student":
        default:
          return `Please give me a single sentence I can say in an interview to summarise the impact of ${top}. ${numbers} Conversational, not corporate. British English, first person.`;
      }
    },
  },

  // ─── DofE write-up ──────────────────────────────────────────────────
  {
    id: "dofe_writeup",
    category: "dofe",
    label: "DofE volunteering write-up",
    description: "A short reflection for the DofE volunteering section.",
    build: (ctx) => {
      const numbers = NUMBERS_LINE(ctx);
      const recent = RECENT_LINE(ctx);
      const top = ACTIVITY(ctx);

      switch (ctx.persona) {
        case "carer":
          return `Please draft a short DofE volunteering write-up (around 80 words) about ${top}, reflecting honestly that I balance this alongside caring responsibilities. ${numbers}${recent} First person, British English, plain language a DofE assessor will understand.`;
        case "student":
        default:
          return `Please draft a short DofE volunteering write-up (around 80 words) about ${top}: what I did, what I learned, and what difference it made. ${numbers}${recent} First person, plain language, British English. No clichés.`;
        case "veteran":
          return `Please draft a short DofE-style volunteering write-up (around 80 words) about ${top}: action, learning, difference. ${numbers}${recent} Plain English, first person, British English.`;
      }
    },
  },
];

// ---- regenerate angles --------------------------------------------------

const REGENERATE_ANGLES = [
  "This time take a different angle: lead with what changed for the people I worked with, not what I did.",
  "This time take a different angle: be more concise, cut a third of the words and keep only the most specific detail.",
  "This time take a different angle: focus on a single transferable skill rather than describing the activity.",
  "This time take a different angle: open with a concrete moment or example rather than a summary.",
  "This time take a different angle: write it more conversationally, like I'm telling a friend.",
];

export function buildRegeneratePrompt(originalPrompt: string, attempt: number): string {
  const angle = REGENERATE_ANGLES[attempt % REGENERATE_ANGLES.length];
  return `${originalPrompt}\n\n${angle}`;
}

// ---- persona resolution -------------------------------------------------

export interface PersonaSignals {
  interests: string[];
  situations: string[];
  careerBreak: boolean;
  isOrgManager: boolean;
}

export function resolvePersona(signals: PersonaSignals): SidekickPersona {
  if (signals.isOrgManager) return "org_manager";
  if (signals.interests.includes("military") || signals.situations.includes("armed_forces")) {
    return "veteran";
  }
  if (signals.interests.includes("caring")) return "carer";
  if (signals.situations.includes("apprenticeship")) return "apprenticeship";
  if (signals.careerBreak || signals.situations.includes("career_break")) return "career_break";
  if (signals.situations.includes("student")) return "student";
  return "default";
}

export function templatesForPersona(persona: SidekickPersona): SidekickTemplate[] {
  // Org managers don't realistically need DofE / UCAS / CV bullet personal templates,
  // but we still surface the LinkedIn and employer one-liner so they have something to use.
  if (persona === "org_manager") {
    return SIDEKICK_TEMPLATES.filter((t) => t.category === "linkedin" || t.category === "employer");
  }
  return SIDEKICK_TEMPLATES;
}
