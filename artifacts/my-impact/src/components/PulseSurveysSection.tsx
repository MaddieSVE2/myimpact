import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ClipboardList,
  Plus,
  Archive,
  ChevronDown,
  ChevronUp,
  X,
  Lock,
  MessageSquare,
} from "lucide-react";
import {
  DEMO_PULSE_SURVEYS,
  DEMO_COMMENT_PRIVACY_THRESHOLD,
  type DemoPulseSurvey,
} from "@/lib/org-demo-mock";
import { ScoreIndicator } from "@/components/ui/ScoreIndicator";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Schedule = "one_off" | "monthly" | "quarterly";
type Template = "meaningfulness" | "wellbeing" | "custom";

interface SurveyListItem {
  id: string;
  template: Template;
  question: string;
  schedule: Schedule;
  anonymous: boolean;
  createdAt: string;
  archivedAt: string | null;
  latestAverage: number | null;
}

interface TemplateOption {
  key: Template;
  label: string;
  question: string;
}

interface SurveyResults {
  survey: SurveyListItem;
  totals: { responses: number; average: number };
  distribution: Array<{ rating: number; count: number }>;
  trend: Array<{ windowKey: string; label: string; average: number; count: number; distribution: Array<{ rating: number; count: number }> }>;
  comments: Array<{ id: string; comment: string; windowKey: string; windowLabel: string; createdAt: string }>;
  commentPrivacyThreshold: number;
}

const SCHEDULE_LABELS: Record<Schedule, string> = {
  one_off: "One-off",
  monthly: "Monthly",
  quarterly: "Quarterly",
};

type SentimentBadge = { label: string; className: string } | null;

