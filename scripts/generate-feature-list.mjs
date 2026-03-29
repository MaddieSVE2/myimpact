import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  BorderStyle,
} from "docx";
import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const ORANGE = "E8633A";
const DARK = "213547";
const GRAY = "555555";

function heading2(text) {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        bold: true,
        size: 28,
        color: ORANGE,
      }),
    ],
    spacing: { before: 360, after: 120 },
    border: {
      bottom: {
        color: ORANGE,
        space: 4,
        style: BorderStyle.SINGLE,
        size: 6,
      },
    },
  });
}

function bullet(text) {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        size: 22,
        color: DARK,
      }),
    ],
    bullet: { level: 0 },
    spacing: { before: 60, after: 60 },
  });
}

function subbullet(text) {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        size: 22,
        color: DARK,
      }),
    ],
    bullet: { level: 1 },
    spacing: { before: 40, after: 40 },
  });
}

function subtitle(text) {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        size: 22,
        color: GRAY,
        italics: true,
      }),
    ],
    spacing: { before: 0, after: 360 },
  });
}

function titlePara(text) {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        bold: true,
        size: 52,
        color: DARK,
      }),
    ],
    alignment: AlignmentType.LEFT,
    spacing: { before: 0, after: 160 },
  });
}

function spacer() {
  return new Paragraph({ text: "", spacing: { before: 0, after: 0 } });
}

function bodyPara(text) {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        size: 22,
        color: DARK,
      }),
    ],
    spacing: { before: 60, after: 100 },
  });
}

