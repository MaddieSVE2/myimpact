/**
 * Public pages are prerendered (prerender.ts) for a first-time guest: not
 * signed in, default theme, language and sharing settings, no saved draft.
 * When the visitor matches that, the app can reuse the prerendered HTML
 * (hydrateRoot) instead of drawing the page again once its JavaScript has
 * run (createRoot), which is what makes the page appear quickly on phones.
 * Anyone else gets the full client render, as before.
 */
import { detectInitialLocale } from "@/i18n/context";
import { DEFAULT_LOCALE } from "@/i18n/config";
import { THEME_STORAGE_KEY } from "@/lib/theme-context";
import { SOCIAL_SHARING_STORAGE_KEY } from "@/lib/social-sharing-context";
import { WIZARD_DRAFT_KEY } from "@/lib/wizard-context";
import { SIGNED_IN_HINT_KEY } from "@/lib/signed-in-hint";

/** Query parameters that never change what a page renders (campaign tags). */
const IGNORED_PARAMS = /^(utm_[a-z]+|gclid|fbclid|msclkid)$/i;

/**
 * True when the prerendered markup in `root` was rendered for this exact
 * page and this visitor would see the same thing on their first render.
 */
export function canHydratePrerender(root: HTMLElement, location: Location = window.location): boolean {
  const prerendered = root.dataset.prerendered;
  const path = location.pathname.replace(/\/+$/, "") || "/";
  if (!prerendered || prerendered !== path) return false;
  for (const key of new URLSearchParams(location.search).keys()) {
    if (!IGNORED_PARAMS.test(key)) return false;
  }
  if (detectInitialLocale() !== DEFAULT_LOCALE) return false;
  try {
    // The app saves the default theme and sharing values on every visit, so
    // only a non-default value counts. Any saved draft or sign-in counts.
    if (localStorage.getItem(THEME_STORAGE_KEY) === "high-contrast") return false;
    if (localStorage.getItem(SOCIAL_SHARING_STORAGE_KEY) === "false") return false;
    if (localStorage.getItem(WIZARD_DRAFT_KEY) !== null) return false;
    if (localStorage.getItem(SIGNED_IN_HINT_KEY) !== null) return false;
  } catch {
    return false;
  }
  return true;
}
