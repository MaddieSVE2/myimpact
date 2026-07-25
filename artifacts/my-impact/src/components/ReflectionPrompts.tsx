import { useState, useEffect, useRef } from "react";
import { Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ReflectionPromptsProps {
  /** The user's current draft text — used as context for the questions. */
  text: string;
  /** Optional extra context (e.g. the reflection prompt or activity summary). */
  context?: string;
  /** Called when a question is tapped, so the parent can seed/focus the field. */
  onPick: (question: string) => void;
  className?: string;
}

const MIN_CHARS = 15;
const DEBOUNCE_MS = 900;
/** Hard cap on the visible loading state before we fall back. */
const FETCH_TIMEOUT_MS = 6000;

/**
 * Generic reflection questions shown when the request fails, times out, or
 * the user is over their AI quota — so the panel never just vanishes.
 */
const FALLBACK_QUESTIONS: string[] = [
  "What did you learn from doing this?",
  "Who did this help, and how?",
  "What changed as a result of your effort?",
  "What was the most rewarding part?",
  "How did it make you feel afterwards?",
  "Did you pick up any new skills?",
];

function pickFallbacks(): string[] {
  const start = Math.floor(Math.random() * FALLBACK_QUESTIONS.length);
  return [0, 2, 4].map((i) => FALLBACK_QUESTIONS[(start + i) % FALLBACK_QUESTIONS.length]);
}

/**
 * Subtle, self-contained AI clarifying-question helper that sits beneath a
 * free-text reflection / description field. It debounces requests while the
 * user types and only asks once there is enough text to work with. If AI is
 * slow, unavailable, or over quota it shows generic fallback questions
 * instead of vanishing. It never blocks typing or saving.
 */
export function ReflectionPrompts({ text, context, onPick, className }: ReflectionPromptsProps) {
  const [questions, setQuestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const lastFetchedRef = useRef<string>("");

  useEffect(() => {
    if (dismissed) return;

    const trimmed = text.trim();
    if (trimmed.length < MIN_CHARS) {
      setQuestions([]);
      setLoading(false);
      return;
    }
    if (trimmed === lastFetchedRef.current) return;

    const controller = new AbortController();
    let timedOut = false;
    let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(async () => {
      setLoading(true);
      // Never let the loading message linger: after the cap, abort the
      // request and show fallback questions instead.
      timeoutTimer = setTimeout(() => {
        timedOut = true;
        controller.abort();
        lastFetchedRef.current = trimmed;
        setQuestions(pickFallbacks());
        setLoading(false);
      }, FETCH_TIMEOUT_MS);
      try {
        const base = import.meta.env.BASE_URL.replace(/\/$/, "");
        const res = await fetch(`${base}/api/reflection/questions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ text: trimmed, context }),
          signal: controller.signal,
        });
        // Quietly stay silent when signed out; fall back on quota (429)
        // or server errors so the user still gets something useful.
        if (!res.ok) {
          lastFetchedRef.current = trimmed;
          setQuestions(res.status === 401 || res.status === 403 ? [] : pickFallbacks());
          return;
        }
        const data = (await res.json()) as { questions?: string[] };
        lastFetchedRef.current = trimmed;
        const list = Array.isArray(data.questions) ? data.questions.slice(0, 3) : [];
        setQuestions(list.length > 0 ? list : pickFallbacks());
      } catch {
        if (!controller.signal.aborted) {
          lastFetchedRef.current = trimmed;
          setQuestions(pickFallbacks());
        }
      } finally {
        if (timeoutTimer) clearTimeout(timeoutTimer);
        // Always clear loading (unless the timeout path already did) so the
        // spinner can never linger after an abort or error.
        if (!timedOut) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      controller.abort();
    };
  }, [text, context, dismissed]);

  if (dismissed) return null;
  if (!loading && questions.length === 0) return null;

  return (
    <div className={cn("mt-2.5", className)} aria-live="polite">
      <div className="flex items-center justify-between mb-1.5">
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
          <Sparkles className="w-3 h-3" style={{ color: "#F06127" }} aria-hidden="true" />
          {loading && questions.length === 0 ? "Coming up with questions to help you say more…" : "Stuck for words? Tap a question for ideas"}
        </span>
        {questions.length > 0 && (
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="text-muted-foreground/60 hover:text-muted-foreground transition-colors"
            aria-label="Hide suggestions"
          >
            <X className="w-3 h-3" aria-hidden="true" />
          </button>
        )}
      </div>
      {questions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {questions.map((q, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onPick(q)}
              className="text-left text-[11px] leading-snug px-2.5 py-1.5 rounded-full border border-border bg-white/70 text-foreground/80 hover:border-primary hover:text-primary transition-colors"
            >
              {q}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Append a tapped clarifying question to the end of the current draft as a
 * gentle prompt, without overwriting anything the user has already written.
 * The trailing space leaves the caret ready for them to answer in their own
 * words.
 */
export function seedReflection(current: string, question: string): string {
  const base = current.replace(/\s+$/, "");
  if (!base) return `${question} `;
  return `${base}\n\n${question} `;
}
