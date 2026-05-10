import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Flag, Plus, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useT } from "@/i18n";
import { BASE } from "@/lib/org-export";
import { DEMO_CHALLENGES, DEMO_ORG_ID } from "@/lib/org-demo-mock";

interface ApiChallenge {
  id: string;
  name: string;
  description: string | null;
  goalType: "social_value" | "hours";
  target: number;
  startDate: string;
  endDate: string;
  ownerId: string | null;
  orgId: string | null;
  scope: "personal" | "org";
  inviteCode: string;
  hasEnded: boolean;
  hasStarted: boolean;
  participantCount: number;
  isOwner: boolean;
  progressTotal: number;
  progressPercent: number;
  isActive: boolean;
}

export function OrgChallengesPanel({ orgId }: { orgId: string }) {
  // Demo org: render mock challenges so the demo tells a complete story end-to-end.
  // Real orgs fall through to the live API panel below.
  if (orgId === DEMO_ORG_ID) {
    return <DemoOrgChallengesPanel />;
  }
  return <LiveOrgChallengesPanel orgId={orgId} />;
}

function LiveOrgChallengesPanel({ orgId }: { orgId: string }) {
  const t = useT();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [goalType, setGoalType] = useState<"social_value" | "hours">("social_value");
  const [target, setTarget] = useState<string>("1000");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ challenges: ApiChallenge[] }>({
    queryKey: ["challenges-mine"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/challenges/mine`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  const orgChallenges = useMemo(
    () => (data?.challenges ?? []).filter(c => c.scope === "org" && c.orgId === orgId),
    [data?.challenges, orgId],
  );

  const createMut = useMutation({
    mutationFn: async () => {
      const body = {
        name: name.trim(),
        description: description.trim(),
        goalType,
        target: Number(target),
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
        scope: "org",
      };
      const res = await fetch(`${BASE}/api/challenges`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error((json as { error?: string }).error ?? "Failed");
      return json;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["challenges-mine"] });
      setCreating(false);
      setName("");
      setDescription("");
      setTarget("1000");
      setError(null);
    },
    onError: (err: Error) => setError(err.message),
  });

  const endMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${BASE}/api/challenges/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? "Failed");
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["challenges-mine"] }),
  });

  return (
    <div className="bg-background border border-border rounded-xl p-5 mb-6" data-testid="section-org-challenges">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <div className="flex items-center gap-2">
            <Flag className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">{t("orgDashboard.challengesTitle")}</h3>
          </div>
          <p className="text-xs text-muted-foreground mt-1">{t("orgDashboard.challengesSubtitle")}</p>
        </div>
        {!creating && (
          <button
            type="button"
            onClick={() => { setCreating(true); setError(null); }}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors"
            data-testid="button-new-org-challenge"
          >
            <Plus className="w-3.5 h-3.5" /> {t("orgDashboard.challengesNew")}
          </button>
        )}
      </div>

      {creating && (
        <div className="mt-4 p-4 rounded-lg border border-border bg-muted/20 space-y-3">
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">{t("orgDashboard.challengesName")}</label>
            <input
              type="text" value={name} onChange={e => setName(e.target.value.slice(0, 120))} maxLength={120}
              className="w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:border-primary"
              data-testid="input-challenge-name"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">{t("orgDashboard.challengesDescription")}</label>
            <textarea
              value={description} onChange={e => setDescription(e.target.value.slice(0, 500))} rows={2}
              className="w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:border-primary"
              data-testid="input-challenge-description"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5">{t("orgDashboard.challengesGoalType")}</label>
              <select
                value={goalType} onChange={e => setGoalType(e.target.value as "social_value" | "hours")}
                className="w-full px-3 py-2 rounded-lg border border-border text-sm bg-white focus:outline-none focus:border-primary"
                data-testid="select-challenge-goal-type"
              >
                <option value="social_value">{t("orgDashboard.challengesGoalSocialValue")}</option>
                <option value="hours">{t("orgDashboard.challengesGoalHours")}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5">{t("orgDashboard.challengesTarget")}</label>
              <input
                type="number" min="1" value={target} onChange={e => setTarget(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:border-primary"
                data-testid="input-challenge-target"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5">{t("orgDashboard.challengesStart")}</label>
              <input
                type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:border-primary"
                data-testid="input-challenge-start"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5">{t("orgDashboard.challengesEnd")}</label>
              <input
                type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:border-primary"
                data-testid="input-challenge-end"
              />
            </div>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button" onClick={() => { setCreating(false); setError(null); }}
              className="px-3 py-2 rounded-lg border border-border text-xs font-semibold text-foreground hover:bg-muted/30 transition-colors"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={() => { setError(null); createMut.mutate(); }}
              disabled={createMut.isPending || !name.trim() || Number(target) <= 0}
              className="px-3 py-2 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
              data-testid="button-create-challenge"
            >
              {createMut.isPending ? t("common.saving") : t("orgDashboard.challengesCreate")}
            </button>
          </div>
        </div>
      )}

      <div className="mt-4">
        {isLoading ? (
          <div className="py-6 flex justify-center">
            <div className="animate-spin w-5 h-5 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : orgChallenges.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">{t("orgDashboard.challengesEmpty")}</p>
        ) : (
          <div className="space-y-2" data-testid="list-org-challenges">
            {orgChallenges.map(c => {
              const pct = Math.min(100, Math.max(0, Math.round(c.progressPercent)));
              const targetLabel = c.goalType === "social_value" ? `£${c.target.toLocaleString("en-GB")}` : `${c.target} ${t("orgDashboard.challengesHoursUnit")}`;
              const progressLabel = c.goalType === "social_value" ? `£${Math.round(c.progressTotal).toLocaleString("en-GB")}` : `${Math.round(c.progressTotal)} ${t("orgDashboard.challengesHoursUnit")}`;
              return (
                <div key={c.id} className="rounded-lg border border-border p-3" data-testid={`org-challenge-${c.id}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          href={`/challenges/${c.id}`}
                          className="text-sm font-semibold text-foreground hover:text-primary truncate"
                          data-testid={`link-challenge-${c.id}`}
                        >
                          {c.name}
                        </Link>
                        <span className={`text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded ${c.hasEnded ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"}`}>
                          {c.hasEnded ? t("orgDashboard.challengesEnded") : t("orgDashboard.challengesActive")}
                        </span>
                      </div>
                      {c.description && <p className="text-xs text-muted-foreground mt-1">{c.description}</p>}
                    </div>
                    <div className="shrink-0 flex items-start gap-2">
                      <p className="text-sm font-bold text-foreground" data-testid={`challenge-percent-${c.id}`}>{pct}%</p>
                      {!c.hasEnded && (
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm(t("orgDashboard.challengesConfirmEnd"))) endMut.mutate(c.id);
                          }}
                          disabled={endMut.isPending}
                          className="inline-flex items-center gap-1 px-2 py-1.5 rounded text-xs font-semibold text-muted-foreground border border-border hover:bg-muted/30 transition-colors disabled:opacity-60"
                          data-testid={`button-end-challenge-${c.id}`}
                        >
                          <X className="w-3 h-3" /> {t("orgDashboard.challengesEnd2")}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="h-1.5 mt-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-primary/70" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    <span className="font-semibold text-foreground">{progressLabel}</span> {t("orgDashboard.challengesProgressOf")} {targetLabel}
                    {" · "}
                    <span className="font-semibold text-foreground">{c.participantCount}</span> {t("orgDashboard.challengesParticipants")}
                    {" · "}
                    {new Date(c.startDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    {" – "}
                    {new Date(c.endDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const DEMO_CHALLENGES_SESSION_KEY = "demo-org-challenges";

function DemoOrgChallengesPanel() {
  const t = useT();
  const [challenges, setChallenges] = useState<ApiChallenge[]>(() => {
    try {
      const stored = sessionStorage.getItem(DEMO_CHALLENGES_SESSION_KEY);
      if (stored) return JSON.parse(stored) as ApiChallenge[];
    } catch {}
    return DEMO_CHALLENGES as ApiChallenge[];
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(DEMO_CHALLENGES_SESSION_KEY, JSON.stringify(challenges));
    } catch {}
  }, [challenges]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [goalType, setGoalType] = useState<"social_value" | "hours">("social_value");
  const [target, setTarget] = useState<string>("1000");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [successId, setSuccessId] = useState<string | null>(null);

  function handleCreate() {
    const newChallenge: ApiChallenge = {
      id: `demo-new-${Date.now()}`,
      name: name.trim(),
      description: description.trim() || null,
      goalType,
      target: Number(target),
      startDate: new Date(startDate).toISOString(),
      endDate: new Date(endDate).toISOString(),
      ownerId: null,
      orgId: DEMO_ORG_ID,
      scope: "org",
      inviteCode: "",
      hasEnded: false,
      hasStarted: true,
      participantCount: 0,
      isOwner: true,
      progressTotal: 0,
      progressPercent: 0,
      isActive: true,
    };
    setChallenges(prev => [newChallenge, ...prev]);
    setSuccessId(newChallenge.id);
    setCreating(false);
    setName("");
    setDescription("");
    setTarget("1000");
    setTimeout(() => setSuccessId(null), 3000);
  }

  return (
    <div className="bg-background border border-border rounded-xl p-5 mb-6" data-testid="section-org-challenges">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <div className="flex items-center gap-2">
            <Flag className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">{t("orgDashboard.challengesTitle")}</h3>
          </div>
          <p className="text-xs text-muted-foreground mt-1">{t("orgDashboard.challengesSubtitle")}</p>
        </div>
        {!creating && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors"
            data-testid="button-new-org-challenge"
          >
            <Plus className="w-3.5 h-3.5" /> {t("orgDashboard.challengesNew")}
          </button>
        )}
      </div>
      {successId && (
        <p className="mt-3 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2" data-testid="demo-challenge-success">
          Challenge created successfully.
        </p>
      )}
      {creating && (
        <div className="mt-4 p-4 rounded-lg border border-border space-y-3 bg-[#ffffff]">
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">{t("orgDashboard.challengesName")}</label>
            <input
              type="text" value={name} onChange={e => setName(e.target.value.slice(0, 120))} maxLength={120}
              className="w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:border-primary"
              data-testid="input-challenge-name"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">{t("orgDashboard.challengesDescription")}</label>
            <textarea
              value={description} onChange={e => setDescription(e.target.value.slice(0, 500))} rows={2}
              className="w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:border-primary"
              data-testid="input-challenge-description"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5">{t("orgDashboard.challengesGoalType")}</label>
              <select
                value={goalType} onChange={e => setGoalType(e.target.value as "social_value" | "hours")}
                className="w-full px-3 py-2 rounded-lg border border-border text-sm bg-white focus:outline-none focus:border-primary"
                data-testid="select-challenge-goal-type"
              >
                <option value="social_value">{t("orgDashboard.challengesGoalSocialValue")}</option>
                <option value="hours">{t("orgDashboard.challengesGoalHours")}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5">{t("orgDashboard.challengesTarget")}</label>
              <input
                type="number" min="1" value={target} onChange={e => setTarget(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:border-primary"
                data-testid="input-challenge-target"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5">{t("orgDashboard.challengesStart")}</label>
              <input
                type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:border-primary"
                data-testid="input-challenge-start"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5">{t("orgDashboard.challengesEnd")}</label>
              <input
                type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:border-primary"
                data-testid="input-challenge-end"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button" onClick={() => setCreating(false)}
              className="px-3 py-2 rounded-lg border border-border text-xs font-semibold text-foreground hover:bg-muted/30 transition-colors"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={!name.trim() || Number(target) <= 0}
              className="px-3 py-2 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
              data-testid="button-create-challenge"
            >
              {t("orgDashboard.challengesCreate")}
            </button>
          </div>
        </div>
      )}
      <div className="mt-4 space-y-2" data-testid="list-org-challenges">
        {challenges.map(c => {
          const pct = Math.min(100, Math.max(0, Math.round(c.progressPercent)));
          const targetLabel = c.goalType === "social_value" ? `£${c.target.toLocaleString("en-GB")}` : `${c.target} ${t("orgDashboard.challengesHoursUnit")}`;
          const progressLabel = c.goalType === "social_value" ? `£${Math.round(c.progressTotal).toLocaleString("en-GB")}` : `${Math.round(c.progressTotal)} ${t("orgDashboard.challengesHoursUnit")}`;
          return (
            <div key={c.id} className="rounded-lg border p-3 border-border bg-[#ffffff]" data-testid={`org-challenge-${c.id}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-foreground truncate" data-testid={`link-challenge-${c.id}`}>{c.name}</span>
                    <span className={`text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded ${c.hasEnded ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"}`}>
                      {c.hasEnded ? t("orgDashboard.challengesEnded") : t("orgDashboard.challengesActive")}
                    </span>
                  </div>
                  {c.description && <p className="text-xs text-muted-foreground mt-1">{c.description}</p>}
                </div>
                <div className="shrink-0 flex items-start gap-2">
                  <p className="text-sm font-bold text-foreground" data-testid={`challenge-percent-${c.id}`}>{pct}%</p>
                  {!c.hasEnded && (
                    <button
                      type="button"
                      disabled
                      className="inline-flex items-center gap-1 px-2 py-1.5 rounded text-xs font-semibold text-muted-foreground border border-border cursor-not-allowed opacity-60"
                      data-testid={`button-end-challenge-${c.id}`}
                    >
                      <X className="w-3 h-3" /> {t("orgDashboard.challengesEnd2")}
                    </button>
                  )}
                </div>
              </div>
              <div className="h-1.5 mt-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-primary/70" style={{ width: `${pct}%` }} />
              </div>
              <p className="text-[11px] text-muted-foreground mt-1.5">
                <span className="font-semibold text-foreground">{progressLabel}</span> {t("orgDashboard.challengesProgressOf")} {targetLabel}
                {" · "}
                <span className="font-semibold text-foreground">{c.participantCount}</span> {t("orgDashboard.challengesParticipants")}
                {" · "}
                {new Date(c.startDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                {" – "}
                {new Date(c.endDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
