import type { Locale } from "./config";

const LOCALE_TAG: Record<Locale, string> = {
  en: "en-GB",
  cy: "cy-GB",
};

export function localeTag(locale: Locale): string {
  return LOCALE_TAG[locale] ?? "en-GB";
}

export function formatCurrency(value: number, locale: Locale = "en", maxFractionDigits = 0): string {
  return new Intl.NumberFormat(localeTag(locale), {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: maxFractionDigits,
  }).format(value);
}

export function formatNumber(value: number, locale: Locale = "en"): string {
  return new Intl.NumberFormat(localeTag(locale)).format(value);
}

export function formatDate(
  value: Date | string | number,
  locale: Locale = "en",
  options: Intl.DateTimeFormatOptions = { year: "numeric", month: "long", day: "numeric" },
): string {
  const d = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(localeTag(locale), options).format(d);
}

export function formatRelativeMonth(value: Date | string | number, locale: Locale = "en"): string {
  return formatDate(value, locale, { year: "numeric", month: "long" });
}
