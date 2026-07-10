/**
 * page-metadata.ts — single source of truth for public-page titles,
 * descriptions, canonical URLs, and robots directives.
 *
 * Imported by:
 *  - Page components (via @/lib/page-metadata) for <PageMeta> props
 *  - prerender.ts (post-build script) to inject static metadata into
 *    the pre-rendered HTML that crawlers see
 *
 * When you update copy here, both the live React app and the pre-rendered
 * HTML are updated automatically — no manual sync needed.
 */

export interface PageMetadata {
  title: string;
  description: string;
  canonical: string | undefined;
  robots: string;
}

export interface PrerenderPage extends PageMetadata {
  path: string;
}

export const HOME_META: PageMetadata = {
  title: "My Impact — Calculate the social value of your volunteering and community work",
  description:
    "Free tool to measure, track, and share the social value you create through volunteering, community work, and positive actions. Powered by SROI methodology and Social Value Engine data.",
  canonical: "https://myimpact.uk/",
  robots: "index, follow",
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
};

export const WHATS_NEW_META: PageMetadata = {
  title: "What's New — My Impact",
  description:
    "The latest features, improvements, and updates to My Impact. See what's been shipped for individuals and organisations.",
  canonical: "https://myimpact.uk/whats-new",
  robots: "index, follow",
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

/**
 * All public pages to pre-render, in order.
 * Used by prerender.ts to write static HTML for crawlers.
 */
export const PRERENDER_PAGES: PrerenderPage[] = [
  { path: "/", ...HOME_META },
  { path: "/about", ...ABOUT_META },
  { path: "/methodology", ...METHODOLOGY_META },
  { path: "/whats-new", ...WHATS_NEW_META },
  { path: "/contact", ...CONTACT_META },
  { path: "/org/demo", ...ORG_DEMO_META },
  { path: "/404", ...NOT_FOUND_META },
];
