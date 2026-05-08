export const CHALLENGE_CONTEXT_KEY = "wizard:challenge-context";

function safeWindow(): Window | null {
  return typeof window === "undefined" ? null : window;
}

export function getChallengeContext(): string | null {
  const w = safeWindow();
  if (!w) return null;
  try {
    return w.sessionStorage.getItem(CHALLENGE_CONTEXT_KEY);
  } catch {
    return null;
  }
}

export function setChallengeContext(challengeId: string): void {
  const w = safeWindow();
  if (!w) return;
  try {
    w.sessionStorage.setItem(CHALLENGE_CONTEXT_KEY, challengeId);
  } catch {
    /* ignore */
  }
}

export function clearChallengeContext(): void {
  const w = safeWindow();
  if (!w) return;
  try {
    w.sessionStorage.removeItem(CHALLENGE_CONTEXT_KEY);
  } catch {
    /* ignore */
  }
}

export function consumeChallengeContextForSave(): string | null {
  const id = getChallengeContext();
  if (id) clearChallengeContext();
  return id;
}
