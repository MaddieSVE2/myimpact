/**
 * A marker this browser keeps while it has a signed-in session (set and
 * cleared by AuthProvider once the session is checked). It lets the app tell
 * a returning member from a first-time guest before the session check has
 * answered: see lib/prerender-hydration.ts.
 */
export const SIGNED_IN_HINT_KEY = "mi-signed-in";

export function hasSignedInHint(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(SIGNED_IN_HINT_KEY) === "1";
  } catch {
    return false;
  }
}

export function setSignedInHint(signedIn: boolean): void {
  try {
    if (signedIn) localStorage.setItem(SIGNED_IN_HINT_KEY, "1");
    else localStorage.removeItem(SIGNED_IN_HINT_KEY);
  } catch {
    // Storage blocked: the app then never reuses prerendered pages for them.
  }
}
