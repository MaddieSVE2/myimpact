/**
 * page-metadata.ts — single source of truth for public-page titles,
 * descriptions, canonical URLs, robots directives, Open Graph / Twitter
 * Card fields, and JSON-LD structured data.
 *
 * Imported by:
 *  - Page components (via @/lib/page-metadata) for <PageMeta> props
 *  - prerender.ts (post-build script) to inject static metadata into
 *    the pre-rendered HTML that crawlers see
 *
 * When you update copy here, both the live React app and the pre-rendered
 * HTML are updated automatically — no manual sync needed.
 */

import publicRoutes from "./public-routes.json";

export const SITE_ORIGIN = "https://myimpact.uk";
export const DEFAULT_OG_IMAGE = `${SITE_ORIGIN}/opengraph.jpg`;

const PUBLISHER = {
  "@type": "Organization",
  "@id": `${SITE_ORIGIN}/#organization`,
  "name": "My Impact",
  "url": `${SITE_ORIGIN}/`,
};

export interface PageMetadata {
  title: string;
  description: string;
  canonical: string | undefined;
  robots: string;
  ogType?: string;
  ogImage?: string;
  jsonLd?: object[];
}

export interface PrerenderPage extends PageMetadata {
  path: string;
}

export const PUBLIC_ROUTES: readonly string[] = publicRoutes;

/**
 * FAQ data used both for the homepage FAQ UI and the FAQPage JSON-LD schema.
 * Plain text only — React nodes for rich display are added in Intro.tsx.
 */
export const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: "What is My Impact?",
    a: "My Impact is a free tool for anyone who volunteers, cares for others, gives to charity, or takes positive action in their community. Answer a short set of questions about what you do, and it works out what your contributions are worth in pounds using peer-reviewed social value methodology. You get a shareable results page that is useful for job applications, funding bids, UCAS personal statements, DofE applications, and annual reports.",
  },
  {
    q: "How does My Impact calculate social value?",
    a: "We use the Social Value Engine, the UK's accredited platform for measuring social value, combined with the SROI framework endorsed by Social Value International. Each activity is matched to a peer-reviewed monetary value across four pillars: activity impact, time contributed, donations, and personal growth. Every value is sourced from peer-reviewed research and UK-specific datasets.",
  },
  {
    q: "Is the information I enter verified or independently audited?",
    a: "Today, contributions are self-reported. We are transparent about this on every results page. We use conservative proxy values, sensible default ranges, and single-SDG attribution to keep figures defensible. Organisation-side verification for group programmes is on our roadmap.",
  },
  {
    q: "Is My Impact free to use?",
    a: "Measuring your impact is free and you don't need an account to do it. If you do create a free account, you can also save your history, write journal entries, earn milestones, and share a public profile. For organisations wanting access to the dashboard, Pulse surveys, and other team features, there is a cost. Get in touch at hello@myimpact.uk to find out more.",
  },
  {
    q: "What is the Social Value Engine?",
    a: "The Social Value Engine (SVE) is the UK's accredited platform for measuring social value, used by local authorities, universities, housing associations, and charities. My Impact uses SVE proxy values to ensure every monetary figure is grounded in evidence-based, peer-reviewed research aligned with HM Treasury Green Book methodology.",
  },
  {
    q: "Can my organisation use My Impact?",
    a: "Yes. My Impact works for schools, universities, charities, local authorities, and private sector employers running employee volunteering or community investment programmes. Organisations get a dedicated dashboard showing aggregated, anonymised impact data across their members, ready for programme reporting, funding bids, commissioner returns, and ESG reporting. Get in touch at hello@myimpact.uk or explore the demo dashboard to find out more.",
  },
];