function getSentimentBadge(
  distribution: Array<{ rating: number; count: number }>,
  totalResponses: number,
): SentimentBadge {
  if (totalResponses === 0) return null;
  const positive = distribution.filter(d => d.rating >= 4).reduce((s, d) => s + d.count, 0);
  const negative = distribution.filter(d => d.rating <= 2).reduce((s, d) => s + d.count, 0);
  const posRatio = positive / totalResponses;
  const negRatio = negative / totalResponses;
  if (posRatio >= 0.6) {
    return { label: "Mostly Positive", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" };
  }
  if (negRatio >= 0.4) {
    return { label: "Needs Attention", className: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" };
  }
  return { label: "Mixed", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" };
}

function useSurveys() {
  return useQuery<{ surveys: SurveyListItem[] }>({
    queryKey: ["org-surveys"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/org/surveys`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load surveys");
      return res.json();
    },
  });
}

function useTemplates() {
  return useQuery<{ templates: TemplateOption[]; schedules: Schedule[] }>({
    queryKey: ["org-survey-templates"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/org/surveys/templates`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });
}

function useSurveyResults(id: string | null) {
  return useQuery<SurveyResults>({
    queryKey: ["org-survey-results", id],
    enabled: !!id,
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/org/surveys/${id}/results`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });
}

export function PulseSurveysSection({ isDemoOrg = false }: { isDemoOrg?: boolean } = {}) {
  if (isDemoOrg) {
    return <DemoPulseSurveysSection />;
  }
  return <LivePulseSurveysSection />;
}

function LivePulseSurveysSection() {
  const qc = useQueryClient();
  const { data: surveysData, isLoading } = useSurveys();
  const { data: templatesData } = useTemplates();
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  // New-survey form state
  const [template, setTemplate] = useState<Template>("meaningfulness");
  const [question, setQuestion] = useState("");
  const [schedule, setSchedule] = useState<Schedule>("monthly");
  const [anonymous, setAnonymous] = useState(true);
  const [createError, setCreateError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = { template, schedule, anonymous };
      if (template === "custom") body.question = question.trim();
      else if (question.trim()) body.question = question.trim();
      const res = await fetch(`${BASE}/api/org/surveys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to create survey");
      return json;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org-surveys"] });
      setCreating(false);
      setQuestion("");
      setTemplate("meaningfulness");
      setSchedule("monthly");
      setAnonymous(true);
      setCreateError(null);
    },
    onError: (err: Error) => setCreateError(err.message),
  });

  const archiveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${BASE}/api/org/surveys/${id}/archive`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as { error?: string }).error ?? "Failed to archive");
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["org-surveys"] }),
  });

  const allSurveys = surveysData?.surveys ?? [];
  const active = allSurveys.filter(s => !s.archivedAt);
  const archived = allSurveys.filter(s => s.archivedAt);

  // When user picks a built-in template, sync the question field as a hint
  function handleTemplateChange(next: Template) {
    setTemplate(next);
    if (next !== "custom") {
      const t = templatesData?.templates.find(t => t.key === next);
      setQuestion(t?.question ?? "");
    } else {
      setQuestion("");
    }
  }

  return (
    <motion.div
      className="bg-white border border-border rounded-xl p-5 mb-6"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.06 }}
      data-testid="section-pulse-surveys"
    >
      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Member pulse surveys</h3>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            30-second prompts that help you measure how your members are feeling and how meaningful their work is. Anonymous by default.
          </p>
        </div>
        {!creating && (
          <button
            type="button"
            onClick={() => { setCreating(true); setCreateError(null); handleTemplateChange("meaningfulness"); }}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors"
            data-testid="button-new-pulse-survey"
          >
            <Plus className="w-3.5 h-3.5" /> New survey
          </button>
        )}
      </div>

      {creating && (
        <div className="mt-4 p-4 rounded-lg border border-border bg-muted/20 space-y-3">
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">Template</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(templatesData?.templates ?? []).map(t => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => handleTemplateChange(t.key)}
                  className={`text-left px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                    template === t.key
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border bg-white text-foreground hover:bg-muted/30"
                  }`}
                  data-testid={`pulse-template-${t.key}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">
              Question {template !== "custom" && <span className="text-muted-foreground font-normal">(edit if you like)</span>}
            </label>
            <input
              type="text"
              value={question}
              onChange={e => setQuestion(e.target.value.slice(0, 200))}
              placeholder={template === "custom" ? "e.g. How connected do you feel to your community?" : ""}
              maxLength={200}
              className="w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:border-primary"
              data-testid="input-pulse-question"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5">How often</label>
              <select
                value={schedule}
                onChange={e => setSchedule(e.target.value as Schedule)}
                className="w-full px-3 py-2 rounded-lg border border-border text-sm bg-white focus:outline-none focus:border-primary"
                data-testid="select-pulse-schedule"
              >
                <option value="one_off">One-off (each member responds once)</option>
                <option value="monthly">Monthly (one response per month)</option>
                <option value="quarterly">Quarterly (one response per quarter)</option>
              </select>
            </div>
            <div className="flex items-center gap-2 sm:pt-6">
              <input
                id="pulse-anon"
                type="checkbox"
                checked={anonymous}
                onChange={e => setAnonymous(e.target.checked)}
                className="rounded border-border w-4 h-4 text-primary focus:ring-primary"
                data-testid="checkbox-pulse-anonymous"
              />
              <label htmlFor="pulse-anon" className="text-xs text-foreground inline-flex items-center gap-1">
                <Lock className="w-3 h-3" /> Anonymous responses
              </label>
            </div>
          </div>
          {createError && <p className="text-xs text-red-600">{createError}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => { setCreating(false); setCreateError(null); }}
              className="px-3 py-2 rounded-lg border border-border text-xs font-semibold text-foreground hover:bg-muted/30 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => { setCreateError(null); createMutation.mutate(); }}
              disabled={createMutation.isPending || (template === "custom" && !question.trim())}
              className="px-3 py-2 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
              data-testid="button-create-pulse-survey"
            >
              {createMutation.isPending ? "Creating…" : "Launch survey"}
            </button>
          </div>
        </div>
      )}

      <div className="mt-4">
        {isLoading ? (
          <div className="py-6 flex justify-center">
            <div className="animate-spin w-5 h-5 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : active.length === 0 && archived.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">
            No surveys yet. Launch one to start hearing from your members.
          </p>
        ) : (
          <div className="space-y-2">
            {active.map(s => (
              <SurveyRow
                key={s.id}
                survey={s}
                open={openId === s.id}
                onToggle={() => setOpenId(openId === s.id ? null : s.id)}
                onArchive={() => {
                  if (confirm(`Archive this survey? Members will stop seeing it. Existing responses are kept.`)) {
                    archiveMutation.mutate(s.id);
                    if (openId === s.id) setOpenId(null);
                  }
                }}
                disabled={archiveMutation.isPending}
              />
            ))}
            {archived.length > 0 && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setShowArchived(v => !v)}
                  className="text-xs font-medium text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                  data-testid="toggle-archived-surveys"
                >
                  {showArchived ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  {showArchived ? "Hide" : "Show"} archived ({archived.length})
                </button>
                {showArchived && (
                  <div className="mt-2 space-y-2">
                    {archived.map(s => (
                      <SurveyRow
                        key={s.id}
                        survey={s}
                        open={openId === s.id}
                        onToggle={() => setOpenId(openId === s.id ? null : s.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function SurveyRow({
  survey,
  open,
  onToggle,
  onArchive,
  disabled,
}: {
  survey: SurveyListItem;
  open: boolean;
  onToggle: () => void;
  onArchive?: () => void;
  disabled?: boolean;
}) {
  const isArchived = !!survey.archivedAt;
  const { data: resultsData } = useSurveyResults(survey.id);
  const sentimentBadge = resultsData
    ? getSentimentBadge(resultsData.distribution, resultsData.totals.responses)
    : null;
  return (
    <div
      className={`rounded-lg border transition-colors ${isArchived ? "border-border bg-muted/20 hover:bg-muted/40" : "border-border bg-white hover:bg-muted/30"}`}
      data-testid={`survey-row-${survey.id}`}
    >
      <div className="flex items-start justify-between gap-3 p-3">
        <button
          type="button"
          onClick={onToggle}
          className="text-left min-w-0 flex-1"
          data-testid={`button-toggle-survey-${survey.id}`}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <ScoreIndicator average={survey.latestAverage} />
            <span className="text-sm font-semibold text-foreground truncate">{survey.question}</span>
            <span className={`text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded ${isArchived ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"}`}>
              {isArchived ? "Archived" : SCHEDULE_LABELS[survey.schedule]}
            </span>
            {survey.anonymous && (
              <span className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground inline-flex items-center gap-1">
                <Lock className="w-2.5 h-2.5" /> Anonymous
              </span>
            )}
            {sentimentBadge && (
              <span
                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${sentimentBadge.className}`}
                data-testid={`badge-sentiment-${survey.id}`}
              >
                {sentimentBadge.label}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Launched {new Date(survey.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
            {isArchived && ` · archived ${new Date(survey.archivedAt!).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`}
          </p>
        </button>
        <div className="flex items-center gap-1 shrink-0">
          {!isArchived && onArchive && (
            <button
              type="button"
              onClick={onArchive}
              disabled={disabled}
              className="inline-flex items-center gap-1 px-2 py-1.5 rounded text-xs font-semibold text-muted-foreground border border-border hover:bg-muted/30 transition-colors disabled:opacity-60"
              data-testid={`button-archive-survey-${survey.id}`}
            >
              <Archive className="w-3 h-3" /> Archive
            </button>
          )}
          <button
            type="button"
            onClick={onToggle}
            className="p-1.5 rounded hover:bg-muted/30"
            aria-label={open ? "Collapse" : "Expand"}
          >
            {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </button>
        </div>
      </div>
      {open && <SurveyResultsView surveyId={survey.id} />}
    </div>
  );
}

function SurveyResultsView({ surveyId }: { surveyId: string }) {
  const { data, isLoading } = useSurveyResults(surveyId);
  if (isLoading || !data) {
    return (
      <div className="border-t border-border p-4 flex justify-center">
        <div className="animate-spin w-4 h-4 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }
  return (
    <ResultsPanel
      surveyId={surveyId}
      initialDistribution={data.distribution}
      initialAverage={data.totals.average}
      totalResponses={data.totals.responses}
      trend={data.trend}
      allComments={data.comments}
      anonymous={data.survey.anonymous}
      commentPrivacyThreshold={data.commentPrivacyThreshold}
    />
  );
}

function ResultsPanel({
  surveyId,
  initialDistribution,
  initialAverage,
  totalResponses,
  trend,
  allComments,
  anonymous,
  commentPrivacyThreshold,
}: {
  surveyId: string;
  initialDistribution: Array<{ rating: number; count: number }>;
  initialAverage: number;
  totalResponses: number;
  trend: Array<{ windowKey: string; label: string; average: number; count: number; distribution?: Array<{ rating: number; count: number }> }>;
  allComments: Array<{ id: string; comment: string; windowKey?: string; windowLabel: string }>;
  anonymous: boolean;
  commentPrivacyThreshold: number;
}) {
  const hasWindowSwitching = trend.some(t => t.distribution !== undefined) && trend.length > 1;
  const [windowKey, setWindowKey] = useState<string>("all");

  const selectedWindow = hasWindowSwitching && windowKey !== "all"
    ? trend.find(t => t.windowKey === windowKey) ?? null
    : null;

  const distribution = selectedWindow?.distribution ?? initialDistribution;
  const average = selectedWindow?.average ?? initialAverage;
  const responses = selectedWindow?.count ?? totalResponses;

  const positive = distribution.filter(d => d.rating >= 4).reduce((s, d) => s + d.count, 0);
  const neutral = distribution.filter(d => d.rating === 3).reduce((s, d) => s + d.count, 0);
  const negative = distribution.filter(d => d.rating <= 2).reduce((s, d) => s + d.count, 0);
  const positivePct = responses > 0 ? Math.round((positive / responses) * 100) : 0;
  const neutralPct = responses > 0 ? Math.round((neutral / responses) * 100) : 0;
  const negativePct = Math.max(0, 100 - positivePct - neutralPct);

  const delta = !selectedWindow && trend.length >= 2
    ? +(trend[trend.length - 1].average - trend[trend.length - 2].average).toFixed(1)
    : null;

  const scoreColor = average >= 4 ? "text-emerald-600" : average >= 3 ? "text-amber-600" : "text-red-600";
  const scoreBg = average >= 4 ? "bg-emerald-50 border-emerald-100" : average >= 3 ? "bg-amber-50 border-amber-100" : "bg-red-50 border-red-100";
  const max = Math.max(1, ...distribution.map(d => d.count));
  const CHART_H = 72;

  const commentsBelowThreshold = anonymous && !!selectedWindow && selectedWindow.count < commentPrivacyThreshold;
  const visibleComments = commentsBelowThreshold ? [] : allComments.filter(c => {
    if (selectedWindow) return c.windowKey === selectedWindow.windowKey;
    if (anonymous && c.windowKey) {
      const w = trend.find(t => t.windowKey === c.windowKey);
      return !!w && w.count >= commentPrivacyThreshold;
    }
    return true;
  });

  const distributionLabel = selectedWindow
    ? `Score distribution · ${selectedWindow.label}`
    : trend.length > 1 ? "Score distribution · All time" : "Score distribution";

  return (
    <div className="border-t border-border p-4 space-y-5 bg-muted/10" data-testid={`survey-results-${surveyId}`}>
      {/* Window switcher */}
      {hasWindowSwitching && (
        <div>
          <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">Response window</p>
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Response window">
            <button
              type="button"
              role="tab"
              aria-selected={windowKey === "all"}
              onClick={() => setWindowKey("all")}
              className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold transition-colors ${windowKey === "all" ? "border-primary bg-primary/10 text-primary" : "border-border bg-white text-muted-foreground hover:bg-muted/30"}`}
              data-testid={`survey-window-${surveyId}-all`}
            >
              All time
            </button>
            {trend.map(t => (
              <button
                key={t.windowKey}
                type="button"
                role="tab"
                aria-selected={windowKey === t.windowKey}
                onClick={() => setWindowKey(t.windowKey)}
                className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold transition-colors ${windowKey === t.windowKey ? "border-primary bg-primary/10 text-primary" : "border-border bg-white text-muted-foreground hover:bg-muted/30"}`}
                data-testid={`survey-window-${surveyId}-${t.windowKey}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Score hero */}
      <div className="grid grid-cols-3 gap-2.5">
        <div className={`rounded-xl border p-3.5 text-center ${scoreBg}`}>
          <p className={`text-3xl font-display font-black leading-none ${scoreColor}`} data-testid={`survey-average-${surveyId}`}>
            {responses > 0 ? average.toFixed(1) : "—"}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">out of 5</p>
        </div>
        <div className="rounded-xl border border-border bg-white p-3.5 text-center">
          <p className="text-3xl font-display font-black text-foreground leading-none" data-testid={`survey-count-${surveyId}`}>
            {responses}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">responses</p>
        </div>
        <div className="rounded-xl border border-border bg-white p-3.5 text-center">
          {delta !== null ? (
            <>
              <p className={`text-3xl font-display font-black leading-none ${delta > 0 ? "text-emerald-600" : delta < 0 ? "text-red-500" : "text-foreground"}`}>
                {delta > 0 ? "+" : ""}{delta.toFixed(1)}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">vs prev period</p>
            </>
          ) : (
            <>
              <p className={`text-3xl font-display font-black leading-none ${positivePct >= 60 ? "text-emerald-600" : positivePct < 40 ? "text-red-500" : "text-amber-600"}`}>
                {responses > 0 ? `${positivePct}%` : "—"}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">positive (4–5)</p>
            </>
          )}
        </div>
      </div>

      {/* Sentiment bar */}
      {responses > 0 && (
        <div>
          <div className="h-2 rounded-full overflow-hidden flex gap-px">
            {positivePct > 0 && <div className="h-full bg-emerald-500" style={{ width: `${positivePct}%` }} />}
            {neutralPct > 0 && <div className="h-full bg-amber-400" style={{ width: `${neutralPct}%` }} />}
            {negativePct > 0 && <div className="h-full bg-red-400" style={{ width: `${negativePct}%` }} />}
          </div>
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-[10px] text-muted-foreground">{positivePct}% positive (4–5)</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-amber-400" />
              <span className="text-[10px] text-muted-foreground">{neutralPct}% neutral (3)</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-red-400" />
              <span className="text-[10px] text-muted-foreground">{negativePct}% low (1–2)</span>
            </span>
          </div>
        </div>
      )}

      {/* Distribution chart */}
      <div>
        <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2.5" data-testid={`survey-distribution-label-${surveyId}`}>
          {distributionLabel}
        </p>
        {responses === 0 ? (
          <p className="text-sm italic text-muted-foreground">No responses yet.</p>
        ) : (
          <div data-testid={`survey-distribution-${surveyId}`}>
            <div className="flex items-end gap-2 border-b border-border" style={{ height: `${CHART_H + 28}px` }}>
              {distribution.map(d => {
                const pct = responses > 0 ? Math.round((d.count / responses) * 100) : 0;
                const barColor = d.rating <= 2 ? "bg-red-400" : d.rating === 3 ? "bg-amber-400" : "bg-emerald-500";
                return (
                  <div key={d.rating} className="flex-1 flex flex-col items-center justify-end h-full gap-0.5">
                    {d.count > 0 ? (
                      <>
                        <span className="text-[10px] font-semibold text-foreground">{pct}%</span>
                        <span className="text-[9px] text-muted-foreground">{d.count}</span>
                      </>
                    ) : (
                      <span className="text-[9px] text-muted-foreground">0</span>
                    )}
                    <div
                      className={`w-full rounded-t-md ${barColor}`}
                      style={{ height: `${(d.count / max) * CHART_H}px`, minHeight: d.count > 0 ? "4px" : "0px" }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex items-start gap-2 mt-1">
              {distribution.map(d => (
                <div key={d.rating} className="flex-1 flex justify-center">
                  <span className="text-[10px] text-muted-foreground">{d.rating}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Trend chart */}
      {trend.length > 1 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2.5">Trend over time</p>
          <div className="flex items-end gap-2 border-b border-border" style={{ height: `${CHART_H + 20}px` }}>
            {trend.map(t => {
              const isSelected = selectedWindow?.windowKey === t.windowKey;
              const barColor = t.average <= 2 ? "bg-red-400" : t.average < 3.5 ? "bg-amber-400" : "bg-emerald-500";
              return (
                <button
                  key={t.windowKey}
                  type="button"
                  onClick={hasWindowSwitching ? () => setWindowKey(t.windowKey) : undefined}
                  className={`flex-1 flex flex-col items-center justify-end h-full gap-0.5 group ${hasWindowSwitching ? "cursor-pointer" : "cursor-default"}`}
                  data-testid={`survey-trend-${surveyId}-${t.windowKey}`}
                  tabIndex={hasWindowSwitching ? 0 : -1}
                >
                  <span className="text-[10px] font-medium text-foreground">{t.average.toFixed(1)}</span>
                  <span className="text-[9px] text-muted-foreground">({t.count})</span>
                  <div
                    className={`w-full rounded-t-md transition-opacity ${barColor} ${hasWindowSwitching && !isSelected ? "opacity-50 group-hover:opacity-80" : ""}`}
                    style={{ height: `${(t.average / 5) * CHART_H}px`, minHeight: "4px" }}
                  />
                </button>
              );
            })}
          </div>
          <div className="flex items-start gap-2 mt-1">
            {trend.map(t => (
              <div key={t.windowKey} className="flex-1 flex justify-center">
                <span className="text-[10px] text-muted-foreground truncate max-w-full text-center">{t.label}</span>
              </div>
            ))}
          </div>
          {hasWindowSwitching && (
            <p className="text-[10px] text-muted-foreground/70 mt-1.5 italic">Click a bar to filter the distribution above.</p>
          )}
        </div>
      )}

      {/* Comments */}
      <div>
        <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2 inline-flex items-center gap-1">
          <MessageSquare className="w-3 h-3" /> Member comments
        </p>
        {anonymous && (
          <p className="text-[10px] text-muted-foreground mb-2">Shown only after {commentPrivacyThreshold}+ responses per period to protect anonymity.</p>
        )}
        {commentsBelowThreshold ? (
          <p className="text-xs text-muted-foreground italic" data-testid={`survey-comments-hidden-${surveyId}`}>
            Comments are hidden for this period to protect anonymity ({selectedWindow!.count}/{commentPrivacyThreshold} responses needed).
          </p>
        ) : visibleComments.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No comments to show yet.</p>
        ) : (
          <ul className="space-y-2.5 max-h-72 overflow-y-auto pr-1" data-testid={`survey-comments-${surveyId}`}>
            {visibleComments.map(c => (
              <li key={c.id} className="flex gap-2.5">
                <div className="w-0.5 shrink-0 self-stretch rounded-full bg-primary/25" />
                <div className="py-0.5">
                  <p className="text-xs text-foreground leading-relaxed">"{c.comment}"</p>
                  <p className="text-[10px] text-muted-foreground mt-1">{c.windowLabel}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const DEMO_TEMPLATE_OPTIONS: Array<{ key: Template; label: string; question: string }> = [
  { key: "meaningfulness", label: "Meaningfulness", question: "How meaningful does your volunteering feel right now?" },
  { key: "wellbeing",      label: "Wellbeing",       question: "How would you rate your overall wellbeing this month?" },
  { key: "custom",         label: "Custom question", question: "" },
];

const DEMO_SURVEYS_SESSION_KEY = "demo-pulse-surveys";

function DemoPulseSurveysSection() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [surveys, setSurveys] = useState<DemoPulseSurvey[]>(() => {
    try {
      const stored = sessionStorage.getItem(DEMO_SURVEYS_SESSION_KEY);
      if (stored) return JSON.parse(stored) as DemoPulseSurvey[];
    } catch {}
    return DEMO_PULSE_SURVEYS;
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(DEMO_SURVEYS_SESSION_KEY, JSON.stringify(surveys));
    } catch {}
  }, [surveys]);
  const [creating, setCreating] = useState(false);
  const [template, setTemplate] = useState<Template>("meaningfulness");
  const [question, setQuestion] = useState(DEMO_TEMPLATE_OPTIONS[0].question);
  const [schedule, setSchedule] = useState<Schedule>("monthly");
  const [anonymous, setAnonymous] = useState(true);
  const [successId, setSuccessId] = useState<string | null>(null);

  function handleTemplateChange(next: Template) {
    setTemplate(next);
    const opt = DEMO_TEMPLATE_OPTIONS.find(o => o.key === next);
    setQuestion(opt?.question ?? "");
  }

  function handleCreate() {
    const newSurvey: DemoPulseSurvey = {
      id: `demo-survey-${Date.now()}`,
      template,
      question: question.trim() || (DEMO_TEMPLATE_OPTIONS.find(o => o.key === template)?.question ?? question.trim()),
      schedule,
      anonymous,
      createdAt: new Date().toISOString(),
      archivedAt: null,
      totals: { responses: 0, average: 0 },
      distribution: [1, 2, 3, 4, 5].map(rating => ({ rating, count: 0 })),
      trend: [],
      comments: [],
    };
    setSurveys(prev => [newSurvey, ...prev]);
    setSuccessId(newSurvey.id);
    setCreating(false);
    setTemplate("meaningfulness");
    setQuestion(DEMO_TEMPLATE_OPTIONS[0].question);
    setSchedule("monthly");
    setAnonymous(true);
    setTimeout(() => setSuccessId(null), 3000);
  }

  return (
    <motion.div
      className="bg-white border border-border rounded-xl p-5 mb-6"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.06 }}
      data-testid="section-pulse-surveys"
    >
      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Member pulse surveys</h3>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            30-second prompts that help you measure how your members are feeling and how meaningful their work is. Anonymous by default.
          </p>
        </div>
        {!creating && (
          <button
            type="button"
            onClick={() => { setCreating(true); handleTemplateChange("meaningfulness"); }}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors"
            data-testid="button-new-pulse-survey"
          >
            <Plus className="w-3.5 h-3.5" /> New survey
          </button>
        )}
      </div>

      {successId && (
        <p className="mt-3 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2" data-testid="demo-survey-success">
          Survey launched successfully.
        </p>
      )}

      {creating && (
        <div className="mt-4 p-4 rounded-lg border border-border bg-muted/20 space-y-3">
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">Template</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {DEMO_TEMPLATE_OPTIONS.map(opt => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => handleTemplateChange(opt.key)}
                  className={`text-left px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                    template === opt.key
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border bg-white text-foreground hover:bg-muted/30"
                  }`}
                  data-testid={`pulse-template-${opt.key}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">
              Question {template !== "custom" && <span className="text-muted-foreground font-normal">(edit if you like)</span>}
            </label>
            <input
              type="text"
              value={question}
              onChange={e => setQuestion(e.target.value.slice(0, 200))}
              placeholder={template === "custom" ? "e.g. How connected do you feel to your community?" : ""}
              maxLength={200}
              className="w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:border-primary"
              data-testid="input-pulse-question"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5">How often</label>
              <select
                value={schedule}
                onChange={e => setSchedule(e.target.value as Schedule)}
                className="w-full px-3 py-2 rounded-lg border border-border text-sm bg-white focus:outline-none focus:border-primary"
                data-testid="select-pulse-schedule"
              >
                <option value="one_off">One-off (each member responds once)</option>
                <option value="monthly">Monthly (one response per month)</option>
                <option value="quarterly">Quarterly (one response per quarter)</option>
              </select>
            </div>
            <div className="flex items-center gap-2 sm:pt-6">
              <input
                id="demo-pulse-anon"
                type="checkbox"
                checked={anonymous}
                onChange={e => setAnonymous(e.target.checked)}
                className="rounded border-border w-4 h-4 text-primary focus:ring-primary"
                data-testid="checkbox-pulse-anonymous"
              />
              <label htmlFor="demo-pulse-anon" className="text-xs text-foreground inline-flex items-center gap-1">
                <Lock className="w-3 h-3" /> Anonymous responses
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="px-3 py-2 rounded-lg border border-border text-xs font-semibold text-foreground hover:bg-muted/30 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={template === "custom" && !question.trim()}
              className="px-3 py-2 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
              data-testid="button-create-pulse-survey"
            >
              Launch survey
            </button>
          </div>
        </div>
      )}

      <div className="mt-3 space-y-2">
        {surveys.map(s => (
          <DemoSurveyRow
            key={s.id}
            survey={s}
            open={openId === s.id}
            onToggle={() => setOpenId(openId === s.id ? null : s.id)}
            highlight={s.id === successId}
          />
        ))}
      </div>
    </motion.div>
  );
}

function DemoSurveyRow({ survey, open, onToggle, highlight }: { survey: DemoPulseSurvey; open: boolean; onToggle: () => void; highlight?: boolean }) {
  const sentimentBadge = getSentimentBadge(survey.distribution, survey.totals.responses);
  return (
    <div className={`rounded-lg border transition-colors ${highlight ? "border-emerald-300 bg-emerald-50/40 hover:bg-emerald-50/60" : "border-border bg-white hover:bg-muted/30"}`} data-testid={`survey-row-${survey.id}`}>
      <div className="flex items-start justify-between gap-3 p-3">
        <button
          type="button"
          onClick={onToggle}
          className="text-left min-w-0 flex-1"
          data-testid={`button-toggle-survey-${survey.id}`}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <ScoreIndicator average={survey.trend.length > 0 ? survey.trend[survey.trend.length - 1].average : survey.totals.responses > 0 ? survey.totals.average : null} />
            <span className="text-sm font-semibold text-foreground truncate">{survey.question}</span>
            <span className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary">
              {SCHEDULE_LABELS[survey.schedule]}
            </span>
            {survey.anonymous && (
              <span className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground inline-flex items-center gap-1">
                <Lock className="w-2.5 h-2.5" /> Anonymous
              </span>
            )}
            {sentimentBadge && (
              <span
                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${sentimentBadge.className}`}
                data-testid={`badge-sentiment-${survey.id}`}
              >
                {sentimentBadge.label}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Launched {new Date(survey.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
          </p>
        </button>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            disabled
            className="inline-flex items-center gap-1 px-2 py-1.5 rounded text-xs font-semibold text-muted-foreground border border-border cursor-not-allowed opacity-60"
            data-testid={`button-archive-survey-${survey.id}`}
          >
            <Archive className="w-3 h-3" /> Archive
          </button>
          <button
            type="button"
            onClick={onToggle}
            className="p-1.5 rounded hover:bg-muted/30"
            aria-label={open ? "Collapse" : "Expand"}
          >
            {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </button>
        </div>
      </div>
      {open && <DemoSurveyResultsView survey={survey} />}
    </div>
  );
}

function DemoSurveyResultsView({ survey }: { survey: DemoPulseSurvey }) {
  return (
    <ResultsPanel
      surveyId={survey.id}
      initialDistribution={survey.distribution}
      initialAverage={survey.totals.average}
      totalResponses={survey.totals.responses}
      trend={survey.trend}
      allComments={survey.comments}
      anonymous={survey.anonymous}
      commentPrivacyThreshold={DEMO_COMMENT_PRIVACY_THRESHOLD}
    />
  );
}
