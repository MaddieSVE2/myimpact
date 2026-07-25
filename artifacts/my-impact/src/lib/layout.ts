// Shared page-width convention for My Impact.
//
// Two standard widths are used across the site:
//  - Standard content width (896px / Tailwind `max-w-4xl`): text-focused pages
//    such as Journal, Profile, History, Results, and prose sections on the
//    marketing pages (Privacy, Terms, Security bodies).
//  - Wide width (1152px / Tailwind `max-w-6xl`): data-rich organisation
//    dashboards and full marketing sections (home, About, Methodology heroes).
//
// Tailwind-based pages should use the class constants; inline-styled marketing
// pages should use the pixel constants so every page derives from one place.

export const CONTENT_MAX_WIDTH = 896;
export const SECTION_MAX_WIDTH = 1152;

export const CONTENT_CONTAINER = "max-w-4xl mx-auto px-4";
export const WIDE_CONTAINER = "max-w-6xl mx-auto px-4";