export const HOMEPAGE_JSON_LD: object[] = [
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_ORIGIN}/#website`,
    "url": `${SITE_ORIGIN}/`,
    "name": "My Impact",
    "description": "Free tool to calculate and share the social value of your volunteering, community work, and positive actions.",
  },
  {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "@id": `${SITE_ORIGIN}/#webapp`,
    "url": `${SITE_ORIGIN}/`,
    "name": "My Impact",
    "applicationCategory": "LifestyleApplication",
    "operatingSystem": "Web",
    "description": "Free tool to measure, track and share the social value of volunteering and community contributions using SROI methodology.",
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "GBP",
    },
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": FAQ_ITEMS.map(item => ({
      "@type": "Question",
      "name": item.q,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": item.a,
      },
    })),
  },
];

export const HOME_META: PageMetadata = {
  title: "My Impact — Calculate the social value of your volunteering and community work",
  description:
    "Free tool to measure, track, and share the social value you create through volunteering, community work, and positive actions. Powered by SROI methodology and Social Value Engine data.",
  canonical: "https://myimpact.uk/",
  robots: "index, follow",
  jsonLd: HOMEPAGE_JSON_LD,
};

export const ABOUT_META: PageMetadata = {
  title: "About My Impact — Making the invisible visible",
  description:
    "My Impact is a free tool that converts volunteering, community work, and caring into a defensible monetary figure using SROI methodology and Social Value Engine proxies.",
  canonical: "https://myimpact.uk/about",
  robots: "index, follow",
};

export const METHODOLOGY_META: PageMetadata = {
  title: "Methodology & Evidence — How My Impact calculates social value",
  description:
    "How My Impact calculates social value: SROI methodology, Social Value Engine proxies, UN SDG mapping, verification approach, and the citations behind every number.",
  canonical: "https://myimpact.uk/methodology",
  robots: "index, follow",
  ogType: "article",
  jsonLd: [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      "@id": `${SITE_ORIGIN}/methodology#article`,
      "url": `${SITE_ORIGIN}/methodology`,
      "mainEntityOfPage": `${SITE_ORIGIN}/methodology`,
      "headline": "Methodology & Evidence — How My Impact calculates social value",
      "description": "How My Impact calculates social value: SROI methodology, Social Value Engine proxies, UN SDG mapping, verification approach, and the citations behind every number.",
      "dateModified": "2026-05-02",
      "publisher": PUBLISHER,
    },
  ],
};

export const WHATS_NEW_META: PageMetadata = {
  title: "What's New — My Impact",
  description:
    "The latest features, improvements, and updates to My Impact. See what's been shipped for individuals and organisations.",
  canonical: "https://myimpact.uk/whats-new",
  robots: "index, follow",
  ogType: "article",
  jsonLd: [
    {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      "@id": `${SITE_ORIGIN}/whats-new#july-2026`,
      "url": `${SITE_ORIGIN}/whats-new#july-2026`,
      "mainEntityOfPage": `${SITE_ORIGIN}/whats-new`,
      "headline": "What's new in My Impact — July 2026",
      "description": "Logging, local charity, history, organisation, safety, and accessibility improvements shipped by My Impact through July 2026.",
      "datePublished": "2026-07",
      "dateModified": "2026-07",
      "publisher": PUBLISHER,
    },
    {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      "@id": `${SITE_ORIGIN}/whats-new#may-2026`,
      "url": `${SITE_ORIGIN}/whats-new#may-2026`,
      "mainEntityOfPage": `${SITE_ORIGIN}/whats-new`,
      "headline": "What's new in My Impact — May 2026",
      "description": "Personalisation, public profiles, milestones, organisation tools, and accessibility improvements shipped by My Impact through May 2026.",
      "datePublished": "2026-05",
      "dateModified": "2026-05",
      "publisher": PUBLISHER,
    },
    {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      "@id": `${SITE_ORIGIN}/whats-new#march-2026`,
      "url": `${SITE_ORIGIN}/whats-new#march-2026`,
      "mainEntityOfPage": `${SITE_ORIGIN}/whats-new`,
      "headline": "What's new in My Impact — March 2026",
      "description": "Sidekick, history, organisation dashboard, accessibility, and mobile improvements shipped by My Impact through March 2026.",
      "datePublished": "2026-03",
      "dateModified": "2026-03",
      "publisher": PUBLISHER,
    },
  ],
};

