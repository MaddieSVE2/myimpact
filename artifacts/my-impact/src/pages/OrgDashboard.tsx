import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  Building2, TrendingUp, Users, Clock, BadgeCheck, Filter, Download,
  FileSpreadsheet, FileText, Settings, ChevronLeft, ChevronRight, Search, EyeOff, AlertCircle,
  Globe2, Layers, Flag, Plus, X, ClipboardList,
} from "lucide-react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell,
} from "recharts";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { PulseSurveysSection } from "@/components/PulseSurveysSection";
import { useT } from "@/i18n";
import {
  DEMO_ORG_ID, DEMO_INVITE_CODE, DEMO_MEMBERS, DEMO_ACTIVITIES,
  computeDemoAggregates, computeMonthlyTrend, computeSdgBreakdown, computeCategoryBreakdown,
  getDemoMember, getRemovedMemberIds, getOrgInviteCode, SDG_BY_CATEGORY,
  type ActivityCategory, type DemoActivity, type SdgBreakdownPoint,
} from "@/lib/org-demo-mock";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface MyOrgResponse { org: { id: string; name: string; type: string; role: string } | null }

function useMyOrg() {
  return useQuery<MyOrgResponse>({
    queryKey: ["my-org"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/org/my`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });
}

const PAGE_SIZE = 10;
const CATEGORIES: ActivityCategory[] = ["Environment", "Community", "Health", "Education"];

function parseCategory(v: string): "all" | ActivityCategory {
  if (v === "Environment" || v === "Community" || v === "Health" || v === "Education") return v;
  return "all";
}

function escapeCsv(v: string | number): string {
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadCsv(rows: Array<Record<string, string | number>>, filename: string) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map(r => headers.map(h => escapeCsv(r[h] ?? "")).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}

function StatCard({ icon: Icon, label, value, sub, highlight }: {
  icon: React.ComponentType<{ className?: string }>; label: string; value: number; sub?: string; highlight?: boolean;
}) {
  return (
    <div className={`rounded-xl p-5 border ${highlight ? "bg-primary text-white border-primary" : "bg-white border-border"}`}>
      <div className="flex items-center gap-2 mb-3">
        <Icon className={`w-4 h-4 ${highlight ? "text-white/70" : "text-primary"}`} />
        <p className={`text-[11px] font-semibold uppercase tracking-wider ${highlight ? "text-white/70" : "text-muted-foreground"}`}>{label}</p>
      </div>
      <p className={`text-2xl font-display font-bold ${highlight ? "text-white" : "text-foreground"}`}>
        <AnimatedNumber value={value} formatter={v => v.toLocaleString("en-GB")} />
      </p>
      {sub && <p className={`text-xs mt-1 ${highlight ? "text-white/60" : "text-muted-foreground"}`}>{sub}</p>}
    </div>
  );
}

function memberLabel(memberId: string, anon: boolean): { name: string; email: string } {
  if (anon) {
    const idx = DEMO_MEMBERS.findIndex(m => m.id === memberId);
    return { name: `Member ${String(idx + 1).padStart(3, "0")}`, email: "—" };
  }
  const m = getDemoMember(memberId);
  return { name: m?.name ?? memberId, email: m?.email ?? "" };
}

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

function OrgChallengesPanel({ orgId }: { orgId: string }) {
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
    <div className="bg-white border border-border rounded-xl p-5 mb-6" data-testid="section-org-challenges">
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

interface PulseSummarySurvey {
  id: string;
  archivedAt: string | null;
}
interface PulseSummaryResults {
  totals: { responses: number; average: number };
}

function OrgPulseSummaryCard() {
  const t = useT();
  const { data: surveysData } = useQuery<{ surveys: PulseSummarySurvey[] }>({
    queryKey: ["org-surveys"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/org/surveys`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });
  const activeIds = useMemo(
    () => (surveysData?.surveys ?? []).filter(s => !s.archivedAt).map(s => s.id),
    [surveysData?.surveys],
  );
  const resultsQueries = useQueries({
    queries: activeIds.map(id => ({
      queryKey: ["org-survey-results", id],
      queryFn: async (): Promise<PulseSummaryResults> => {
        const res = await fetch(`${BASE}/api/org/surveys/${id}/results`, { credentials: "include" });
        if (!res.ok) throw new Error("Failed");
        return res.json();
      },
    })),
  });
  const totals = resultsQueries.reduce(
    (acc, q) => {
      const r = q.data;
      if (!r) return acc;
      acc.responses += r.totals.responses;
      acc.weighted += r.totals.average * r.totals.responses;
      return acc;
    },
    { responses: 0, weighted: 0 },
  );
  const avg = totals.responses > 0 ? totals.weighted / totals.responses : 0;
  const hasAny = activeIds.length > 0;

  return (
    <div className="bg-white border border-border rounded-xl p-5 mb-4" data-testid="section-pulse-summary">
      <div className="flex items-center gap-2 mb-3">
        <ClipboardList className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">{t("orgDashboard.pulseSummaryTitle")}</h3>
      </div>
      {!hasAny ? (
        <p className="text-xs text-muted-foreground">{t("orgDashboard.pulseSummaryNone")}</p>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-muted/30 px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("orgDashboard.pulseSummaryActive")}</p>
            <p className="text-lg font-display font-bold text-foreground mt-0.5" data-testid="pulse-summary-active">{activeIds.length}</p>
          </div>
          <div className="rounded-lg bg-muted/30 px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("orgDashboard.pulseSummaryResponses")}</p>
            <p className="text-lg font-display font-bold text-foreground mt-0.5" data-testid="pulse-summary-responses">{totals.responses}</p>
          </div>
          <div className="rounded-lg bg-muted/30 px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("orgDashboard.pulseSummaryAverage")}</p>
            <p className="text-lg font-display font-bold text-foreground mt-0.5" data-testid="pulse-summary-average">
              {totals.responses > 0 ? `${avg.toFixed(1)} / 5` : "—"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function buildPdf(orgName: string, rows: Array<{ activity: DemoActivity; member: { name: string; email: string } }>, totals: { value: number; hours: number; activities: number }, monthlyTrend: ReturnType<typeof computeMonthlyTrend>, filterSummary: string, highlights: Array<{ activity: DemoActivity; member: { name: string; email: string } }>, sdgs: SdgBreakdownPoint[]) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 40;
  doc.setFont("helvetica", "bold"); doc.setFontSize(18);
  doc.text(`${orgName} — Member impact report`, margin, 50);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(100);
  doc.text(`Generated ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}`, margin, 66);
  if (filterSummary) doc.text(filterSummary, margin, 80);

  doc.setFontSize(12); doc.setFont("helvetica", "bold"); doc.setTextColor(20);
  doc.text("Summary", margin, 110);
  doc.setFont("helvetica", "normal"); doc.setFontSize(11);
  doc.text(`Total social value: £${totals.value.toLocaleString("en-GB")}`, margin, 128);
  doc.text(`Hours logged: ${Math.round(totals.hours).toLocaleString("en-GB")}`, margin, 144);
  doc.text(`Activities: ${totals.activities.toLocaleString("en-GB")}`, margin, 160);

  doc.setFont("helvetica", "bold"); doc.setFontSize(12);
  doc.text("Monthly trend (social value, £)", margin, 190);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  if (monthlyTrend.length === 0) {
    doc.text("No data in this range.", margin, 208);
  } else {
    const max = Math.max(1, ...monthlyTrend.map(p => p.value));
    const baseY = 280; const barW = 28; const gap = 14;
    monthlyTrend.forEach((p, i) => {
      const x = margin + i * (barW + gap);
      const h = (p.value / max) * 70;
      doc.setFillColor(13, 148, 136); // primary teal-ish
      doc.rect(x, baseY - h, barW, h, "F");
      doc.setTextColor(80);
      doc.text(p.label, x, baseY + 12);
      doc.text(`£${p.value}`, x, baseY - h - 4);
    });
  }

  // Highlights — top notable activities by social value, with descriptions.
  doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(20);
  doc.text("Highlights", margin, 310);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(60);
  let y = 326;
  if (highlights.length === 0) {
    doc.text("No activities to highlight in this range.", margin, y);
    y += 16;
  } else {
    highlights.slice(0, 5).forEach((h) => {
      doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(20);
      const head = `• ${h.activity.activity} — £${h.activity.socialValueGBP} (${h.member.name})`;
      doc.text(head, margin, y);
      y += 13;
      doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(80);
      const wrapped = doc.splitTextToSize(h.activity.description, 515);
      doc.text(wrapped, margin + 10, y);
      y += wrapped.length * 11 + 6;
    });
  }

  // SDG alignment block — show ranked breakdown so funders see global-goal contribution.
  doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(20);
  doc.text("UN Sustainable Development Goals (SDGs)", margin, y);
  y += 14;
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(80);
  if (sdgs.length === 0) {
    doc.text("No SDG-aligned activities in this range.", margin, y); y += 14;
  } else {
    const maxVal = Math.max(1, ...sdgs.map(s => s.value));
    sdgs.forEach((s) => {
      const hex = s.color.replace("#", "");
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const labelLine = `SDG ${s.number} · ${s.label}`;
      doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(20);
      doc.text(labelLine, margin, y);
      doc.setFont("helvetica", "normal"); doc.setTextColor(80);
      doc.text(`£${s.value.toLocaleString("en-GB")}  ·  ${s.pct}%  ·  ${s.members} members  ·  ${s.activities} activities`, margin + 280, y);
      y += 4;
      const barW = (s.value / maxVal) * 320;
      doc.setFillColor(r, g, b);
      doc.rect(margin, y, barW, 6, "F");
      y += 14;
    });
  }
  y += 4;

  autoTable(doc, {
    startY: y + 6,
    head: [["Date", "Member", "Category", "SDG", "Activity", "Hours", "£"]],
    body: rows.map(({ activity, member }) => {
      const sdg = SDG_BY_CATEGORY[activity.category];
      return [
        new Date(activity.occurredAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
        member.name,
        activity.category,
        sdg ? `${sdg.number}` : "—",
        `${activity.activity}\n${activity.description}`,
        activity.hours.toString(),
        `£${activity.socialValueGBP}`,
      ];
    }),
    styles: { fontSize: 8, cellPadding: 4, valign: "top" },
    headStyles: { fillColor: [13, 148, 136], textColor: 255, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 56 },
      1: { cellWidth: 72 },
      2: { cellWidth: 54 },
      3: { cellWidth: 28, halign: "center" },
      4: { cellWidth: 215 },
      5: { cellWidth: 32, halign: "right" },
      6: { cellWidth: 38, halign: "right" },
    },
    margin: { left: margin, right: margin },
  });

  doc.save(`${orgName.replace(/\s+/g, "-").toLowerCase()}-impact-report.pdf`);
}

export default function OrgDashboard() {
  const { data: orgData, isLoading, isError } = useMyOrg();
  const [, setLocation] = useLocation();

  const [category, setCategory] = useState<"all" | ActivityCategory>("all");
  const [memberId, setMemberId] = useState<"all" | string>("all");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [anonymise, setAnonymise] = useState(false);

  const isManager = orgData?.org?.role === "manager";
  const isDemoOrg = orgData?.org?.id === DEMO_ORG_ID;

  // The new mock-data dashboard is currently demo-only. Non-demo managers
  // should keep using the live /org portal until live data wiring exists
  // (tracked as a follow-up). Send them back rather than show foreign data.
  useEffect(() => {
    if (orgData?.org && isManager && !isDemoOrg) {
      setLocation("/org", { replace: true });
    }
  }, [orgData?.org, isManager, isDemoOrg, setLocation]);

  const removedIds = useMemo(() => isDemoOrg ? new Set(getRemovedMemberIds(DEMO_ORG_ID)) : new Set<string>(), [isDemoOrg]);

  const allActivities = useMemo(
    () => DEMO_ACTIVITIES.filter(a => !removedIds.has(a.memberId)),
    [removedIds],
  );

  const filtered = useMemo(() => {
    return allActivities.filter(a => {
      if (category !== "all" && a.category !== category) return false;
      if (memberId !== "all" && a.memberId !== memberId) return false;
      if (from && a.occurredAt < from) return false;
      if (to && a.occurredAt > to) return false;
      if (query) {
        const q = query.toLowerCase();
        const m = getDemoMember(a.memberId);
        const hay = `${a.activity} ${a.description} ${anonymise ? "" : (m?.name ?? "")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  }, [allActivities, category, memberId, from, to, query, anonymise]);

  const aggregates = useMemo(() => computeDemoAggregates(filtered), [filtered]);
  const trend = useMemo(() => computeMonthlyTrend(filtered), [filtered]);
  const sdgBreakdowns = useMemo(() => computeSdgBreakdown(filtered), [filtered]);
  const categoryBreakdown = useMemo(() => computeCategoryBreakdown(filtered), [filtered]);
  const t = useT();
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  if (isLoading) {
    return <div className="max-w-5xl mx-auto px-4 py-16 flex justify-center">
      <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>;
  }

  if (isError) {
    return <div className="max-w-2xl mx-auto px-4 py-16 text-center">
      <AlertCircle className="w-6 h-6 text-red-500 mx-auto mb-2" />
      <p className="text-base font-semibold mb-1">Could not load your organisation</p>
      <p className="text-sm text-muted-foreground">Please refresh the page or try again in a moment.</p>
    </div>;
  }

  if (!orgData?.org) {
    return <div className="max-w-2xl mx-auto px-4 py-20 text-center">
      <p className="text-base font-semibold mb-2">You're not in an organisation yet.</p>
      <Link href="/org" className="text-primary underline">Go to the organisation portal</Link>
    </div>;
  }

  if (!isManager) {
    return <div className="max-w-2xl mx-auto px-4 py-20 text-center">
      <p className="text-base font-semibold mb-2">Manager access required</p>
      <p className="text-sm text-muted-foreground">The organisation dashboard is only available to your organisation manager.</p>
      <Link href="/org" className="text-primary text-sm underline mt-3 inline-block">Back to your organisation page</Link>
    </div>;
  }

  // Non-demo managers are redirected by the effect above; render nothing while
  // the navigation happens to avoid flashing foreign data.
  if (!isDemoOrg) {
    return <div className="max-w-2xl mx-auto px-4 py-16 flex justify-center">
      <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>;
  }

  function exportRows() {
    return filtered.map(a => {
      const m = memberLabel(a.memberId, anonymise);
      const sdg = SDG_BY_CATEGORY[a.category];
      return {
        Date: a.occurredAt,
        Member: m.name,
        Email: m.email,
        Category: a.category,
        "SDG number": sdg ? sdg.number : "",
        "SDG label": sdg ? sdg.label : "",
        Activity: a.activity,
        Description: a.description,
        Hours: a.hours,
        "Social value (GBP)": a.socialValueGBP,
        Verified: a.verified ? "Yes" : "No",
      };
    });
  }

  function sdgExportRows(): Array<Record<string, string | number>> {
    return sdgBreakdowns.map(s => ({
      "SDG number": s.number,
      "SDG label": s.label,
      "Social value (GBP)": s.value,
      "Share (%)": s.pct,
      Hours: Math.round(s.hours * 10) / 10,
      Activities: s.activities,
      Members: s.members,
    }));
  }

  function filterSummary(): string {
    const bits: string[] = [];
    if (category !== "all") bits.push(`Category: ${category}`);
    if (memberId !== "all") bits.push(`Member: ${memberLabel(memberId, anonymise).name}`);
    if (from) bits.push(`From: ${from}`);
    if (to) bits.push(`To: ${to}`);
    if (anonymise) bits.push("Anonymised");
    return bits.join(" · ");
  }

  function handleCsv() {
    if (filtered.length === 0) return;
    const slug = orgData!.org!.name.replace(/\s+/g, "-").toLowerCase();
    downloadCsv(exportRows(), `${slug}-activity.csv`);
    if (sdgBreakdowns.length > 0) downloadCsv(sdgExportRows(), `${slug}-sdg-breakdown.csv`);
  }
  function handlePdf() {
    if (filtered.length === 0) return;
    const rowsForPdf = filtered.map(a => ({ activity: a, member: memberLabel(a.memberId, anonymise) }));
    const highlights = [...rowsForPdf].sort((a, b) => b.activity.socialValueGBP - a.activity.socialValueGBP).slice(0, 5);
    buildPdf(
      orgData!.org!.name,
      rowsForPdf,
      { value: aggregates.totalSocialValue, hours: aggregates.totalHours, activities: aggregates.totalActivities },
      trend,
      filterSummary(),
      highlights,
      sdgBreakdowns,
    );
  }

  const inviteCode = isDemoOrg ? getOrgInviteCode(DEMO_ORG_ID, DEMO_INVITE_CODE) : null;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-start justify-between gap-3 mb-6 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="w-4 h-4 text-primary" />
            <h1 className="text-2xl font-display font-semibold text-foreground">{orgData.org.name}</h1>
            {isDemoOrg && <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">Demo data</span>}
          </div>
          <p className="text-sm text-muted-foreground">Aggregated impact and a drill-down feed of every activity logged by your members.</p>
        </div>
      </div>

      {/* Org sub-nav */}
      <div className="flex items-center gap-1 mb-5 border-b border-border" role="tablist" aria-label="Organisation navigation">
        <Link href="/org/dashboard" className="px-3 py-2 text-xs font-semibold border-b-2 border-primary text-primary -mb-px" data-testid="subnav-dashboard">
          <span className="inline-flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" /> Dashboard</span>
        </Link>
        <Link href="/org/settings" className="px-3 py-2 text-xs font-semibold border-b-2 border-transparent text-muted-foreground hover:text-foreground hover:border-border" data-testid="subnav-settings">
          <span className="inline-flex items-center gap-1.5"><Settings className="w-3.5 h-3.5" /> Settings</span>
        </Link>
        <button
          type="button"
          onClick={() => document.getElementById("org-export-buttons")?.scrollIntoView({ behavior: "smooth", block: "center" })}
          className="px-3 py-2 text-xs font-semibold border-b-2 border-transparent text-muted-foreground hover:text-foreground hover:border-border"
          data-testid="subnav-export"
        >
          <span className="inline-flex items-center gap-1.5"><Download className="w-3.5 h-3.5" /> Export</span>
        </button>
        <div className="flex-1" />
        <button onClick={() => setLocation("/org/settings")} className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 my-1 rounded-lg border border-border text-xs font-semibold hover:bg-muted/30 transition-colors" data-testid="button-org-settings">
          <Settings className="w-3.5 h-3.5" /> Organisation settings
        </button>
      </div>

      {isDemoOrg && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 mb-6 text-xs text-amber-900">
          You're viewing the demo organisation with mock data. Invite code <span className="font-mono font-semibold">{inviteCode}</span>.
        </div>
      )}

      {/* Aggregated stats */}
      <motion.div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <StatCard icon={TrendingUp} label="Total social value" value={aggregates.totalSocialValue} sub={`£${aggregates.verifiedSocialValue.toLocaleString("en-GB")} verified`} highlight />
        <StatCard icon={Users} label="Active members" value={aggregates.activeMembers} sub={`of ${aggregates.totalMembers} total`} />
        <StatCard icon={Clock} label="Hours logged" value={Math.round(aggregates.totalHours)} sub={`${aggregates.totalActivities} activities`} />
        <StatCard icon={BadgeCheck} label="Avg per member" value={aggregates.averagePerMember} sub="across all members" />
      </motion.div>

      {/* Trend over recent months */}
      <div className="bg-white border border-border rounded-xl p-5 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Social value by month</h3>
          <span className="text-xs text-muted-foreground">(£ generated each month, last few months)</span>
        </div>
        {trend.length === 0 ? (
          <p className="text-xs text-muted-foreground py-6 text-center">No activity in this date range.</p>
        ) : (
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trend} margin={{ top: 8, right: 12, bottom: 4, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `£${v}`} />
                <RechartsTooltip
                  formatter={(v: number) => [`£${v.toLocaleString("en-GB")}`, "Social value"]}
                  labelFormatter={(l) => String(l)}
                />
                <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* SDG alignment */}
      <div className="bg-white border border-border rounded-xl p-5 mb-6" data-testid="section-sdg-alignment">
        <div className="flex items-center gap-2 mb-1">
          <Globe2 className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">{t("orgDashboard.sdgTitle")}</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-4">{t("orgDashboard.sdgSubtitle")}</p>
        {sdgBreakdowns.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">{t("orgDashboard.sdgEmpty")}</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-center">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={sdgBreakdowns}
                    dataKey="value"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={86}
                    paddingAngle={2}
                    isAnimationActive
                  >
                    {sdgBreakdowns.map((s) => (
                      <Cell key={s.number} fill={s.color} stroke="#fff" strokeWidth={2} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    formatter={(v: number, _n, payload) => {
                      const p = (payload as unknown as { payload: SdgBreakdownPoint }).payload;
                      return [`£${v.toLocaleString("en-GB")} · ${p.pct}%`, `SDG ${p.number} ${p.label}`];
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ol className="space-y-2" data-testid="list-sdg-ranked">
              {sdgBreakdowns.map((s, idx) => (
                <li key={s.number} className="flex items-center gap-3" data-testid={`sdg-rank-${s.number}`}>
                  <span className="shrink-0 w-7 h-7 rounded-md text-white text-xs font-bold inline-flex items-center justify-center" style={{ backgroundColor: s.color }}>
                    {s.number}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-foreground truncate">{s.label}</p>
                      <p className="text-xs font-bold text-foreground shrink-0">{s.pct}%</p>
                    </div>
                    <div className="h-1.5 mt-1 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${s.pct}%`, backgroundColor: s.color }} />
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {idx === 0 && <span className="font-semibold text-foreground">{t("orgDashboard.sdgLeading")} · </span>}
                      £{s.value.toLocaleString("en-GB")} · <span data-testid={`sdg-members-${s.number}`}>{s.members}</span> {t("orgDashboard.sdgMembers")} · {s.activities} {t("orgDashboard.sdgActivities")}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>

      {/* Top categories */}
      <div className="bg-white border border-border rounded-xl p-5 mb-6" data-testid="section-top-categories">
        <div className="flex items-center gap-2 mb-1">
          <Layers className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">{t("orgDashboard.categoriesTitle")}</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-4">{t("orgDashboard.categoriesSubtitle")}</p>
        {categoryBreakdown.every(c => c.value === 0) ? (
          <p className="text-xs text-muted-foreground text-center py-6">{t("orgDashboard.categoriesEmpty")}</p>
        ) : (
          <div className="space-y-3">
            {categoryBreakdown.map((c, idx) => {
              const max = Math.max(1, ...categoryBreakdown.map(x => x.value));
              const sdg = SDG_BY_CATEGORY[c.category];
              return (
                <div key={c.category} className="py-2 px-3 rounded-lg hover:bg-muted/20 transition-colors" data-testid={`category-rank-${c.category}`}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="shrink-0 text-[10px] font-bold text-muted-foreground w-4 text-right">{idx + 1}.</span>
                      <p className="text-sm font-semibold text-foreground truncate">{c.category}</p>
                      {idx === 0 && (
                        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                          {t("orgDashboard.categoriesLeading")}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-bold text-foreground shrink-0">£{c.value.toLocaleString("en-GB")}</p>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden mb-1.5">
                    <div className="h-full rounded-full" style={{ width: `${(c.value / max) * 100}%`, backgroundColor: sdg?.color ?? "hsl(var(--primary))" }} />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    <span className="font-semibold text-foreground">{c.members}</span> {t("orgDashboard.categoriesMembers")} · <span className="font-semibold text-foreground">{c.activities}</span> {t("orgDashboard.categoriesActivities")} · <span className="font-semibold text-foreground">{Math.round(c.hours)}</span> {t("orgDashboard.categoriesHours")}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Organisational challenges */}
      <OrgChallengesPanel orgId={orgData.org.id} />

      {/* Pulse surveys */}
      <OrgPulseSummaryCard />
      <div className="mb-2">
        <PulseSurveysSection />
      </div>

      {/* Filters & feed */}
      <div className="bg-white border border-border rounded-xl p-5 mb-6">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Activity feed</h3>
            <span className="text-xs text-muted-foreground">({filtered.length} {filtered.length === 1 ? "result" : "results"})</span>
          </div>
          <div id="org-export-buttons" className="flex items-center gap-2 flex-wrap scroll-mt-20">
            <label className="inline-flex items-center gap-1.5 text-xs text-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={anonymise}
                onChange={e => setAnonymise(e.target.checked)}
                className="rounded border-border"
                data-testid="checkbox-anonymise"
              />
              <EyeOff className="w-3 h-3" /> Anonymise members
            </label>
            <button onClick={handleCsv} disabled={filtered.length === 0} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-semibold hover:bg-muted/30 transition-colors disabled:opacity-50" data-testid="button-export-csv">
              <FileSpreadsheet className="w-3.5 h-3.5" /> CSV
            </button>
            <button onClick={handlePdf} disabled={filtered.length === 0} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50" data-testid="button-export-pdf">
              <FileText className="w-3.5 h-3.5" /> PDF
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 mb-4">
          <div className="lg:col-span-2 relative">
            <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={query}
              onChange={e => { setQuery(e.target.value); setPage(1); }}
              placeholder="Search description, activity, member…"
              className="w-full pl-8 pr-2 py-1.5 rounded-md border border-border text-xs focus:outline-none focus:border-primary"
              data-testid="input-search"
            />
          </div>
          <select value={category} onChange={e => { setCategory(parseCategory(e.target.value)); setPage(1); }} className="px-2 py-1.5 rounded-md border border-border text-xs bg-white" data-testid="select-category">
            <option value="all">All categories</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={memberId} onChange={e => { setMemberId(e.target.value); setPage(1); }} className="px-2 py-1.5 rounded-md border border-border text-xs bg-white" data-testid="select-member">
            <option value="all">All members</option>
            {DEMO_MEMBERS.filter(m => !removedIds.has(m.id)).map(m => (
              <option key={m.id} value={m.id}>{anonymise ? memberLabel(m.id, true).name : m.name}</option>
            ))}
          </select>
          <div className="flex gap-1">
            <input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1); }} className="flex-1 min-w-0 px-2 py-1.5 rounded-md border border-border text-xs" aria-label="From" />
            <input type="date" value={to} onChange={e => { setTo(e.target.value); setPage(1); }} className="flex-1 min-w-0 px-2 py-1.5 rounded-md border border-border text-xs" aria-label="To" />
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">No activities match these filters.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border">
                    <th className="font-semibold uppercase text-[10px] tracking-wider py-2 pr-3">Date</th>
                    <th className="font-semibold uppercase text-[10px] tracking-wider py-2 pr-3">Member</th>
                    <th className="font-semibold uppercase text-[10px] tracking-wider py-2 pr-3">Category</th>
                    <th className="font-semibold uppercase text-[10px] tracking-wider py-2 pr-3">Activity</th>
                    <th className="font-semibold uppercase text-[10px] tracking-wider py-2 pr-3 text-right">Hours</th>
                    <th className="font-semibold uppercase text-[10px] tracking-wider py-2 pr-3 text-right">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map(a => {
                    const m = memberLabel(a.memberId, anonymise);
                    return (
                      <tr key={a.id} className="border-b border-border/60 align-top hover:bg-muted/20" data-testid={`row-activity-${a.id}`}>
                        <td className="py-2 pr-3 text-muted-foreground whitespace-nowrap">{new Date(a.occurredAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</td>
                        <td className="py-2 pr-3">
                          <p className="font-medium text-foreground">{m.name}</p>
                          {!anonymise && m.email && <p className="text-[10px] text-muted-foreground">{m.email}</p>}
                        </td>
                        <td className="py-2 pr-3"><span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-semibold">{a.category}</span></td>
                        <td className="py-2 pr-3 max-w-md">
                          <p className="font-medium text-foreground">{a.activity}</p>
                          <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{a.description}</p>
                        </td>
                        <td className="py-2 pr-3 text-right whitespace-nowrap">{a.hours}</td>
                        <td className="py-2 pr-3 text-right whitespace-nowrap">
                          <span className="font-semibold text-foreground">£{a.socialValueGBP}</span>
                          {a.verified && <BadgeCheck className="inline-block w-3 h-3 text-green-600 ml-1" aria-label="Verified" />}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 text-xs">
                <p className="text-muted-foreground">Page {safePage} of {totalPages}</p>
                <div className="flex gap-1">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage === 1} className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border disabled:opacity-40">
                    <ChevronLeft className="w-3 h-3" /> Prev
                  </button>
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages} className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border disabled:opacity-40">
                    Next <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
