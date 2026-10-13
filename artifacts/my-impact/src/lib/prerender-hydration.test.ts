import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canHydratePrerender } from "./prerender-hydration";

// A first-time guest's browser: English, nothing saved.
let stored: Map<string, string>;
beforeEach(() => {
  stored = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => stored.get(k) ?? null,
    setItem: (k: string, v: string) => void stored.set(k, v),
    removeItem: (k: string) => void stored.delete(k),
  });
  vi.stubGlobal("document", { cookie: "" });
  vi.stubGlobal("navigator", { languages: ["en-GB", "en"] });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const root = (prerendered?: string) => ({ dataset: prerendered === undefined ? {} : { prerendered } }) as unknown as HTMLElement;
const at = (pathname: string, search = "") => ({ pathname, search }) as Location;

describe("canHydratePrerender", () => {
  it("reuses the page prerendered for this path", () => {
    expect(canHydratePrerender(root("/about"), at("/about"))).toBe(true);
    expect(canHydratePrerender(root("/about"), at("/about/"))).toBe(true);
    expect(canHydratePrerender(root("/"), at("/"))).toBe(true);
  });

  it("draws the page itself on another path or without prerendered markup", () => {
    expect(canHydratePrerender(root("/"), at("/history"))).toBe(false);
    expect(canHydratePrerender(root(), at("/history"))).toBe(false);
  });

  it("ignores campaign tags but not other query parameters", () => {
    expect(canHydratePrerender(root("/"), at("/", "?utm_source=newsletter&gclid=abc"))).toBe(true);
    expect(canHydratePrerender(root("/login"), at("/login", "?from=/results"))).toBe(false);
  });

  it("draws the page itself for a Welsh visitor", () => {
    vi.stubGlobal("navigator", { languages: ["cy-GB"] });
    expect(canHydratePrerender(root("/"), at("/"))).toBe(false);
  });

  it("draws the page itself when the browser has saved settings that change it", () => {
    for (const [key, value] of [["mi-theme", "high-contrast"], ["mi-social-sharing", "false"], ["wizard_draft_v1", "{}"], ["mi-signed-in", "1"]]) {
      stored = new Map([[key!, value!]]);
      expect(canHydratePrerender(root("/"), at("/")), key).toBe(false);
    }
  });

  it("still reuses the page when saved settings are the defaults", () => {
    stored = new Map([["mi-theme", "default"], ["mi-social-sharing", "true"]]);
    expect(canHydratePrerender(root("/"), at("/"))).toBe(true);
  });

  it("draws the page itself when storage can't be read", () => {
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("blocked"); } });
    expect(canHydratePrerender(root("/"), at("/"))).toBe(false);
  });
});