export const CONTACT_META: PageMetadata = {
  title: "Contact Us — My Impact",
  description: "Get in touch with the My Impact team. We'll respond within 1–2 working days.",
  canonical: "https://myimpact.uk/contact",
  robots: "index, follow",
};

export const ORG_DEMO_META: PageMetadata = {
  title: "Organisation Dashboard Demo — My Impact",
  description:
    "See how My Impact helps schools, charities, local authorities, and universities track aggregated social value across their members. Explore the live demo dashboard.",
  canonical: "https://myimpact.uk/org/demo",
  robots: "index, follow",
};

export const NOT_FOUND_META: PageMetadata = {
  title: "Page not found — My Impact",
  description: "The page you're looking for doesn't exist.",
  canonical: undefined,
  robots: "noindex, follow",
};

export const SUGGESTIONS_META: PageMetadata = {
  title: "Volunteering ideas — find ways to make a difference | My Impact",
  description:
    "Discover volunteering, community, and social action ideas matched to your interests. Browse hundreds of ways to contribute and calculate your potential social value.",
  canonical: undefined,
  robots: "noindex, nofollow",
};

export const ORGANISATIONS_META: PageMetadata = {
  title: "My Impact for Organisations",
  description:
    "Measure and report the collective social value created by your people across public, private, education, and voluntary-sector organisations.",
  canonical: "https://myimpact.uk/organisations",
  robots: "index, follow",
};

export const ORG_REGISTER_META: PageMetadata = {
  title: "Register your Organisation — My Impact",
  description:
    "Register your school, charity, company, or public-sector body to get an aggregated, anonymised impact dashboard showing the collective social value your members create. Free to try.",
  canonical: "https://myimpact.uk/org/register",
  robots: "index, follow",
};

export const ORG_TYPE_EXPLICIT_SUBMISSION_META: PageMetadata = {
  title: "Explicit submission organisations — My Impact",
  description:
    "How explicit submission organisations work on My Impact: members choose exactly which activities to submit, and nothing is shared automatically.",
  canonical: "https://myimpact.uk/org/types/explicit-submission",
  robots: "index, follow",
  ogType: "article",
};

export const ORG_TYPE_CONSENTED_LOGGING_META: PageMetadata = {
  title: "Consented logging organisations — My Impact",
  description:
    "How consented logging organisations work on My Impact: activities are shared automatically with your recorded consent, never journals or pulse answers.",
  canonical: "https://myimpact.uk/org/types/consented-logging",
  robots: "index, follow",
  ogType: "article",
};

/**
 * All public pages to pre-render, in order.
 * Routes come from public-routes.json, which is also consumed by the
 * accessibility gate. Adding or removing a route therefore affects both.
 */
const METADATA_BY_ROUTE: Record<string, PageMetadata> = {
  "/": HOME_META,
  "/about": ABOUT_META,
  "/methodology": METHODOLOGY_META,
  "/whats-new": WHATS_NEW_META,
  "/contact": CONTACT_META,
  "/organisations": ORGANISATIONS_META,
  "/org/demo": ORG_DEMO_META,
  "/org/register": ORG_REGISTER_META,
  "/org/types/explicit-submission": ORG_TYPE_EXPLICIT_SUBMISSION_META,
  "/org/types/consented-logging": ORG_TYPE_CONSENTED_LOGGING_META,
  "/suggestions": SUGGESTIONS_META,
  "/404": NOT_FOUND_META,
};

export const PRERENDER_PAGES: PrerenderPage[] = PUBLIC_ROUTES.map((path) => {
  const metadata = METADATA_BY_ROUTE[path];
  if (!metadata) {
    throw new Error(`Missing page metadata for public route: ${path}`);
  }
  return { path, ...metadata };
});
