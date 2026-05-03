export const SUPPORTED_LOCALES = ["en", "cy"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_LABELS: Record<Locale, { native: string; short: string }> = {
  en: { native: "English", short: "EN" },
  cy: { native: "Cymraeg", short: "CY" },
};

export const LOCALE_COOKIE = "mi_lang";
export const LOCALE_COOKIE_MAX_AGE_DAYS = 365;

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}
