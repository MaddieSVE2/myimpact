import { useState } from "react";
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
  Users,
  TrendingUp,
} from "lucide-react";
import {
  DEMO_PULSE_SURVEYS,
  DEMO_COMMENT_PRIVACY_THRESHOLD,
  type DemoPulseSurvey,
} from "@/lib/org-demo-mock";

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
  trend: Array<{ windowKey: string; label: string; average: number; count: number }>;
  comments: Array<{ id: string; comment: string; windowLabel: string; createdAt: string }>;
  commentPrivacyThreshold: number;
}

const SCHEDULE_LABELS: Record<Schedule, string> = {
  one_off: "One-off",
  monthly: "Monthly",
  quarterly: "Quarterly",
};

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
  return (
    <div
      className={`rounded-lg border ${isArchived ? "border-border bg-muted/20" : "border-border bg-white"}`}
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
            <span className="text-sm font-semibold text-foreground truncate">{survey.question}</span>
            <span className={`text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded ${isArchived ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"}`}>
              {isArchived ? "Archived" : SCHEDULE_LABELS[survey.schedule]}
            </span>
            {survey.anonymous && (
              <span className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground inline-flex items-center gap-1">
                <Lock className="w-2.5 h-2.5" /> Anonymous
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
  const max = Math.max(1, ...data.distribution.map(d => d.count));
  return (
    <div className="border-t border-border p-4 space-y-4 bg-muted/10" data-testid={`survey-results-${surveyId}`}>
      {data.totals.responses === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-3">No responses yet — share the home page link with your members.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-lg border border-border p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <TrendingUp className="w-3 h-3 text-primary" />
                <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Average</p>
              </div>
              <p className="text-lg font-display font-bold text-foreground" data-testid={`survey-average-${surveyId}`}>
                {data.totals.average.toFixed(1)}<span className="text-xs text-muted-foreground"> / 5</span>
              </p>
            </div>
            <div className="bg-white rounded-lg border border-border p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Users className="w-3 h-3 text-primary" />
                <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Responses</p>
              </div>
              <p className="text-lg font-display font-bold text-foreground" data-testid={`survey-count-${surveyId}`}>
                {data.totals.responses}
              </p>
            </div>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">Score distribution</p>
            <div className="space-y-1.5">
              {data.distribution.map(d => (
                <div key={d.rating} className="flex items-center gap-2 text-xs">
                  <span className="w-3 text-muted-foreground">{d.rating}</span>
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-primary/60" style={{ width: `${(d.count / max) * 100}%` }} />
                  </div>
                  <span className="w-6 text-right text-muted-foreground">{d.count}</span>
                </div>
              ))}
            </div>
          </div>

          {data.trend.length > 1 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">Trend</p>
              <div className="space-y-1">
                {data.trend.map(t => (
                  <div key={t.windowKey} className="flex items-center gap-2 text-xs">
                    <span className="w-20 text-muted-foreground truncate">{t.label}</span>
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-primary/60" style={{ width: `${(t.average / 5) * 100}%` }} />
                    </div>
                    <span className="w-12 text-right text-foreground font-medium">{t.average.toFixed(1)} <span className="text-muted-foreground">({t.count})</span></span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground inline-flex items-center gap-1">
                <MessageSquare className="w-3 h-3" /> Comments
              </p>
              {data.survey.anonymous && (
                <span className="text-[10px] text-muted-foreground">
                  Shown only after {data.commentPrivacyThreshold}+ responses per period
                </span>
              )}
            </div>
            {data.comments.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No comments to show yet.</p>
            ) : (
              <ul className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {data.comments.map(c => (
                  <li key={c.id} className="bg-white border border-border rounded-lg p-3 text-xs text-foreground">
                    <p className="leading-relaxed">"{c.comment}"</p>
                    <p className="text-[10px] text-muted-foreground mt-1.5">{c.windowLabel}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function DemoPulseSurveysSection() {
  const [openId, setOpenId] = useState<string | null>(null);
  const surveys = DEMO_PULSE_SURVEYS;
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
        <button
          type="button"
          disabled
          title="Demo data — actions disabled"
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary/40 text-white text-xs font-semibold cursor-not-allowed"
          data-testid="button-new-pulse-survey"
        >
          <Plus className="w-3.5 h-3.5" /> New survey
        </button>
      </div>

      <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-primary/80" data-testid="demo-data-hint-pulse">
        Demo data — actions disabled
      </p>

      <div className="mt-3 space-y-2">
        {surveys.map(s => (
          <DemoSurveyRow
            key={s.id}
            survey={s}
            open={openId === s.id}
            onToggle={() => setOpenId(openId === s.id ? null : s.id)}
          />
        ))}
      </div>
    </motion.div>
  );
}

function DemoSurveyRow({ survey, open, onToggle }: { survey: DemoPulseSurvey; open: boolean; onToggle: () => void }) {
  return (
    <div className="rounded-lg border border-border bg-white" data-testid={`survey-row-${survey.id}`}>
      <div className="flex items-start justify-between gap-3 p-3">
        <button
          type="button"
          onClick={onToggle}
          className="text-left min-w-0 flex-1"
          data-testid={`button-toggle-survey-${survey.id}`}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-foreground truncate">{survey.question}</span>
            <span className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary">
              {SCHEDULE_LABELS[survey.schedule]}
            </span>
            {survey.anonymous && (
              <span className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground inline-flex items-center gap-1">
                <Lock className="w-2.5 h-2.5" /> Anonymous
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
            title="Demo data — actions disabled"
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
  const max = Math.max(1, ...survey.distribution.map(d => d.count));
  return (
    <div className="border-t border-border p-4 space-y-4 bg-muted/10" data-testid={`survey-results-${survey.id}`}>
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-lg border border-border p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp className="w-3 h-3 text-primary" />
            <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Average</p>
          </div>
          <p className="text-lg font-display font-bold text-foreground" data-testid={`survey-average-${survey.id}`}>
            {survey.totals.average.toFixed(1)}<span className="text-xs text-muted-foreground"> / 5</span>
          </p>
        </div>
        <div className="bg-white rounded-lg border border-border p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Users className="w-3 h-3 text-primary" />
            <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Responses</p>
          </div>
          <p className="text-lg font-display font-bold text-foreground" data-testid={`survey-count-${survey.id}`}>
            {survey.totals.responses}
          </p>
        </div>
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">Score distribution</p>
        <div className="space-y-1.5">
          {survey.distribution.map(d => (
            <div key={d.rating} className="flex items-center gap-2 text-xs">
              <span className="w-3 text-muted-foreground">{d.rating}</span>
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-primary/60" style={{ width: `${(d.count / max) * 100}%` }} />
              </div>
              <span className="w-6 text-right text-muted-foreground">{d.count}</span>
            </div>
          ))}
        </div>
      </div>

      {survey.trend.length > 1 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">Trend</p>
          <div className="space-y-1">
            {survey.trend.map(t => (
              <div key={t.windowKey} className="flex items-center gap-2 text-xs">
                <span className="w-20 text-muted-foreground truncate">{t.label}</span>
                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-primary/60" style={{ width: `${(t.average / 5) * 100}%` }} />
                </div>
                <span className="w-12 text-right text-foreground font-medium">{t.average.toFixed(1)} <span className="text-muted-foreground">({t.count})</span></span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground inline-flex items-center gap-1">
            <MessageSquare className="w-3 h-3" /> Comments
          </p>
          {survey.anonymous && (
            <span className="text-[10px] text-muted-foreground">
              Shown only after {DEMO_COMMENT_PRIVACY_THRESHOLD}+ responses per period
            </span>
          )}
        </div>
        {survey.comments.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No comments to show yet.</p>
        ) : (
          <ul className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {survey.comments.map(c => (
              <li key={c.id} className="bg-white border border-border rounded-lg p-3 text-xs text-foreground">
                <p className="leading-relaxed">"{c.comment}"</p>
                <p className="text-[10px] text-muted-foreground mt-1.5">{c.windowLabel}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
