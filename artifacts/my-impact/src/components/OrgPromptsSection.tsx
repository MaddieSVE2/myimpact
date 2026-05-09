import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Building2, ClipboardList, Lock, Trophy, Target, Users,
  Calendar, X, Check, ArrowRight,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { formatCurrency } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface ActiveSurvey {
  id: string;
  question: string;
  template: "meaningfulness" | "wellbeing" | "custom";
  schedule: "one_off" | "monthly" | "quarterly";
  anonymous: boolean;
  windowKey: string;
}

interface OrgChallengePrompt {
  id: string;
  name: string;
  goalType: "social_value" | "hours";
  target: number;
  endDate: string;
  daysRemaining: number;
  participantCount: number;
  progressTotal: number;
  progressPercent: number;
  myContribution: number;
}

interface PromptsResponse {
  inOrg: boolean;
  surveys: ActiveSurvey[];
  challenges: OrgChallengePrompt[];
}

interface MyOrg {
  org: { id: string; name: string; type: string; role: string } | null;
}

const SCALE_LABELS_MEANINGFULNESS = ["Not at all", "A little", "Somewhat", "Quite a bit", "Very much"];
const SCALE_LABELS_WELLBEING = ["Struggling", "Low", "OK", "Good", "Great"];

function surveyDismissKey(surveyId: string, windowKey: string) {
  return `pulse-survey-dismissed:${surveyId}:${windowKey}`;
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function challengeSnoozeKey(challengeId: string) {
  return `challenge-prompt-snooze:${challengeId}:${todayKey()}`;
}

function isSnoozed(challengeId: string): boolean {
  try {
    return !!window.localStorage.getItem(challengeSnoozeKey(challengeId));
  } catch {
    return false;
  }
}

function snoozeChallenge(challengeId: string) {
  try {
    window.localStorage.setItem(challengeSnoozeKey(challengeId), "1");
  } catch {
    // ignore
  }
}

function formatGoal(goalType: string, value: number): string {
  if (goalType === "hours") return `${Math.round(value).toLocaleString()} hrs`;
  return formatCurrency(value);
}

// ─────────────────────────────────────────────────────────────────────────────
// Pulse survey card (full)
// ─────────────────────────────────────────────────────────────────────────────

function SurveyPromptFull({ survey, onResponded, onDismiss }: {
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
    <div
      className="bg-white border border-primary/30 rounded-2xl shadow-sm p-5"
      data-testid="org-prompt-survey"
    >
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
              data-testid="button-dismiss-org-survey"
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
                data-testid={`org-prompt-rating-${n}`}
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
                data-testid="org-prompt-comment"
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
                  data-testid="button-submit-org-prompt"
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

// ─────────────────────────────────────────────────────────────────────────────
// Challenge prompt card (full)
// ─────────────────────────────────────────────────────────────────────────────

function ChallengePromptFull({ c, onSnooze }: {
  c: OrgChallengePrompt;
  onSnooze: () => void;
}) {
  const daysLabel = c.daysRemaining === 0
    ? "Ends today"
    : c.daysRemaining === 1
      ? "1 day left"
      : `${c.daysRemaining} days left`;

  return (
    <div
      className="bg-white border border-border rounded-2xl shadow-sm p-5"
      data-testid="org-prompt-challenge"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <Trophy className="w-4 h-4 text-primary" />
            <p className="text-[11px] uppercase tracking-wider font-semibold text-primary">Org challenge</p>
            <span className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 inline-flex items-center gap-1">
              <Calendar className="w-2.5 h-2.5" /> {daysLabel}
            </span>
          </div>
          <h3 className="text-base font-display font-semibold text-foreground leading-snug truncate">
            {c.name}
          </h3>
        </div>
        <button
          type="button"
          onClick={onSnooze}
          aria-label="Snooze for today"
          title="Snooze for today"
          className="shrink-0 p-1.5 rounded hover:bg-muted/30 text-muted-foreground"
          data-testid={`button-snooze-challenge-${c.id}`}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-2 mb-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5" />
            {formatGoal(c.goalType, c.progressTotal)} of {formatGoal(c.goalType, c.target)}
          </span>
          <span className="font-semibold text-foreground">{c.progressPercent}%</span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${Math.min(100, c.progressPercent)}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
          <span className="inline-flex items-center gap-1">
            <Users className="w-3 h-3" />
            {c.participantCount} taking part
          </span>
          <span>
            You: <strong className="text-foreground">{formatGoal(c.goalType, c.myContribution)}</strong>
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Link
          href={`/wizard/actions?challenge=${c.id}`}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors"
          data-testid={`button-contribute-${c.id}`}
        >
          Contribute <ArrowRight className="w-3.5 h-3.5" />
        </Link>
        <Link
          href={`/challenges/${c.id}`}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border text-xs font-semibold text-foreground hover:bg-muted/30 transition-colors"
          data-testid={`button-view-challenge-${c.id}`}
        >
          View
        </Link>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Compact strip variant (for Challenges & Journal pages)
// ─────────────────────────────────────────────────────────────────────────────

function CompactRow({ icon, title, subtitle, action }: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-white border border-border rounded-xl">
      <div className="shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary inline-flex items-center justify-center">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground truncate">{title}</p>
        <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section
// ─────────────────────────────────────────────────────────────────────────────

interface OrgPromptsSectionProps {
  variant?: "full" | "compact";
}

export function OrgPromptsSection({ variant = "full" }: OrgPromptsSectionProps) {
  const { isLoggedIn, isLoading: authLoading } = useAuth();
  const qc = useQueryClient();

  const myOrgQuery = useQuery<MyOrg>({
    queryKey: ["my-org"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/org/my`, { credentials: "include" });
      if (!res.ok) return { org: null };
      return res.json();
    },
    enabled: !!isLoggedIn,
    retry: false,
  });

  const isMember = !!myOrgQuery.data?.org && myOrgQuery.data.org.role !== "manager";

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

  // Re-render trigger when local snooze/dismiss changes
  const [, setLocalTick] = useState(0);
  const bump = () => setLocalTick(t => t + 1);

  if (authLoading || !isLoggedIn) return null;
  if (!isMember) return null;
  if (promptsQuery.isLoading || !promptsQuery.data) return null;

  const surveys = promptsQuery.data.surveys.filter(s => {
    try {
      return !window.localStorage.getItem(surveyDismissKey(s.id, s.windowKey));
    } catch {
      return true;
    }
  });

  const challenges = promptsQuery.data.challenges.filter(c => !isSnoozed(c.id));

  if (surveys.length === 0 && challenges.length === 0) return null;

  function handleSurveyDismiss(s: ActiveSurvey) {
    try {
      window.localStorage.setItem(surveyDismissKey(s.id, s.windowKey), "1");
    } catch {
      // ignore
    }
    bump();
  }
  function handleSurveyResponded() {
    qc.invalidateQueries({ queryKey: ["org-prompts"] });
  }
  function handleChallengeSnooze(id: string) {
    snoozeChallenge(id);
    bump();
  }

  if (variant === "compact") {
    return (
      <div className="mb-6" data-testid="org-prompts-compact">
        <div className="flex items-center gap-2 mb-2">
          <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
          <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">For your organisation</p>
        </div>
        <div className="space-y-2">
          {surveys.map(s => (
            <CompactRow
              key={`survey-${s.id}`}
              icon={<ClipboardList className="w-4 h-4" />}
              title={s.question}
              subtitle={s.anonymous ? "Anonymous · 30 seconds" : "30 seconds"}
              action={
                <div className="flex items-center gap-1.5">
                  <Link
                    href="/#org-prompts-section"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                    data-testid={`link-answer-survey-compact-${s.id}`}
                  >
                    Answer <ArrowRight className="w-3 h-3" />
                  </Link>
                  <button
                    onClick={() => handleSurveyDismiss(s)}
                    aria-label="Dismiss"
                    title="Dismiss"
                    className="p-1 rounded text-muted-foreground hover:bg-muted/30"
                    data-testid={`button-dismiss-survey-compact-${s.id}`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              }
            />
          ))}
          {challenges.map(c => {
            const days = c.daysRemaining;
            const subtitle = `${c.progressPercent}% of target · ${days === 0 ? "ends today" : days === 1 ? "1 day left" : `${days} days left`}`;
            return (
              <CompactRow
                key={c.id}
                icon={<Trophy className="w-4 h-4" />}
                title={c.name}
                subtitle={subtitle}
                action={
                  <div className="flex items-center gap-1.5">
                    <Link
                      href={`/wizard/actions?challenge=${c.id}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-primary text-white text-[11px] font-semibold hover:bg-primary/90"
                      data-testid={`button-contribute-compact-${c.id}`}
                    >
                      Contribute
                    </Link>
                    <button
                      onClick={() => handleChallengeSnooze(c.id)}
                      aria-label="Snooze for today"
                      title="Snooze for today"
                      className="p-1 rounded text-muted-foreground hover:bg-muted/30"
                      data-testid={`button-snooze-compact-${c.id}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                }
              />
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <section
      data-testid="org-prompts-full"
      style={{ background: "white", padding: "16px 5% 0" }}
      className="mb-[100px] pb-[16px] bg-[#f6f4ee]">
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <div className="flex items-center gap-2 mb-3">
        <Building2 className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-display font-semibold text-foreground">For your organisation</h2>
      </div>
      <div className="space-y-3">
        <AnimatePresence initial={false}>
          {surveys.map(s => (
            <motion.div
              key={`survey-${s.id}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
            >
              <SurveyPromptFull
                survey={s}
                onResponded={handleSurveyResponded}
                onDismiss={() => handleSurveyDismiss(s)}
              />
            </motion.div>
          ))}
          {challenges.map(c => (
            <motion.div
              key={`ch-${c.id}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
            >
              <ChallengePromptFull c={c} onSnooze={() => handleChallengeSnooze(c.id)} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      </div>
    </section>
  );
}
