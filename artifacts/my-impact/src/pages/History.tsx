import { useState, useRef, useEffect } from "react";
import {
  useGetImpactHistory, useUpdateImpactRecord, useDeleteImpactRecord, useDeleteAllImpactRecords,
  getGetImpactHistoryQueryKey,
} from "@workspace/api-client-react";
import type { ImpactResult, SelectedActivity, SavedImpact } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { formatCurrency } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar, TrendingUp, ArrowRight, ChevronDown, ChevronUp,
  HandCoins, UserPlus, Trophy, Clock, FileText, Pencil, Trash2, Check, X, AlertTriangle, ExternalLink,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useWizard, type HistoryRecord } from "@/lib/wizard-context";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer,
} from "recharts";

const LOCAL_HISTORY_KEY = "mi_local_history";

function getLocalHistory(): LocalRecord[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveLocalHistory(records: LocalRecord[]) {
  localStorage.setItem(LOCAL_HISTORY_KEY, JSON.stringify(records));
}

interface LocalRecord {
  id: string;
  name: string;
  period: string | null;
  createdAt: string;
  impactResult: ImpactResult;
  activities: SelectedActivity[];
  region?: string | null;
  outwardCode?: string | null;
  lat?: number | null;
  lng?: number | null;
}

type AnyRecord = LocalRecord | SavedImpact;

type Breakdown = {
  activityId: string;
  activityName: string;
  category: string;
  proxy: string;
  proxyYear: string;
  sdg: string;
  sdgColor: string;
  impactValue: number;
  hours: number;
};

function RecordDetail({ result }: { result: any }) {
  if (!result) {
    return (
      <div className="border-t border-border px-4 py-3 text-sm text-muted-foreground">
        No detail available for this record.
      </div>
    );
  }
  const breakdowns: Breakdown[] = result.activityBreakdowns ?? [];

  const metrics = [
    { label: "Direct impact", value: result.impactValue, icon: TrendingUp, colour: "#F06127" },
    { label: "Contribution", value: result.contributionValue, icon: UserPlus, colour: "#3b82f6" },
    { label: "Donations", value: result.donationsValue, icon: HandCoins, colour: "#22c55e" },
    { label: "Personal dev", value: result.personalDevelopmentValue, icon: Trophy, colour: "#f59e0b" },
  ];

  return (
    <div className="border-t border-border">
      <div className="grid grid-cols-4 divide-x divide-border border-b border-border">
        {metrics.map(m => (
          <div key={m.label} className="px-3 py-2.5 flex flex-col gap-0.5">
            <m.icon className="w-3 h-3 mb-0.5" style={{ color: m.colour }} />
            <p className="text-[10px] text-muted-foreground leading-none">{m.label}</p>
            <p className="text-xs font-bold text-foreground">{formatCurrency(m.value)}</p>
          </div>
        ))}
      </div>

      {breakdowns.length > 0 ? (
        <div className="divide-y divide-border">
          {breakdowns.map(b => (
            <div key={b.activityId} className="flex items-center gap-3 px-4 py-3">
              <div
                className="w-0.5 self-stretch rounded-full shrink-0"
                style={{ backgroundColor: b.sdgColor || "#7E8FAD", minHeight: 20 }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground leading-snug truncate">{b.activityName}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-muted-foreground">{b.category}</span>
                  {b.hours > 0 && (
                    <>
                      <span className="text-[10px] text-muted-foreground/40">·</span>
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                        <Clock className="w-2.5 h-2.5" aria-hidden="true" /> {b.hours} hrs
                      </span>
                    </>
                  )}
                </div>
              </div>
              <p className="text-xs font-bold shrink-0" style={{ color: "#F06127" }}>
                {formatCurrency(b.impactValue)}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="px-4 py-3 text-xs text-muted-foreground italic">No activity breakdown recorded.</p>
      )}

      <div className="flex items-center justify-between px-4 py-3 bg-muted/10 border-t border-border">
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Clock className="w-3 h-3" aria-hidden="true" />
          {Math.round(result.totalHours)} volunteer hours total
        </div>
        <p className="text-xs font-bold text-foreground">{formatCurrency(result.totalValue)} total value</p>
      </div>
    </div>
  );
}

export default function History() {
  const { user } = useAuth();
  const isAuthenticated = !!user?.id;
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const { loadFromRecord } = useWizard();

  const { data: serverData, isLoading } = useGetImpactHistory(
    { userId: user?.id ?? "" },
    { query: { enabled: isAuthenticated, queryKey: getGetImpactHistoryQueryKey({ userId: user?.id ?? "" }) } }
  );

  const [localRecords, setLocalRecords] = useState<LocalRecord[]>(() =>
    isAuthenticated ? [] : getLocalHistory()
  );

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [downloadingPdfId, setDownloadingPdfId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const editInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const updateRecord = useUpdateImpactRecord();
  const deleteRecord = useDeleteImpactRecord();
  const deleteAll = useDeleteAllImpactRecords();

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  const invalidateHistory = () => {
    queryClient.invalidateQueries({ queryKey: getGetImpactHistoryQueryKey({ userId: user?.id ?? "" }) });
  };

  const handleDownloadPdf = async (recordId: string, recordName: string) => {
    setDownloadingPdfId(recordId);
    try {
      const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${BASE}/api/impact/pdf?recordId=${encodeURIComponent(recordId)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Server error");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `my-impact-${recordName.replace(/\s+/g, "-").toLowerCase()}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "PDF export failed", description: "Could not generate the PDF. Please try again.", variant: "destructive" });
    } finally {
      setDownloadingPdfId(null);
    }
  };

  const handleStartEdit = (record: { id: string; period?: string | null; name: string }) => {
    setEditingId(record.id);
    setEditValue(record.period ?? record.name ?? "");
    setDeletingId(null);
  };

  const handleSaveEdit = async (recordId: string) => {
    const trimmed = editValue.trim();
    if (!trimmed) {
      setEditingId(null);
      return;
    }
    if (isAuthenticated) {
      try {
        await updateRecord.mutateAsync({ id: recordId, data: { periodLabel: trimmed } });
        invalidateHistory();
        toast({ title: "Period label updated" });
      } catch {
        toast({ title: "Update failed", description: "Could not update the label. Please try again.", variant: "destructive" });
      }
    } else {
      const updated = localRecords.map(r =>
        r.id === recordId ? { ...r, period: trimmed } : r
      );
      saveLocalHistory(updated);
      setLocalRecords(updated);
      toast({ title: "Period label updated" });
    }
    setEditingId(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
  };

  const handleConfirmDelete = async (recordId: string) => {
    if (isAuthenticated) {
      try {
        await deleteRecord.mutateAsync({ id: recordId });
        invalidateHistory();
        toast({ title: "Record deleted" });
      } catch {
        toast({ title: "Delete failed", description: "Could not delete the record. Please try again.", variant: "destructive" });
      }
    } else {
      const updated = localRecords.filter(r => r.id !== recordId);
      saveLocalHistory(updated);
      setLocalRecords(updated);
      toast({ title: "Record deleted" });
    }
    setDeletingId(null);
    if (expandedId === recordId) setExpandedId(null);
  };

  const handleResetAll = async () => {
    if (isAuthenticated) {
      try {
        await deleteAll.mutateAsync();
        invalidateHistory();
        toast({ title: "All records deleted" });
      } catch {
        toast({ title: "Reset failed", description: "Could not delete all records. Please try again.", variant: "destructive" });
      }
    } else {
      saveLocalHistory([]);
      setLocalRecords([]);
      toast({ title: "All records deleted" });
    }
    setShowResetModal(false);
    setExpandedId(null);
  };

  if (isLoading && isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div
          className="animate-spin w-10 h-10 border-4 border-primary border-t-transparent rounded-full"
          role="status"
          aria-label="Loading"
        />
      </div>
    );
  }

  const records: AnyRecord[] = isAuthenticated
    ? (serverData?.records || [])
    : localRecords;

  const chartData = [...records].filter(r => r.impactResult?.totalValue != null).reverse().map(r => ({
    date: r.period || new Date(r.createdAt).toLocaleDateString("en-GB", { month: "short", year: "2-digit" }),
    fullDate: r.period || new Date(r.createdAt).toLocaleDateString("en-GB"),
    value: r.impactResult.totalValue,
  }));

  function inferPeriodType(label: string | null | undefined): string {
    if (!label) return "unknown";
    if (/academic year/i.test(label)) return "academic";
    const months = /January|February|March|April|May|June|July|August|September|October|November|December/i;
    if (months.test(label)) return "monthly";
    return "custom";
  }

  const latest = records[0];
  const previous = records[1];
  const sameType = latest && previous && inferPeriodType(latest.period) === inferPeriodType(previous.period);
  const changeVsLast = sameType && latest.impactResult?.totalValue != null && previous.impactResult?.totalValue != null
    ? latest.impactResult.totalValue - previous.impactResult.totalValue
    : null;
  const allTimeTotal = records.reduce((sum, r) => sum + (r.impactResult?.totalValue ?? 0), 0);

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-semibold text-foreground mb-1">My impact history</h1>
          <p className="text-sm text-muted-foreground">Watch your social value grow over time.</p>
        </div>
        {records.length > 0 && (
          <button
            onClick={() => setShowResetModal(true)}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-destructive/40 text-destructive text-xs font-medium hover:bg-destructive/5 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
            Reset all
          </button>
        )}
      </div>

      {records.length === 0 ? (
        <div className="bg-white border border-dashed border-border rounded-xl py-16 text-center">
          <TrendingUp className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" aria-hidden="true" />
          <p className="text-sm font-medium text-foreground mb-1">No records yet</p>
          <p className="text-xs text-muted-foreground mb-5">Complete the calculator and save a record to start tracking your impact.</p>
          <Link
            href="/wizard/actions"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-white text-xs font-medium hover:bg-primary/90 transition-colors"
          >
            Calculate my impact <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </Link>
        </div>
      ) : (
        <>
          {/* Summary stat */}
          {latest && (
            <motion.div
              className="grid grid-cols-2 gap-3 mb-6"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="bg-white border border-border rounded-xl p-5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">All-time total</p>
                <p className="text-2xl font-display font-bold text-foreground">{formatCurrency(allTimeTotal)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Across {records.length} {records.length === 1 ? "record" : "records"}
                </p>
              </div>
              <div className="bg-white border border-border rounded-xl p-5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">
                  {changeVsLast !== null ? "Change vs previous" : "Latest period"}
                </p>
                {changeVsLast !== null ? (
                  <>
                    <p className={`text-2xl font-display font-bold ${changeVsLast >= 0 ? "text-green-600" : "text-destructive"}`}>
                      {changeVsLast >= 0 ? "+" : ""}{formatCurrency(changeVsLast)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">{changeVsLast >= 0 ? "↑ Growing!" : "↓ Room to improve"}</p>
                  </>
                ) : (
                  <>
                    <p className="text-2xl font-display font-bold text-foreground">{formatCurrency(latest.impactResult?.totalValue ?? 0)}</p>
                    <p className="text-xs text-muted-foreground mt-1">{latest.period || new Date(latest.createdAt).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</p>
                  </>
                )}
              </div>
            </motion.div>
          )}

          {/* Chart */}
          <motion.div
            className="bg-white border border-border rounded-xl p-5 mb-6"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <figure className="m-0">
            <figcaption className="text-sm font-semibold text-foreground mb-4">Social value over time</figcaption>
            <div className="h-[240px] w-full" role="img" aria-label="Bar chart showing your social value per saved period">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="date"
                    axisLine={false} tickLine={false}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                    dy={8}
                  />
                  <YAxis
                    axisLine={false} tickLine={false}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                    tickFormatter={v => `£${(v / 1000).toFixed(1)}k`}
                  />
                  <RechartsTooltip
                    labelFormatter={(_, payload) => payload?.[0]?.payload?.fullDate || ""}
                    formatter={(value: number) => [formatCurrency(value), "Social Value"]}
                    contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", fontSize: 12 }}
                  />
                  <Bar dataKey="value" fill="#F06127" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            </figure>
          </motion.div>

          {/* Record list */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground mb-3">All records</h3>
            {records.map((record, i) => {
              const isOpen = expandedId === record.id;
              const isEditing = editingId === record.id;
              const isDeleting = deletingId === record.id;
              const activityCount = record.impactResult?.activityBreakdowns?.length ?? 0;
              return (
                <motion.div
                  key={record.id}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.07 }}
                  className="bg-white border border-border rounded-lg overflow-hidden transition-shadow hover:shadow-sm"
                  style={{ borderColor: isOpen ? "hsl(var(--primary) / 0.4)" : undefined }}
                >
                  {/* Header row */}
                  <div className="w-full flex items-center justify-between p-4 text-left">
                    <button
                      onClick={() => !isEditing && setExpandedId(isOpen ? null : record.id)}
                      className="flex items-center gap-3 flex-1 min-w-0 hover:bg-muted/10 -m-1 p-1 rounded-md transition-colors"
                    >
                      <div
                        className="w-8 h-8 rounded-md flex items-center justify-center shrink-0 transition-colors"
                        style={{ backgroundColor: isOpen ? "#F06127" : "hsl(var(--muted))" }}
                      >
                        <Calendar className="w-3.5 h-3.5" style={{ color: isOpen ? "white" : "hsl(var(--muted-foreground))" }} aria-hidden="true" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {isEditing ? (
                            <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                              <input
                                ref={editInputRef}
                                type="text"
                                value={editValue}
                                onChange={e => setEditValue(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === "Enter") handleSaveEdit(record.id);
                                  if (e.key === "Escape") handleCancelEdit();
                                }}
                                className="text-xs border border-primary/40 rounded px-2 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-primary/40 w-36"
                                aria-label="Edit period label"
                              />
                              <button
                                onClick={() => handleSaveEdit(record.id)}
                                className="p-1 rounded text-green-600 hover:bg-green-50 transition-colors"
                                aria-label="Save"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={handleCancelEdit}
                                className="p-1 rounded text-muted-foreground hover:bg-muted/20 transition-colors"
                                aria-label="Cancel"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <>
                              {record.period && (
                                <span
                                  className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full"
                                  style={{ backgroundColor: "#213547", color: "white" }}
                                >
                                  {record.period}
                                </span>
                              )}
                              {!record.period && (
                                <p className="text-sm font-semibold text-foreground">{record.name}</p>
                              )}
                            </>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {new Date(record.createdAt).toLocaleDateString("en-GB", {
                            weekday: "short", year: "numeric", month: "long", day: "numeric",
                          })}
                          {activityCount > 0 && (
                            <span className="ml-2 text-muted-foreground/60">· {activityCount} {activityCount === 1 ? "activity" : "activities"}</span>
                          )}
                        </p>
                      </div>
                    </button>

                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <p className="text-lg font-display font-bold text-foreground">
                        {formatCurrency(record.impactResult?.totalValue ?? 0)}
                      </p>

                      {/* Edit button */}
                      {!isEditing && !isDeleting && (
                        <button
                          onClick={() => handleStartEdit(record)}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-colors"
                          aria-label="Edit period label"
                        >
                          <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      )}

                      {/* Delete button / confirmation */}
                      {!isEditing && !isDeleting && (
                        <button
                          onClick={() => { setDeletingId(record.id); setExpandedId(null); }}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-colors"
                          aria-label="Delete record"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      )}

                      {!isEditing && (
                        <button
                          onClick={() => setExpandedId(isOpen ? null : record.id)}
                          className="p-1"
                          aria-label={isOpen ? "Collapse" : "Expand"}
                        >
                          {isOpen
                            ? <ChevronUp className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                            : <ChevronDown className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                          }
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Inline delete confirmation */}
                  <AnimatePresence initial={false}>
                    {isDeleting && (
                      <motion.div
                        key="delete-confirm"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.18, ease: "easeInOut" }}
                        style={{ overflow: "hidden" }}
                      >
                        <div className="flex items-center justify-between px-4 py-3 bg-destructive/5 border-t border-destructive/20">
                          <p className="text-xs text-destructive font-medium">Delete this record permanently?</p>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleConfirmDelete(record.id)}
                              className="px-3 py-1.5 rounded-md bg-destructive text-white text-xs font-medium hover:bg-destructive/90 transition-colors"
                            >
                              Delete
                            </button>
                            <button
                              onClick={() => setDeletingId(null)}
                              className="px-3 py-1.5 rounded-md border border-border text-xs font-medium hover:bg-muted/20 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Expandable detail */}
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        key="detail"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.22, ease: "easeInOut" }}
                        style={{ overflow: "hidden" }}
                      >
                        <RecordDetail result={record.impactResult} />
                        <div className="px-4 py-3 border-t border-border bg-muted/5 flex items-center justify-end gap-2 flex-wrap">
                          {record.impactResult && record.activities?.length > 0 && (
                            <button
                              onClick={() => {
                                const histRecord: HistoryRecord = {
                                  impactResult: record.impactResult,
                                  activities: record.activities,
                                  region: record.region ?? null,
                                  outwardCode: record.outwardCode ?? null,
                                  lat: record.lat ?? null,
                                  lng: record.lng ?? null,
                                };
                                loadFromRecord(histRecord);
                                navigate("/results");
                              }}
                              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border text-xs font-medium transition-all"
                              style={{ borderColor: "#213547", color: "#213547" }}
                            >
                              <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                              View full report
                            </button>
                          )}
                          <button
                            onClick={() => handleDownloadPdf(record.id, record.period || record.name)}
                            disabled={downloadingPdfId === record.id}
                            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border text-xs font-medium transition-all disabled:opacity-50"
                            style={{ borderColor: "#E8633A", color: "#E8633A" }}
                          >
                            <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                            {downloadingPdfId === record.id ? "Generating PDF…" : "Download Impact PDF"}
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        </>
      )}

      {/* Reset All Modal */}
      <AnimatePresence>
        {showResetModal && (
          <motion.div
            key="reset-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
            onClick={() => setShowResetModal(false)}
          >
            <motion.div
              key="reset-modal"
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.18 }}
              className="bg-white rounded-xl shadow-xl border border-border w-full max-w-sm mx-4 p-6"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5 text-destructive" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Reset all history?</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">This will permanently delete all your history.</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mb-5">
                All {records.length} {records.length === 1 ? "record" : "records"} will be removed and cannot be recovered.
              </p>
              <div className="flex items-center gap-2 justify-end">
                <button
                  onClick={() => setShowResetModal(false)}
                  className="px-4 py-2 rounded-md border border-border text-xs font-medium hover:bg-muted/20 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleResetAll}
                  disabled={deleteAll.isPending}
                  className="px-4 py-2 rounded-md bg-destructive text-white text-xs font-medium hover:bg-destructive/90 transition-colors disabled:opacity-60"
                >
                  {deleteAll.isPending ? "Deleting…" : "Delete all records"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
