import { en, type Catalogue } from "./locales/en";
import { cy } from "./locales/cy";
import type { Locale } from "./config";

const CATALOGUES: Record<Locale, Catalogue> = { en, cy };

type AnyRecord = Record<string, unknown>;

function getByPath(obj: AnyRecord | undefined, path: string): unknown {
  if (!obj) return undefined;
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as AnyRecord)) {
      cur = (cur as AnyRecord)[p];
    } else {
      return undefined;
    }
  }
  return cur;
}

function interpolate(value: string, params?: Record<string, string | number>): string {
  if (!params) return value;
  return value.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => {
    const v = params[k];
    return v === undefined ? `{{${k}}}` : String(v);
  });
}

export type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

export function makeT(locale: Locale): TranslateFn {
  const primary = CATALOGUES[locale] as unknown as AnyRecord;
  const fallback = CATALOGUES.en as unknown as AnyRecord;
  return (key, params) => {
    const fromPrimary = getByPath(primary, key);
    const value =
      typeof fromPrimary === "string" ? fromPrimary : (getByPath(fallback, key) as string | undefined);
    if (typeof value !== "string") return key;
    return interpolate(value, params);
  };
}

export { CATALOGUES };
