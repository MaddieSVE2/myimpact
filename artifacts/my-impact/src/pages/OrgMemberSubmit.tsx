import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  Building2, Search, Plus, Trash2, ArrowRight, ArrowLeft, Check, Loader2, ShieldCheck, Lock, AlertCircle, History, Undo2, Eye,
} from "lucide-react";
import { useGetActivities, type ActivityItem } from "@workspace/api-client-react";
import { useMyOrg } from "@/lib/org-export";
import { useAuth } from "@/lib/auth-context";
import { ANALYTICS_EVENTS, track } from "@/lib/analytics";

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

interface SelectedLine {
  activityId: string;
  quantity: number;
  hoursPerYear: number;
  hoursManual: boolean;
  title: string;
  detail: string;
}

interface SessionCalc {
  hrsPerSession: number;
  sessionsPerWeek: number;
  weeksPerYear: number;
}

function defaultHoursForQuantity(qty: number): number {
  return Math.max(1, Math.round((qty || 0) * 2));
}

type Step = "select" | "details" | "review" | "done";

interface MySubmission {
  recordId: number;
  name: string;
  period: string | null;
  totalHours: number;
  totalValue: number;
  submittedAt: string;
  activityCount: number;
}

function formatGBP(n: number): string {
  return `£${Math.round(n).toLocaleString("en-GB")}`;
}

function estimatedValue(act: ActivityItem, line: SelectedLine): number {
  if (act.unit === "hour") return line.hoursPerYear * act.valuePerUnit;
  return line.quantity * act.valuePerUnit;
}

