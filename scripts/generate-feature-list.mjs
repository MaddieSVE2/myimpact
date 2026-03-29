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
        subtitle("March 2026"),

        heading2("Authentication and User Management"),
        bullet("Passwordless sign-in via magic link sent to the user's email address"),
        bullet("JWT-based session cookies (30-day expiry, httpOnly, secure in production)"),
        bullet("Instant demo login for persona accounts, bypassing the email step"),
        bullet("New user accounts created automatically on first sign-in"),
        bullet("User profile setup capturing name and situational context (e.g. student, volunteer, carer, armed forces, apprentice, job seeker, career break)"),
        bullet("Multi-select situation tags so users can identify with more than one context"),
        bullet("Protected routes that redirect unauthenticated users to login, preserving their intended destination"),
        bullet("Settings page for managing account details"),

        heading2("Impact Wizard"),
        bullet("Multi-step guided wizard covering location, interests, activities, and contributions"),
        bullet("Postcode lookup via Postcodes.io API to identify local authority boundary and surface relevant local opportunities"),
        bullet("Standard activity selection from a curated list of SVE-aligned categories"),
        bullet("Free-text activity mode: users describe their activity in plain language and AI matches it to the correct SVE proxy (toggled via a switch above the form)"),
        bullet("Wizard questions and framing adapt based on the user's profile and situational context"),
        bullet("Progress is saved mid-wizard so users can return and continue"),
        bullet("Support for logging recurring activities"),
        bullet("Career break included as a supported situational context throughout the wizard"),

        heading2("Social Value Calculation"),
        bullet("Social Return on Investment (SROI) calculated using real, verified SVE proxy data (not sample or placeholder figures)"),
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
        bullet('"Inspire me" feature on the home page to prompt new activity ideas'),

        heading2("History"),
        bullet("Chronological log of all impact records submitted by the user"),
        bullet("Edit individual records after submission"),
        bullet("Delete individual records"),
        bullet("Full reset option to clear all history"),
        bullet("Duplicate record prevention"),
        bullet("Chart and data accuracy fixes applied"),

        heading2("Impact Journal"),
        bullet("Private reflection journal visible only to the user"),
        bullet("AI-generated prompts to guide meaningful reflection on each activity"),
        bullet("Auto-generated journal cards created when activities are logged"),
        bullet("Journal entries persisted to the database and available across sessions"),

        heading2("AI Sidekick"),
        bullet("Embedded AI chat assistant powered by OpenAI"),
        bullet("Capable of answering social value questions, helping draft CV bullet points, and supporting UCAS personal statement writing"),
        bullet("Responses use plain, accessible language rather than technical terminology"),
        bullet("Expanded knowledge base covering SVE methodology, local volunteering, and application writing"),
        bullet("Persona-specific depth: tailored responses for users returning to work, with caring responsibilities, or from an armed forces background"),
        bullet("Animated thinking indicator shown while a response is being generated"),
        bullet("Guidance accuracy improved for activity logging prompts"),

        heading2("Sharing and Export"),
        bullet("Impact report exported as a PDF formatted for LinkedIn"),
        bullet("Shareable image (PNG) of impact statistics generated for social media"),
        bullet("Digital milestone badges awarded for reaching activity and impact thresholds"),
        bullet("Visual fixes applied to both PDF and PNG export outputs"),

        heading2("Organisation Portal"),
        bullet("Organisation registration flow for schools, charities, universities, and local authorities"),
        bullet("Confirmation email sent to the registering admin via Resend"),
        bullet("Unique invite code and shareable invite link generated per organisation"),
        bullet("Organisation-contextual login screen shown when users arrive via an invite link"),
        bullet("Users can join an organisation from within their own account menu"),
        bullet("Admin dashboard showing aggregated, anonymised social value and hours across all members"),
        bullet("Organisation type switcher in the demo dashboard (charity, school, university, local authority)"),
        bullet("Period selector supporting both academic year and calendar year views"),
        bullet("Bulk member invite functionality"),
        bullet("PDF report export for the organisation's aggregated impact data"),
        bullet("Education-specific dashboard language and statistics"),
        bullet("Two seeded demo dashboards with realistic data, updating live as real member data comes in"),

        heading2("Accessibility and Device Support"),
        bullet("High contrast mode available throughout the application"),
        bullet("Graphics and iconography reviewed for accessibility compliance"),
        bullet("Full mobile experience review and fix pass"),
        bullet("Step progress indicator label overlap resolved"),
        bullet("Application installable to a phone or tablet home screen as a native-style app (with custom icon)"),

        heading2("Admin and Analytics"),
        bullet("Admin panel with page view tracking across the platform"),

        heading2("Personas Tested"),
        new Paragraph({
          children: [
            new TextRun({
              text: "The following user journeys were built, tailored, and validated end-to-end:",
              size: 22,
              color: DARK,
            }),
          ],
          spacing: { before: 60, after: 100 },
        }),
        bullet("Volunteer"),
        bullet("Student / UCAS applicant"),
        bullet("Carer"),
        bullet("Armed forces veteran"),
        bullet("Apprentice"),
        bullet("Job seeker / NEET"),
        bullet("Person on a career break"),

        spacer(),
      ],
    },
  ],
});

const outputPath = resolve(__dirname, "../My Impact - Full Feature List.docx");
const buffer = await Packer.toBuffer(doc);
writeFileSync(outputPath, buffer);
console.log(`Document written to: ${outputPath}`);
