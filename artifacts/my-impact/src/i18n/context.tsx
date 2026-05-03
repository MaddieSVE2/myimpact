import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE_DAYS,
  isLocale,
  type Locale,
} from "./config";
import { makeT, type TranslateFn } from "./t";
import { formatCurrency, formatDate, formatNumber, localeTag } from "./formatters";

interface LocaleContextValue {
  locale: Locale;
  setLocale: (next: Locale) => void;
  t: TranslateFn;
  format: {
    currency: (value: number, maxFractionDigits?: number) => string;
    number: (value: number) => string;
    date: (value: Date | string | number, options?: Intl.DateTimeFormatOptions) => string;
    tag: () => string;
  };
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) {
    const v = parts.pop()?.split(";").shift();
    return v ? decodeURIComponent(v) : null;
  }
  return null;
}

function writeCookie(name: string, value: string, maxAgeDays: number): void {
  if (typeof document === "undefined") return;
  const maxAge = maxAgeDays * 24 * 60 * 60;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
}

function detectInitialLocale(): Locale {
  const fromCookie = readCookie(LOCALE_COOKIE);
  if (isLocale(fromCookie)) return fromCookie;
  if (typeof navigator !== "undefined" && Array.isArray(navigator.languages)) {
    for (const lang of navigator.languages) {
      const lower = lang.toLowerCase();
      if (lower.startsWith("cy")) return "cy";
      if (lower.startsWith("en")) return "en";
    }
  }
  return DEFAULT_LOCALE;
}

const BASE = (typeof window !== "undefined"
  ? (import.meta as ImportMeta).env?.BASE_URL ?? "/"
  : "/"
).replace(/\/$/, "");

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => detectInitialLocale());

  // After mount, fetch authenticated user's preferred locale and adopt it
  // unless it's missing/invalid. Cookie + nav guess remain the seed for guests.
  useEffect(() => {
    let cancelled = false;
    fetch(`${BASE}/api/auth/me`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (cancelled || !data?.user) return;
        const pref = data.user.preferredLocale;
        if (isLocale(pref) && pref !== locale) setLocaleState(pref);
      })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reflect locale on <html lang> for accessibility / formatters
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("lang", localeTag(locale));
    }
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    writeCookie(LOCALE_COOKIE, next, LOCALE_COOKIE_MAX_AGE_DAYS);
    // Best-effort persist to user profile (silent for guests / errors)
    fetch(`${BASE}/api/auth/me`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferredLocale: next }),
    }).catch(() => {});
  }, []);

  const t = useMemo(() => makeT(locale), [locale]);

  const value = useMemo<LocaleContextValue>(() => ({
    locale,
    setLocale,
    t,
    format: {
      currency: (v, max = 0) => formatCurrency(v, locale, max),
      number: (v) => formatNumber(v, locale),
      date: (v, options) => formatDate(v, locale, options),
      tag: () => localeTag(locale),
    },
  }), [locale, setLocale, t]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within a LocaleProvider");
  return ctx;
}

/**
 * Convenience hook returning just the translation function.
 */
export function useT(): TranslateFn {
  return useLocale().t;
}