export default function OrgMemberSubmit() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const { data: orgData, isLoading: orgLoading } = useMyOrg();
  const { data: activitiesData, isLoading: actsLoading } = useGetActivities();

  const [step, setStep] = useState<Step>("select");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [lines, setLines] = useState<Record<string, SelectedLine>>({});
  const [sessionCalcs, setSessionCalcs] = useState<Record<string, SessionCalc>>({});
  const [openCalcs, setOpenCalcs] = useState<Record<string, boolean>>({});
  const [periodLabel, setPeriodLabel] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [createdRecordId, setCreatedRecordId] = useState<number | null>(null);
  const [mySubs, setMySubs] = useState<MySubmission[] | null>(null);
  const [mySubsError, setMySubsError] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [withdrawn, setWithdrawn] = useState(false);

  useEffect(() => {
    track(ANALYTICS_EVENTS.ORG_MEMBER_SUBMIT_STARTED);
  }, []);

  const loadMySubs = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/api/org/my-submissions`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load your submissions");
      const data = await res.json();
      setMySubs(Array.isArray(data?.submissions) ? data.submissions : []);
      setMySubsError(null);
    } catch (err) {
      setMySubsError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    if (!user || !orgData?.org) return;
    loadMySubs();
  }, [user, orgData?.org, loadMySubs]);

  const activities = activitiesData?.activities ?? [];
  const categories = activitiesData?.categories ?? [];
  const activitiesById = useMemo(() => {
    const m = new Map<string, ActivityItem>();
    for (const a of activities) m.set(a.id, a);
    return m;
  }, [activities]);

  const filtered = useMemo(() => {
    let list = activities;
    if (categoryFilter) list = list.filter(a => a.category === categoryFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(a => a.name.toLowerCase().includes(q) || a.category.toLowerCase().includes(q));
    }
    return list;
  }, [activities, categoryFilter, search]);

  const selectedIds = Object.keys(lines);
  const orderedSelected: SelectedLine[] = selectedIds.map(id => lines[id]);

  const hoursWarnings = useMemo(() => {
    const out: { activityId: string; name: string; hoursPerYear: number; reason: "high" | "zero" }[] = [];
    for (const line of orderedSelected) {
      const def = activitiesById.get(line.activityId);
      if (!def) continue;
      const isHourly = def.unit === "hour";
      if (line.hoursPerYear > 2000) {
        out.push({ activityId: line.activityId, name: def.name, hoursPerYear: line.hoursPerYear, reason: "high" });
      } else if (!isHourly && line.hoursPerYear === 0) {
        out.push({ activityId: line.activityId, name: def.name, hoursPerYear: line.hoursPerYear, reason: "zero" });
      }
    }
    return out;
  }, [orderedSelected, activitiesById]);

  const totals = useMemo(() => {
    let value = 0;
    let hours = 0;
    for (const line of orderedSelected) {
      const def = activitiesById.get(line.activityId);
      if (!def) continue;
      value += estimatedValue(def, line);
      hours += line.hoursPerYear;
    }
    return { value, hours };
  }, [orderedSelected, activitiesById]);

  function toggleSelect(act: ActivityItem) {
    setLines(prev => {
      const next = { ...prev };
      if (next[act.id]) {
        delete next[act.id];
      } else {
        const isHourly = act.unit === "hour";
        next[act.id] = {
          activityId: act.id,
          quantity: isHourly ? 0 : act.defaultQuantity,
          hoursPerYear: isHourly ? act.defaultQuantity : defaultHoursForQuantity(act.defaultQuantity),
          hoursManual: false,
          title: "",
          detail: "",
        };
      }
      return next;
    });
  }

  function updateLine(id: string, patch: Partial<SelectedLine>) {
    setLines(prev => {
      const cur = prev[id];
      if (!cur) return prev;
      const merged: SelectedLine = { ...cur, ...patch };
      const def = activitiesById.get(id);
      const isHourly = def?.unit === "hour";
      if (!isHourly && patch.quantity !== undefined && patch.hoursPerYear === undefined && !merged.hoursManual) {
        merged.hoursPerYear = defaultHoursForQuantity(merged.quantity);
      }
      return { ...prev, [id]: merged };
    });
  }

  function updateSessionCalc(id: string, patch: Partial<SessionCalc>) {
    setSessionCalcs(prev => {
      const cur = prev[id] ?? { hrsPerSession: 2, sessionsPerWeek: 1, weeksPerYear: 48 };
      const next = { ...cur, ...patch };
      const total = Math.max(1, Math.round(next.hrsPerSession * next.sessionsPerWeek * next.weeksPerYear));
      setLines(ls => {
        const line = ls[id];
        if (!line) return ls;
        return { ...ls, [id]: { ...line, hoursPerYear: total, hoursManual: true } };
      });
      return { ...prev, [id]: next };
    });
  }

  function removeLine(id: string) {
    setLines(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  async function withdrawSubmission() {
    if (createdRecordId == null) return;
    setWithdrawError(null);
    setWithdrawing(true);
    try {
      const res = await fetch(`${BASE}/api/org/member-submissions/${createdRecordId}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to withdraw submission.");
      setWithdrawn(true);
    } catch (err) {
      setWithdrawError((err as Error).message);
    } finally {
      setWithdrawing(false);
    }
  }

  async function submit() {
    if (orderedSelected.length === 0) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${BASE}/api/org/member-submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: periodLabel.trim() || `Submitted ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`,
          periodLabel: periodLabel.trim() || null,
          activities: orderedSelected.map(l => ({
            activityId: l.activityId,
            quantity: l.quantity,
            hoursPerYear: l.hoursPerYear,
            title: l.title.trim() || null,
            detail: l.detail.trim() || null,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Submission failed.");
      setCreatedRecordId(data?.record?.id ?? null);
      setWithdrawn(false);
      setWithdrawError(null);
      setStep("done");
      loadMySubs();
    } catch (err) {
      setSubmitError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (authLoading || orgLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 flex justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-base font-semibold mb-2">Please log in to submit activities to your organisation.</p>
        <Link href="/login" className="text-primary underline">Log in</Link>
      </div>
    );
  }

  if (!orgData?.org) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-base font-semibold mb-2">You're not connected to an organisation yet.</p>
        <p className="text-sm text-muted-foreground mb-4">Join your organisation first to submit activities to it.</p>
        <Link href="/org" className="text-primary underline">Go to the organisation portal</Link>
      </div>
    );
  }

  const orgName = orgData.org.name;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8" data-testid="org-member-submit-root">
      <div className="flex items-start gap-3 mb-2">
        <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
          <Building2 className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-display font-semibold text-foreground">Submit activities to {orgName}</h1>
          <p className="text-sm text-muted-foreground">
            Choose the activities you've completed for {orgName}. They'll be added straight to your organisation's totals.
          </p>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 mb-5 text-xs text-amber-900 flex items-start gap-2">
        <ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <span>
          Activities only — actions, donations, and custom activities aren't included in this org submission flow.
          Use the personal wizard if you'd like to log those for yourself.
        </span>
      </div>

      <div className="flex items-center gap-2 mb-6 text-xs text-muted-foreground" data-testid="member-submit-stepper">
        <span className={step === "select" ? "font-semibold text-foreground" : ""}>1. Pick activities</span>
        <ArrowRight className="w-3 h-3" />
        <span className={step === "details" ? "font-semibold text-foreground" : ""}>2. Add details</span>
        <ArrowRight className="w-3 h-3" />
        <span className={step === "review" || step === "done" ? "font-semibold text-foreground" : ""}>3. Review &amp; submit</span>
      </div>

      {step === "select" && mySubs && mySubs.length > 0 && (
        <div className="bg-white border border-border rounded-xl p-4 mb-4" data-testid="my-submissions-recent">
          <div className="flex items-center gap-2 mb-3">
            <History className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Your recent submissions to {orgName}</h3>
            <span className="text-[10px] font-medium text-muted-foreground">({mySubs.length})</span>
          </div>
          <ul className="divide-y divide-border max-h-60 overflow-y-auto">
            {mySubs.slice(0, 10).map(s => (
              <li
                key={s.recordId}
                className="py-2 flex items-center justify-between gap-3 text-sm"
                data-testid={`my-submission-${s.recordId}`}
              >
                <div className="min-w-0">
                  <p className="font-medium text-foreground truncate">
                    {s.period || s.name}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {new Date(s.submittedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    {" · "}
                    {s.activityCount} activit{s.activityCount === 1 ? "y" : "ies"}
                    {" · "}
                    {Math.round(s.totalHours).toLocaleString("en-GB")} hrs
                  </p>
                </div>
                <p className="text-xs font-semibold tabular-nums shrink-0">{formatGBP(s.totalValue)}</p>
              </li>
            ))}
          </ul>
          {mySubs.length > 10 && (
            <p className="mt-2 text-[11px] text-muted-foreground">Showing your 10 most recent submissions.</p>
          )}
        </div>
      )}

      {step === "select" && mySubsError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 mb-4 text-xs text-red-700" data-testid="my-submissions-error">
          Couldn't load your past submissions. {mySubsError}
        </div>
      )}

      {step === "select" && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="bg-white border border-border rounded-xl p-4 mb-4">
            <div className="flex items-center gap-2 mb-3">
              <Search className="w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search activities…"
                className="flex-1 text-sm outline-none bg-transparent"
                data-testid="member-submit-search"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setCategoryFilter(null)}
                className={`text-[11px] px-2 py-1 rounded-full border ${categoryFilter === null ? "bg-primary text-white border-primary" : "border-border text-foreground hover:bg-muted/30"}`}
              >
                All
              </button>
              {categories.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategoryFilter(c === categoryFilter ? null : c)}
                  className={`text-[11px] px-2 py-1 rounded-full border ${categoryFilter === c ? "bg-primary text-white border-primary" : "border-border text-foreground hover:bg-muted/30"}`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {actsLoading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : (
            <div className="bg-white border border-border rounded-xl overflow-hidden">
              <ul className="divide-y divide-border max-h-[480px] overflow-y-auto">
                {filtered.map(a => {
                  const isSelected = !!lines[a.id];
                  return (
                    <li key={a.id}>
                      <button
                        type="button"
                        onClick={() => toggleSelect(a)}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/20 transition-colors ${isSelected ? "bg-primary/5" : ""}`}
                        data-testid={`member-submit-activity-${a.id}`}
                      >
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${isSelected ? "bg-primary border-primary" : "border-border"}`}>
                          {isSelected && <Check className="w-3 h-3 text-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{a.name}</p>
                          <p className="text-[11px] text-muted-foreground truncate">{a.category} · {a.unitLabel}</p>
                        </div>
                      </button>
                    </li>
                  );
                })}
                {filtered.length === 0 && (
                  <li className="px-4 py-8 text-center text-sm text-muted-foreground">No activities match your filter.</li>
                )}
              </ul>
            </div>
          )}

          <div className="mt-6 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {selectedIds.length === 0 ? "Pick at least one activity to continue." : `${selectedIds.length} activit${selectedIds.length === 1 ? "y" : "ies"} selected`}
            </p>
            <button
              type="button"
              onClick={() => setStep("details")}
              disabled={selectedIds.length === 0}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
              data-testid="member-submit-next-details"
            >
              Next <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}

      {step === "details" && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
          <div className="bg-white border border-border rounded-xl p-4">
            <label className="block text-xs font-medium text-foreground mb-1.5">
              Period or label <span className="text-muted-foreground">(optional)</span>
            </label>
            <input
              type="text"
              value={periodLabel}
              onChange={e => setPeriodLabel(e.target.value)}
              placeholder="e.g. April 2026, Spring fundraiser"
              maxLength={80}
              className="w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:border-primary"
              data-testid="member-submit-period-label"
            />
          </div>

          {orderedSelected.map(line => {
            const def = activitiesById.get(line.activityId);
            if (!def) return null;
            const isHourly = def.unit === "hour";
            return (
              <div key={line.activityId} className="bg-white border border-border rounded-xl p-4" data-testid={`member-submit-line-${line.activityId}`}>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{def.name}</p>
                    <p className="text-[11px] text-muted-foreground">{def.category} · {def.unitLabel}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeLine(line.activityId)}
                    className="text-muted-foreground hover:text-red-600"
                    aria-label="Remove activity"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                  {isHourly ? (
                    <div>
                      <label className="block text-[11px] font-medium text-foreground mb-1">Hours per year</label>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={line.hoursPerYear || ""}
                        onChange={e => updateLine(line.activityId, { hoursPerYear: Number(e.target.value) || 0 })}
                        className="w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:border-primary"
                        data-testid={`member-submit-hours-${line.activityId}`}
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="block text-[11px] font-medium text-foreground mb-1">{def.unitLabel || "Quantity"}</label>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={line.quantity || ""}
                        onChange={e => updateLine(line.activityId, { quantity: Number(e.target.value) || 0 })}
                        className="w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:border-primary"
                        data-testid={`member-submit-quantity-${line.activityId}`}
                      />
                    </div>
                  )}
                  {!isHourly && (
                    <div>
                      <label className="block text-[11px] font-medium text-foreground mb-1">
                        Hours per year
                        {!line.hoursManual && (
                          <span className="text-muted-foreground font-normal"> (auto)</span>
                        )}
                      </label>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={line.hoursPerYear || ""}
                        onChange={e => updateLine(line.activityId, { hoursPerYear: Number(e.target.value) || 0, hoursManual: true })}
                        className="w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:border-primary"
                        data-testid={`member-submit-hours-${line.activityId}`}
                      />
                    </div>
                  )}
                  <div>
                    <label className="block text-[11px] font-medium text-foreground mb-1">Title <span className="text-muted-foreground">(optional)</span></label>
                    <input
                      type="text"
                      value={line.title}
                      onChange={e => updateLine(line.activityId, { title: e.target.value })}
                      maxLength={120}
                      placeholder="Short label"
                      className="w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:border-primary"
                      data-testid={`member-submit-title-${line.activityId}`}
                    />
                  </div>
                </div>

                {!isHourly && (() => {
                  const calc = sessionCalcs[line.activityId] ?? { hrsPerSession: 2, sessionsPerWeek: 1, weeksPerYear: 48 };
                  const isOpen = !!openCalcs[line.activityId];
                  return (
                    <div className="mb-3">
                      <button
                        type="button"
                        onClick={() => setOpenCalcs(o => ({ ...o, [line.activityId]: !o[line.activityId] }))}
                        className="text-[11px] font-medium text-primary hover:underline"
                        data-testid={`member-submit-calc-toggle-${line.activityId}`}
                      >
                        {isOpen ? "Hide session calculator" : "Use session calculator (weekly shifts)"}
                      </button>
                      {isOpen && (
                        <div className="mt-2 bg-muted/30 border border-border rounded-md p-3 space-y-2" data-testid={`member-submit-calc-${line.activityId}`}>
                          <p className="text-xs font-medium text-muted-foreground">Estimate annual hours from a regular shift</p>
                          <div className="flex flex-wrap items-center gap-2 text-sm">
                            <input
                              type="number" min="0.5" step="0.5"
                              value={calc.hrsPerSession}
                              onChange={e => updateSessionCalc(line.activityId, { hrsPerSession: Number(e.target.value) || 0 })}
                              className="w-16 p-1.5 rounded border border-border text-sm font-semibold text-center focus:border-primary outline-none"
                              data-testid={`member-submit-calc-hrs-${line.activityId}`}
                            />
                            <span className="text-muted-foreground text-xs">hrs/session ×</span>
                            <input
                              type="number" min="1"
                              value={calc.sessionsPerWeek}
                              onChange={e => updateSessionCalc(line.activityId, { sessionsPerWeek: Number(e.target.value) || 0 })}
                              className="w-14 p-1.5 rounded border border-border text-sm font-semibold text-center focus:border-primary outline-none"
                              data-testid={`member-submit-calc-sessions-${line.activityId}`}
                            />
                            <span className="text-muted-foreground text-xs">/week ×</span>
                            <input
                              type="number" min="1" max="52"
                              value={calc.weeksPerYear}
                              onChange={e => updateSessionCalc(line.activityId, { weeksPerYear: Number(e.target.value) || 0 })}
                              className="w-14 p-1.5 rounded border border-border text-sm font-semibold text-center focus:border-primary outline-none"
                              data-testid={`member-submit-calc-weeks-${line.activityId}`}
                            />
                            <span className="text-muted-foreground text-xs">weeks =</span>
                            <span className="font-bold text-foreground text-sm">
                              {Math.max(1, Math.round(calc.hrsPerSession * calc.sessionsPerWeek * calc.weeksPerYear))} hrs/yr
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                <div>
                  <label className="block text-[11px] font-medium text-foreground mb-1">Detail <span className="text-muted-foreground">(optional)</span></label>
                  <textarea
                    value={line.detail}
                    onChange={e => updateLine(line.activityId, { detail: e.target.value })}
                    maxLength={500}
                    rows={2}
                    placeholder="Anything your organisation should know"
                    className="w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:border-primary resize-y"
                    data-testid={`member-submit-detail-${line.activityId}`}
                  />
                </div>
              </div>
            );
          })}

          {orderedSelected.length === 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900">
              No activities selected. Go back and pick at least one.
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => setStep("select")}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <button
              type="button"
              onClick={() => setStep("review")}
              disabled={orderedSelected.length === 0}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
              data-testid="member-submit-next-review"
            >
              Review <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}

      {step === "review" && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="bg-white border border-border rounded-xl p-5 mb-4">
            <h3 className="text-sm font-semibold text-foreground mb-1">You're sharing this with {orgName}</h3>
            <p className="text-xs text-muted-foreground mb-4">
              These activities will be added to your organisation's totals straight away — no manager approval needed.
            </p>

            <div className="space-y-2 mb-5">
              {[
                { shared: true, label: `${orderedSelected.length} activit${orderedSelected.length === 1 ? "y" : "ies"} you've completed` },
                { shared: true, label: "Hours and quantities you entered" },
                { shared: true, label: "Optional titles and details" },
                { shared: true, label: `Estimated social value (~${formatGBP(totals.value)})` },
                { shared: false, label: "Your personal journal entries" },
                { shared: false, label: "Activities you log only for yourself" },
                { shared: false, label: "Donations or actions (not part of this flow)" },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-2.5 text-sm">
                  <div className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${item.shared ? "bg-green-100" : "bg-red-50"}`}>
                    {item.shared
                      ? <Check className="w-3 h-3 text-green-600" />
                      : <Lock className="w-2.5 h-2.5 text-red-400" />}
                  </div>
                  <span className="text-foreground">
                    <span className="font-semibold mr-1">{item.shared ? "Shared:" : "Not shared:"}</span>{item.label}
                  </span>
                </div>
              ))}
            </div>

            <div className="border-t border-border pt-4">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Summary</p>
              <div className="grid grid-cols-3 gap-3 text-sm mb-4">
                <div>
                  <p className="text-xs text-muted-foreground">Activities</p>
                  <p className="text-lg font-bold text-foreground">{orderedSelected.length}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Hours</p>
                  <p className="text-lg font-bold text-foreground">{Math.round(totals.hours).toLocaleString("en-GB")}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Est. social value</p>
                  <p className="text-lg font-bold text-foreground">{formatGBP(totals.value)}</p>
                </div>
              </div>
              <ul className="divide-y divide-border border border-border rounded-lg overflow-hidden">
                {orderedSelected.map(l => {
                  const def = activitiesById.get(l.activityId);
                  if (!def) return null;
                  return (
                    <li key={l.activityId} className="px-3 py-2 text-sm flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-foreground truncate">{l.title || def.name}</p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {def.category}
                          {def.unit === "hour"
                            ? ` · ${l.hoursPerYear} hrs/yr`
                            : ` · ${l.quantity} ${def.unitLabel} · ${l.hoursPerYear} hrs/yr`}
                          {l.detail && ` · ${l.detail.length > 60 ? l.detail.slice(0, 60) + "…" : l.detail}`}
                        </p>
                      </div>
                      <p className="text-xs font-semibold tabular-nums">{formatGBP(estimatedValue(def, l))}</p>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          {hoursWarnings.length > 0 && (
            <div
              className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4 text-sm text-amber-900 flex items-start gap-2"
              data-testid="member-submit-hours-warning"
            >
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
              <div>
                <p className="font-semibold mb-1">Quick sanity check on your hours</p>
                <p className="text-xs mb-2">
                  These look unusual — you can still submit, but it's worth a glance to make sure they're right.
                </p>
                <ul className="text-xs space-y-0.5 list-disc pl-4">
                  {hoursWarnings.map(w => (
                    <li key={w.activityId} data-testid={`member-submit-hours-warning-${w.activityId}`}>
                      <span className="font-medium">{w.name}</span>{" "}
                      {w.reason === "high"
                        ? `— ${w.hoursPerYear.toLocaleString("en-GB")} hrs/yr seems very high (more than a full-time job is ~2,000).`
                        : "— 0 hrs/yr looks like it might have been left blank."}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          <div className="bg-white border border-border rounded-xl p-5 mb-4" data-testid="member-submit-manager-preview">
            <div className="flex items-center gap-2 mb-1">
              <Eye className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">How your manager will see this</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              A preview of the rows that will appear in {orgName}'s activity dashboard.
            </p>

            <div className="rounded-lg border border-border bg-muted/10 p-4">
              <div className="flex items-center gap-2 mb-3 pb-3 border-b border-border">
                <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                  <Building2 className="w-3.5 h-3.5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground truncate">{orgName} · Activity feed</p>
                  <p className="text-[10px] text-muted-foreground">
                    {periodLabel.trim() ? `Submission: ${periodLabel.trim()}` : "New submission from you"}
                    {" · "}
                    {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b border-border">
                      <th className="font-semibold uppercase text-[10px] tracking-wider py-2 pr-3">Member</th>
                      <th className="font-semibold uppercase text-[10px] tracking-wider py-2 pr-3">Category</th>
                      <th className="font-semibold uppercase text-[10px] tracking-wider py-2 pr-3">Activity</th>
                      <th className="font-semibold uppercase text-[10px] tracking-wider py-2 pr-3 text-right">Hours</th>
                      <th className="font-semibold uppercase text-[10px] tracking-wider py-2 pr-3 text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderedSelected.map(l => {
                      const def = activitiesById.get(l.activityId);
                      if (!def) return null;
                      return (
                        <tr key={l.activityId} className="border-b border-border/60 align-top" data-testid={`member-submit-preview-row-${l.activityId}`}>
                          <td className="py-2 pr-3">
                            <p className="font-medium text-foreground">{user?.displayName || user?.email || "You"}</p>
                            {user?.displayName && user?.email && (
                              <p className="text-[10px] text-muted-foreground truncate">{user.email}</p>
                            )}
                          </td>
                          <td className="py-2 pr-3">
                            <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-semibold">{def.category}</span>
                          </td>
                          <td className="py-2 pr-3 max-w-md">
                            <p className="font-medium text-foreground">{l.title || def.name}</p>
                            <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
                              {def.unit === "hour"
                                ? `${l.hoursPerYear} hrs/yr`
                                : `${l.quantity} ${def.unitLabel}`}
                              {l.detail && ` · ${l.detail.length > 80 ? l.detail.slice(0, 80) + "…" : l.detail}`}
                            </p>
                          </td>
                          <td className="py-2 pr-3 text-right whitespace-nowrap tabular-nums">{Math.round(l.hoursPerYear).toLocaleString("en-GB")}</td>
                          <td className="py-2 pr-3 text-right whitespace-nowrap font-semibold text-foreground">{formatGBP(estimatedValue(def, l))}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted/40">
                      <td className="py-2 pr-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground" colSpan={3}>
                        Submission total
                      </td>
                      <td className="py-2 pr-3 text-right whitespace-nowrap font-bold text-foreground tabular-nums" data-testid="member-submit-preview-total-hours">
                        {Math.round(totals.hours).toLocaleString("en-GB")}
                      </td>
                      <td className="py-2 pr-3 text-right whitespace-nowrap font-bold text-foreground" data-testid="member-submit-preview-total-value">
                        {formatGBP(totals.value)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground mt-3">
              This is a preview — your submission will roll into {orgName}'s totals and appear in their activity feed once you confirm below.
            </p>
          </div>

          {submitError && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4 text-sm text-red-700 flex items-start gap-2" data-testid="member-submit-error">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setStep("details")}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
              disabled={submitting}
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={submitting || orderedSelected.length === 0}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
              data-testid="member-submit-confirm"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {submitting ? "Submitting…" : `Submit to ${orgName}`}
            </button>
          </div>
        </motion.div>
      )}

      {step === "done" && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white border border-border rounded-xl p-8 text-center" data-testid="member-submit-success">
          {withdrawn ? (
            <>
              <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
                <Undo2 className="w-6 h-6 text-amber-600" />
              </div>
              <h2 className="text-lg font-display font-semibold text-foreground mb-1">Submission withdrawn</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Your submission to {orgName} has been removed and the org's totals have been re-balanced.
              </p>
            </>
          ) : (
            <>
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <Check className="w-6 h-6 text-green-600" />
              </div>
              <h2 className="text-lg font-display font-semibold text-foreground mb-1">Sent to {orgName}</h2>
              <p className="text-sm text-muted-foreground mb-1">
                Your {orderedSelected.length} activit{orderedSelected.length === 1 ? "y" : "ies"} ({formatGBP(totals.value)} est. value) {createdRecordId ? `(record #${createdRecordId})` : ""} are now part of your organisation's totals.
              </p>
              <p className="text-xs text-muted-foreground mb-4">Your organisation manager can see them flagged as member-submitted.</p>
              {createdRecordId && (
                <div className="mb-6">
                  <button
                    type="button"
                    onClick={withdrawSubmission}
                    disabled={withdrawing}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-60"
                    data-testid="member-submit-withdraw"
                  >
                    {withdrawing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Undo2 className="w-3.5 h-3.5" />}
                    {withdrawing ? "Withdrawing…" : "Sent by mistake? Withdraw this submission"}
                  </button>
                  {withdrawError && (
                    <p className="text-xs text-red-600 mt-2" data-testid="member-submit-withdraw-error">{withdrawError}</p>
                  )}
                </div>
              )}
            </>
          )}
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => {
                setLines({});
                setSessionCalcs({});
                setOpenCalcs({});
                setPeriodLabel("");
                setCreatedRecordId(null);
                setWithdrawn(false);
                setWithdrawError(null);
                setStep("select");
              }}
              className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted/30 transition-colors"
            >
              {withdrawn ? "Start a new submission" : "Submit more"}
            </button>
            <button
              type="button"
              onClick={() => setLocation("/org")}
              className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors"
            >
              Back to organisation
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
