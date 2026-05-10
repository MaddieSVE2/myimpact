import { Link } from "wouter";
import { ClipboardList, AlertCircle } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, Check, X } from "lucide-react";
import { Footer } from "@/components/layout/Footer";
import { useAuth } from "@/lib/auth-context";
import { useMyOrg } from "@/lib/org-export";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const SCALE_LABELS_MEANINGFULNESS = ["Not at all", "A little", "Somewhat", "Quite a bit", "Very much"];
const SCALE_LABELS_WELLBEING = ["Struggling", "Low", "OK", "Good", "Great"];

interface ActiveSurvey {
  id: string;
  question: string;
  template: "meaningfulness" | "wellbeing" | "custom";
  schedule: "one_off" | "monthly" | "quarterly";
  anonymous: boolean;
  windowKey: string;
}

interface PromptsResponse {
  inOrg: boolean;
  surveys: ActiveSurvey[];
  challenges: unknown[];
}

function surveyDismissKey(surveyId: string, windowKey: string) {
  return `pulse-survey-dismissed:${surveyId}:${windowKey}`;
}

function SurveyCard({ survey, onResponded, onDismiss }: {
  survey: ActiveSurvey;
  onResponded: () => void;
  onDismiss: () => void;
}) {
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      if (rating === null) throw new Error("Pick a rating first.");
      const res = await fetch(`${BASE}/api/org/surveys/${survey.id}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ rating, comment: comment.trim() || undefined }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as { error?: string }).error ?? "Failed to send");
    },
    onSuccess: () => {
      setSubmitted(true);
      setError(null);
      setTimeout(() => onResponded(), 1400);
    },
    onError: (err: Error) => setError(err.message),
  });

  const labels = survey.template === "wellbeing" ? SCALE_LABELS_WELLBEING : SCALE_LABELS_MEANINGFULNESS;

  return (
    <div className="bg-white border border-primary/30 rounded-2xl shadow-sm p-5" data-testid="member-pulse-survey-card">
      {submitted ? (
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
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <ClipboardList className="w-4 h-4 text-primary" />
                <p className="text-[11px] uppercase tracking-wider font-semibold text-primary">Pulse · 30 seconds</p>
                {survey.anonymous && (
                  <span className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground inline-flex items-center gap-1">
                    <Lock className="w-2.5 h-2.5" /> Anonymous
                  </span>
                )}
              </div>
              <h3 className="text-base font-display font-semibold text-foreground leading-snug">
                {survey.question}
              </h3>
            </div>
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss"
              className="shrink-0 p-1.5 rounded hover:bg-muted/30 text-muted-foreground"
              data-testid="button-dismiss-member-pulse-survey"
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
                data-testid={`member-pulse-rating-${n}`}
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
                data-testid="member-pulse-comment"
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
                  data-testid="button-submit-member-pulse"
                >
                  {mutation.isPending ? "Sending…" : "Submit"}
                </button>
              </div>
            </motion.div>
          )}
        </>
      )}
    </div>
  );
}

export default function OrgMemberPulse() {
  const { isLoggedIn, isLoading: authLoading } = useAuth();
  const qc = useQueryClient();
  const [, setLocalTick] = useState(0);
  const bump = () => setLocalTick(t => t + 1);

  const { data: orgData, isLoading: orgLoading } = useMyOrg();
  const isMember = !!orgData?.org && orgData.org.role !== "manager";

  const promptsQuery = useQuery<PromptsResponse>({
    queryKey: ["org-prompts"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/org/prompts`, { credentials: "include" });
      if (!res.ok) return { inOrg: false, surveys: [], challenges: [] };
      return res.json();
    },
    enabled: !!isLoggedIn && isMember,
    retry: false,
  });

  const surveys = (promptsQuery.data?.surveys ?? []).filter(s => {
    try {
      return !window.localStorage.getItem(surveyDismissKey(s.id, s.windowKey));
    } catch {
      return true;
    }
  });

  function handleDismiss(s: ActiveSurvey) {
    try {
      window.localStorage.setItem(surveyDismissKey(s.id, s.windowKey), "1");
    } catch {
      // ignore
    }
    bump();
  }

  function handleResponded() {
    qc.invalidateQueries({ queryKey: ["org-prompts"] });
  }

  if (authLoading || orgLoading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 flex justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!orgData?.org) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <p className="text-base font-semibold mb-2">You're not in an organisation yet.</p>
        <Link href="/org" className="text-primary underline">Go to the organisation portal</Link>
      </div>
    );
  }

  if (!isMember) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <p className="text-base font-semibold mb-2">This page is for organisation members.</p>
        <Link href="/org/pulse" className="text-primary underline">Go to the manager pulse view</Link>
      </div>
    );
  }

  return (
    <>
      <div className="max-w-2xl mx-auto px-4 py-8" data-testid="org-member-pulse-root">
        <div className="flex items-center gap-2 mb-1">
          <ClipboardList className="w-5 h-5 text-primary" />
          <h1 className="text-2xl font-display font-semibold text-foreground">Pulse</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          Short check-ins from your organisation. Takes about 30 seconds.
        </p>

        {promptsQuery.isLoading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : promptsQuery.isError ? (
          <div className="text-center py-16">
            <AlertCircle className="w-6 h-6 text-red-500 mx-auto mb-2" />
            <p className="text-sm font-semibold">Could not load surveys</p>
          </div>
        ) : surveys.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground" data-testid="member-pulse-empty">
            <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-base font-semibold text-foreground mb-1">No active surveys right now</p>
            <p className="text-sm">Check back later — your organisation will post surveys here when they have one running.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <AnimatePresence initial={false}>
              {surveys.map(s => (
                <motion.div
                  key={s.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                >
                  <SurveyCard
                    survey={s}
                    onResponded={handleResponded}
                    onDismiss={() => handleDismiss(s)}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
      <Footer />
    </>
  );
}
