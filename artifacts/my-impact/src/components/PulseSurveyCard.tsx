import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { ClipboardList, Lock, X, Check } from "lucide-react";
import { Link } from "wouter";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface ActiveSurvey {
  id: string;
  question: string;
  template: "meaningfulness" | "wellbeing" | "custom";
  schedule: "one_off" | "monthly" | "quarterly";
  anonymous: boolean;
  windowKey: string;
}

const SCALE_LABELS_MEANINGFULNESS = ["Not at all", "A little", "Somewhat", "Quite a bit", "Very much"];
const SCALE_LABELS_WELLBEING = ["Struggling", "Low", "OK", "Good", "Great"];

function dismissKey(surveyId: string, windowKey: string) {
  return `pulse-survey-dismissed:${surveyId}:${windowKey}`;
}

export function PulseSurveyCard() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<{ surveys: ActiveSurvey[]; optedOut: boolean }>({
    queryKey: ["org-active-surveys"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/org/surveys/active`, { credentials: "include" });
      if (res.status === 404) return { surveys: [], optedOut: false }; // not in an org
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
    retry: false,
  });

  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Pick the first survey not dismissed in this window (per browser/localStorage)
  const candidate = (data?.surveys ?? []).find(s => {
    try {
      return !window.localStorage.getItem(dismissKey(s.id, s.windowKey));
    } catch {
      return true;
    }
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!candidate || rating === null) throw new Error("Pick a rating first.");
      const res = await fetch(`${BASE}/api/org/surveys/${candidate.id}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ rating, comment: comment.trim() || undefined }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as { error?: string }).error ?? "Failed to send");
      return candidate.id;
    },
    onSuccess: (id) => {
      setSubmittedId(id);
      setError(null);
      // Refetch a moment later so the card slides away
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["org-active-surveys"] });
        setSubmittedId(null);
        setRating(null);
        setComment("");
      }, 1800);
    },
    onError: (err: Error) => setError(err.message),
  });

  function handleDismiss() {
    if (!candidate) return;
    try {
      window.localStorage.setItem(dismissKey(candidate.id, candidate.windowKey), "1");
    } catch {
      // ignore
    }
    qc.invalidateQueries({ queryKey: ["org-active-surveys"] });
    setRating(null);
    setComment("");
    setError(null);
  }

  if (isLoading || !candidate) return null;

  const labels = candidate.template === "wellbeing" ? SCALE_LABELS_WELLBEING : SCALE_LABELS_MEANINGFULNESS;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={candidate.id}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.35 }}
        className="bg-white border border-primary/30 rounded-2xl shadow-sm p-5 mb-6"
        data-testid="pulse-survey-card"
      >
        {submittedId === candidate.id ? (
          <div className="text-center py-4">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-primary mb-2">
              <Check className="w-5 h-5" />
            </div>
            <p className="text-sm font-semibold text-foreground">Thanks for sharing</p>
            <p className="text-xs text-muted-foreground mt-1">Your response helps your organisation listen better.</p>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <ClipboardList className="w-4 h-4 text-primary" />
                  <p className="text-[11px] uppercase tracking-wider font-semibold text-primary">Pulse · 30 seconds</p>
                  {candidate.anonymous && (
                    <span className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground inline-flex items-center gap-1">
                      <Lock className="w-2.5 h-2.5" /> Anonymous
                    </span>
                  )}
                </div>
                <h3 className="text-base font-display font-semibold text-foreground leading-snug">
                  {candidate.question}
                </h3>
              </div>
              <button
                type="button"
                onClick={handleDismiss}
                aria-label="Dismiss"
                className="shrink-0 p-1.5 rounded hover:bg-muted/30 text-muted-foreground"
                data-testid="button-dismiss-pulse"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-stretch justify-between gap-1 sm:gap-2 mb-3">
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  className={`flex-1 min-w-0 py-3 rounded-xl border text-sm font-semibold transition-all ${
                    rating === n
                      ? "border-primary bg-primary text-white scale-[1.03]"
                      : "border-border bg-white text-foreground hover:border-primary/40"
                  }`}
                  data-testid={`pulse-rating-${n}`}
                >
                  <span className="block text-base">{n}</span>
                  <span className="block text-[9px] uppercase tracking-wider mt-0.5 opacity-80">{labels[n - 1]}</span>
                </button>
              ))}
            </div>

            {rating !== null && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="overflow-hidden"
              >
                <textarea
                  value={comment}
                  onChange={e => setComment(e.target.value.slice(0, 500))}
                  placeholder="Anything you'd like to add? (optional)"
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:border-primary resize-none"
                  data-testid="pulse-comment"
                />
                {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
                <div className="flex items-center justify-between mt-3">
                  <p className="text-[11px] text-muted-foreground">
                    Don't want these? <Link href="/settings" className="underline hover:text-foreground">Turn off in settings</Link>
                  </p>
                  <button
                    type="button"
                    onClick={() => { setError(null); mutation.mutate(); }}
                    disabled={mutation.isPending}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
                    data-testid="button-submit-pulse"
                  >
                    {mutation.isPending ? "Sending…" : "Submit"}
                  </button>
                </div>
              </motion.div>
            )}
          </>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