const doc = new Document({
  styles: {
    default: {
      document: {
        run: {
          font: "Calibri",
          size: 22,
          color: DARK,
        },
      },
    },
  },
  sections: [
    {
      properties: {
        page: {
          margin: {
            top: 1080,
            right: 1080,
            bottom: 1080,
            left: 1080,
          },
        },
      },
      children: [
        titlePara("My Impact — Full Feature List"),
        subtitle("March 2026 (updated)"),

        heading2("Authentication and User Management"),
        bullet("Passwordless sign-in via magic link sent to the user's email address"),
        bullet("JWT-based session cookies (30-day expiry, httpOnly, secure in production)"),
        bullet("Instant demo login for six pre-defined persona accounts (volunteer, student, carer, veteran, apprentice, job seeker), bypassing the email step entirely"),
        bullet("New user accounts created automatically on first sign-in"),
        bullet("User profile setup flow capturing display name and situational context"),
        bullet("Multi-select situation tags: users can identify with more than one context simultaneously (e.g. student and volunteer)"),
        bullet("Profile data pre-filled into the wizard on return visits with a visible confirmation banner"),
        bullet("Protected routes that redirect unauthenticated users to login, preserving their intended destination"),
        bullet("Account settings page for managing display name, email, high contrast preference, and sign-out"),

        heading2("Impact Wizard"),
        bullet("Multi-step guided wizard covering location, interests, situations, activities, and contributions"),
        bullet("Postcode lookup via Postcodes.io API to identify local authority boundary and surface relevant local opportunities"),
        bullet("Standard activity selection from a curated list of SVE-aligned categories"),
        bullet("Free-text activity mode: users describe their activity in plain language and AI matches it to the correct SVE proxy"),
        bullet("Wizard personalises its framing based on the user's profile and situational context (student, carer, veteran, apprentice, job seeker, career break, volunteer)"),
        bullet("Career break parsing recognises informal care language ('stay at home parent', 'raising children', 'looking after grandchildren') and maps correctly to SVE proxies"),
        bullet("Draft auto-save: progress is persisted mid-wizard so users can return and continue"),
        bullet("'Resuming your last session' banner shown when a draft is detected"),
        bullet("'View full report' button on the History page reopens the full interactive Results page for any saved record without re-running the calculation"),

        heading2("Social Value Calculation"),
        bullet("Social Return on Investment (SROI) calculated using real, verified SVE proxy data"),
        bullet("Value expressed as a monetary figure (£) per hour contributed"),
        bullet("Activities categorised across four dimensions: Direct Social Value, Contributions, Donations, and Personal Development"),
        bullet("Alignment with UN Sustainable Development Goals (SDGs) calculated per activity"),
        bullet("Duke of Edinburgh Award section mapping: activities mapped to Volunteering, Physical, and Skill sections"),
        bullet("Financial donation and additional contribution tracking alongside time-based activities"),

        heading2("Results Dashboard"),
        bullet("Total social value displayed as a headline £ figure"),
        bullet("Breakdown chart by category (Direct, Contributions, Donations, Personal Development)"),
        bullet("SDG alignment visualisation showing which global goals the user is contributing to"),
        bullet("Duke of Edinburgh section mapping shown on the results page"),
        bullet("Milestones earned displayed on the results page with a link to the full Milestones view"),
        bullet('"Inspire me" feature on the home page to prompt new activity ideas'),

        heading2("History"),
        bullet("Chronological log of all impact records submitted by the user"),
        bullet("'View full report' button reopens any saved record as a fully interactive Results page"),
        bullet("Edit individual records after submission"),
        bullet("Delete individual records"),
        bullet("Full reset option to clear all history"),

        heading2("Impact Journal"),
        bullet("Private reflection journal visible only to the user"),
        bullet("AI-generated prompts to guide meaningful reflection on each activity"),
        bullet("Auto-generated journal cards created when activities are logged"),
        bullet("Journal entries persisted to the database and available across sessions"),

        heading2("Activity Suggestions"),
        bullet("Personalised activity suggestions based on the user's stated interests (e.g. environment, mental health, community)"),
        bullet("Contextual 'since you already do X, consider Y' suggestions surface even when no interests are stated, using related-activity pairs"),
        bullet("Suggestions ranked by estimated social value impact"),
        bullet("Suggestion reasons tailored to the user's interest categories"),

        heading2("Milestones"),
        bullet("Digital milestone badges awarded when users reach activity and impact thresholds"),
        bullet("Locked milestones shown as encouragement alongside earned ones"),
        bullet("Share button on each earned milestone opens a share modal"),
        bullet("Share modal supports landscape (1200×630 px, ideal for LinkedIn and Twitter) and portrait (1080×1080 px, ideal for Instagram) formats"),
        bullet("Social share buttons for LinkedIn, Twitter/X, and Facebook with pre-populated post text"),
        bullet("High-resolution PNG download of the share card at 2× scale"),
        bullet("Share card displays the user's milestone name, description, total social value score, and the My Impact URL"),

        heading2("AI Sidekick"),
        bullet("Embedded AI chat assistant powered by OpenAI, available on every page"),
        bullet("On desktop, the Sidekick panel pushes page content sideways rather than overlaying it, eliminating any overlap with navigation or content"),
        bullet("Capable of answering social value questions, helping draft CV bullet points, supporting UCAS personal statement writing, and writing apprenticeship supporting statements"),
        bullet("Responses use plain, accessible language rather than technical terminology"),
        bullet("Persona-specific depth for the following user journeys:"),
        subbullet("Returning to work: covers redundancy, mental health recovery, and caring responsibilities; leads with acknowledgement of self-doubt before practical help"),
        subbullet("Informal carer: confirms caring counts, avoids asking for exact hours, frames the employment gap honestly with named transferable skills"),
        subbullet("Scepticism handling: acknowledges frustration without hollow reassurance; explains what the platform concretely provides versus what it cannot guarantee"),
        subbullet("Charity manager / org admin: funder reporting guidance, volunteer onboarding support, and trustee scepticism framing"),
        subbullet("Apprenticeship: assessor evidence criteria, supporting statement structure with sample paragraph format"),
        subbullet("Armed forces / veteran: transition framing, civilian employer language, and export of quantified evidence"),
        bullet("Sidekick knows when it is talking to an organisation manager and adjusts its responses accordingly"),
        bullet("Honest answers about sharing options: distinguishes between impact statement copy, PDF download, and social media share; clarifies that no public profile URL exists"),
        bullet("Contextual quick-action prompts change per page to surface the most relevant questions"),
        bullet("Animated thinking indicator shown while a response is being generated"),

        heading2("Sharing and Export"),
        bullet("Impact statement: a ready-to-copy paragraph formatted for job applications, UCAS personal statements, and apprenticeship forms"),
        bullet("PDF impact report exported in a format suitable for attaching to applications or sending directly"),
        bullet("Shareable social media image (PNG) of impact statistics"),
        bullet("Milestone share cards with platform-specific formats (landscape / portrait) and one-click social sharing"),

        heading2("Organisation Portal"),
        bullet("Organisation registration flow for schools, charities, universities, and local authorities"),
        bullet("Confirmation email sent to the registering admin via Resend"),
        bullet("Unique invite code and shareable invite link generated per organisation"),
        bullet("Organisation-contextual login screen shown when users arrive via an invite link"),
        bullet("Users can join an organisation from within their own account"),
        bullet("Admin dashboard showing aggregated, anonymised social value and hours across all members"),
        bullet("Organisation type switcher in the demo dashboard (charity, school, university, local authority)"),
        bullet("Period selector supporting both academic year and calendar year views"),
        bullet("Bulk member invite functionality"),
        bullet("PDF report export for the organisation's aggregated impact data"),
        bullet("Education-specific dashboard language and statistics"),

        heading2("Contact and Feedback"),
        bullet("Contact form at /contact with name, email, and message fields"),
        bullet("Contact submissions trigger a notification email to the team and a confirmation email to the sender"),
        bullet("Toggleable feedback mode available from the account menu: clicking any element on screen opens a contextual feedback form"),
        bullet("Standalone feedback page at /feedback for general comments and suggestions"),
        bullet("Feedback is stored in the database alongside any associated user account and page URL"),

        heading2("Public Pages"),
        bullet("What's New page at /whats-new summarising recent platform improvements in plain language, grouped by theme"),
        bullet("Privacy policy page at /privacy covering data collection, legal basis, cookies, third-party services, and user rights under UK GDPR"),
        bullet("About page describing the platform's purpose and social value methodology"),
        bullet("Contact page accessible without login"),
        bullet("All public pages linked from site footers"),

        heading2("Accessibility and Device Support"),
        bullet("High contrast mode available throughout the application"),
        bullet("Full mobile experience reviewed and tested"),
        bullet("Step progress indicator with clear labels at each stage"),
        bullet("Application installable to a phone or tablet home screen as a native-style app (PWA) with a custom branded icon"),
        bullet("Aria attributes on interactive elements including situation pills and interest toggles"),

        heading2("Admin and Analytics"),
        bullet("Admin panel at /admin showing all registered users with joined date and pages visited"),
        bullet("Page view tracking records each user's navigation across the platform"),
        bullet("Admin panel link visible only to authorised email addresses in the account menu"),
        bullet("Migration runner applies database schema changes in order, with idempotent SQL files"),

        heading2("Personas Tested"),
        bodyPara("The following user journeys were built, tailored, and validated end-to-end:"),
        bullet("Volunteer"),
        bullet("Student / UCAS applicant"),
        bullet("Apprenticeship applicant"),
        bullet("Job seeker / NEET"),
        bullet("Person on a career break (including redundancy and mental health recovery)"),
        bullet("Informal carer"),
        bullet("Armed forces veteran"),
        bullet("Charity manager / organisation administrator"),
        bullet("Trustee or governance lead (scepticism of data)"),

        spacer(),
      ],
    },
  ],
});

const outputPath = resolve(__dirname, "../My Impact - Full Feature List.docx");
const buffer = await Packer.toBuffer(doc);
writeFileSync(outputPath, buffer);
console.log(`Document written to: ${outputPath}`);
