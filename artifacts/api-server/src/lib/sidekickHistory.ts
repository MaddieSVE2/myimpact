/**
 * Checks and trims the conversation a client sends to Sidekick chat.
 *
 * Only the person's NEW message is held to a strict limit. Everything
 * before it is history, most of it text Sidekick wrote itself, so history
 * that is too long is shortened rather than refused. Refusing it meant one
 * long reply (a UCAS outline runs well past 2,000 characters) made every
 * later message in that conversation fail.
 */

export interface SidekickMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Limit on the message the person has just sent. Kept small so a single
 * request cannot carry a huge prompt, but large enough for every built-in
 * template with a "different angle" line added (see sidekickHistory.test).
 */
export const MAX_USER_MESSAGE_CHARS = 1000;

/** Most recent messages sent to the model; older ones are dropped. */
export const MAX_MESSAGES = 20;
/** An earlier message from the person is cut to this length. */
export const MAX_USER_HISTORY_CHARS = 2000;
/**
 * An earlier Sidekick reply is cut to this length. Replies are capped at
 * 1,024 tokens, which stays under this for English and Welsh.
 */
export const MAX_ASSISTANT_HISTORY_CHARS = 8000;
/** Total history sent to the model, newest first; bounds the prompt cost. */
export const MAX_HISTORY_CHARS = 30_000;

export type PreparedHistory =
  | { ok: true; messages: SidekickMessage[] }
  | { ok: false; error: string };

function isMessage(value: unknown): value is SidekickMessage {
  if (value === null || typeof value !== "object") return false;
  const m = value as Record<string, unknown>;
  // Only these two roles: a client must not be able to add system messages.
  return (m.role === "user" || m.role === "assistant") && typeof m.content === "string";
}

function shorten(content: string, maxChars: number): string {
  return content.length > maxChars ? `${content.slice(0, maxChars - 1)}…` : content;
}

export function prepareSidekickHistory(raw: unknown): PreparedHistory {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, error: "messages array is required" };
  }
  if (!raw.every(isMessage)) {
    return { ok: false, error: "Each message needs a role of user or assistant and text content." };
  }
  const all = raw as SidekickMessage[];

  const latestUserIndex = all.map((m) => m.role).lastIndexOf("user");
  if (latestUserIndex === -1) {
    return { ok: false, error: "messages must include a message from the user" };
  }
  const latestLength = all[latestUserIndex]!.content.length;
  if (latestLength < 1 || latestLength > MAX_USER_MESSAGE_CHARS) {
    return {
      ok: false,
      error: `Your message must be between 1 and ${MAX_USER_MESSAGE_CHARS.toLocaleString("en-GB")} characters.`,
    };
  }

  // Walk back from the newest message, keeping as much recent history as
  // fits. The newest message is always kept.
  const kept: SidekickMessage[] = [];
  let total = 0;
  for (let i = all.length - 1; i >= 0 && kept.length < MAX_MESSAGES; i--) {
    const m = all[i]!;
    const content = shorten(
      m.content,
      m.role === "assistant" ? MAX_ASSISTANT_HISTORY_CHARS : MAX_USER_HISTORY_CHARS,
    );
    if (kept.length > 0 && total + content.length > MAX_HISTORY_CHARS) break;
    total += content.length;
    kept.unshift({ role: m.role, content });
  }
  return { ok: true, messages: kept };
}
