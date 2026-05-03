export {
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  LOCALE_LABELS,
  LOCALE_COOKIE,
  isLocale,
  type Locale,
} from "./config";
export { LocaleProvider, useLocale, useT } from "./context";
export { formatCurrency, formatNumber, formatDate, localeTag } from "./formatters";
export { makeT, CATALOGUES } from "./t";
