import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Building2, ArrowRight, ArrowLeft, Check, X, ShieldCheck, Loader2,
  AlertCircle, ExternalLink, Undo2,
} from "lucide-react";
import { useGetActivities, type ActivityItem, type SelectedActivity, type ImpactResult } from "@workspace/api-client-react";
import { useMyOrg } from "@/lib/org-export";
import { formatCurrency } from "@/lib/utils";

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

type Step = "prompt" | "summary" | "details" | "confirm" | "done";

interface LineDetail {
  title: string;
  detail: string;
}

interface ShareableLine {
  activityId: string;
  quantity: number;
  hoursPerYear: number;
  activityName: string;
  category: string;
  unit: string;
  unitLabel: string;
  estimatedValue: number;
}

function buildShareableLines(
  activities: SelectedActivity[],
  defs: Map<string, ActivityItem>,
  result: ImpactResult | null,
): ShareableLine[] {
  const valueById = new Map<string, number>();
  if (result?.activityBreakdowns) {
    for (const b of result.activityBreakdowns as Array<{ activityId: string; impactValue: number }>) {
      valueById.set(b.activityId, (valueById.get(b.activityId) ?? 0) + (b.impactValue ?? 0));
    }
  }
  const lines: ShareableLine[] = [];
  for (const a of activities) {
    const def = defs.get(a.activityId);
    if (!def) continue; // drops custom activities
    const isHourly = def.unit === "hour";
    const quantity = Number(a.quantity) || 0;
    const hoursPerYear = Number(a.hoursPerYear) || 0;
    if (isHourly ? hoursPerYear <= 0 : quantity <= 0) continue;
    const fallback = isHourly ? hoursPerYear * def.valuePerUnit : quantity * def.valuePerUnit;
    lines.push({
      activityId: a.activityId,
      quantity,
      hoursPerYear,
      activityName: def.name,
      category: def.category,
      unit: def.unit,
      unitLabel: def.unitLabel,
      estimatedValue: valueById.get(a.activityId) ?? fallback,
    });
  }
  return lines;
}

interface ShareWithOrgPromptProps {
  result: ImpactResult | null;
  activities: SelectedActivity[];
}

export function ShareWithOrgPrompt({ result, activities }: ShareWithOrgPromptProps) {
  const { data: orgData, isLoading: orgLoading } = useMyOrg();
  const { data: actsData, isLoading: actsLoading } = useGetActivities();

  const [step, setStep] = useState<Step>("prompt");
  const [dismissed, setDismissed] = useState(false);
  const [lineDetails, setLineDetails] = useState<Record<string, LineDetail>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittedRecordId, setSubmittedRecordId] = useState<number | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [withdrawn, setWithdrawn] = useState(false);

  // Reset state when the user runs a new calculation.
  useEffect(() => {
    setStep("prompt");
    setDismissed(false);
    setLineDetails({});
    setSubmitting(false);
    setSubmitError(null);
    setSubmittedRecordId(null);
    setWithdrawing(false);
    setWithdrawError(null);
    setWithdrawn(false);
  }, [result]);

  const defsById = useMemo(() => {
    const m = new Map<string, ActivityItem>();
    for (const a of actsData?.activities ?? []) m.set(a.id, a);
    return m;
  }, [actsData]);

  const shareableLines = useMemo(
    () => buildShareableLines(activities, defsById, result),
    [activities, defsById, result],
  );

  const totals = useMemo(() => {
    let value = 0;
    let hours = 0;
    for (const l of shareableLines) {
      value += l.estimatedValue;
      hours += l.hoursPerYear;
    }
    return { value, hours };
  }, [shareableLines]);

  if (orgLoading) return null;
  const org = orgData?.org;
  if (!org) return null;
  if (org.role === "manager") return null;
  if (!result) return null;
  if (dismissed) return null;

  // Success state ────────────────────────────────────────────────────────────
  if (step === "done" && submittedRecordId !== null) {
    return (
      <motion.div
        className="mb-4 bg-emerald-50 border border-emerald-200 rounded-xl p-4"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        data-testid="share-with-org-success"
      >
        {withdrawn ? (
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
              <Undo2 className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">Withdrawn from {org.name}</p>
              <p className="text-xs text-muted-foreground">
                Your submission was removed and your organisation's totals have been re-balanced.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3 flex-wrap">
            <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0">
              <Check className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">
                Shared with {org.name} ✓
              </p>
              <p className="text-xs text-muted-foreground">
                {Math.round(totals.hours).toLocaleString("en-GB")} hrs · {formatCurrency(totals.value)} added to your organisation's totals.
              </p>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <Link
                href="/org"
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                data-testid="share-with-org-view-link"
              >
                View in Org Portal <ExternalLink className="w-3 h-3" />
              </Link>
              <button
                type="button"
                onClick={async () => {
                  if (submittedRecordId == null) return;
                  setWithdrawing(true);
                  setWithdrawError(null);
                  try {
                    const res = await fetch(`${BASE}/api/org/member-submissions/${submittedRecordId}`, {
                      method: "DELETE",
                      credentials: "include",
                    });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) throw new Error((data as { error?: string }).error ?? "Failed to withdraw.");
                    setWithdrawn(true);
                  } catch (err) {
                    setWithdrawError((err as Error).message);
                  } finally {
                    setWithdrawing(false);
                  }
                }}
                disabled={withdrawing}
                className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-red-600 disabled:opacity-60"
                data-testid="share-with-org-withdraw"
              >
                {withdrawing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Undo2 className="w-3 h-3" />}
                {withdrawing ? "Withdrawing…" : "Withdraw"}
              </button>
            </div>
            {withdrawError && (
              <p className="text-xs text-red-600 w-full pl-11" data-testid="share-with-org-withdraw-error">{withdrawError}</p>
            )}
          </div>
        )}
      </motion.div>
    );
  }

  // Wait for activity definitions before deciding whether anything is shareable,
  // otherwise we'd briefly flash the empty state before lines resolve.
  if (actsLoading || !actsData) return null;

  // No standard activities: friendly explanation, no full flow.
  if (shareableLines.length === 0) {
    return (
      <motion.div
        className="mb-4 bg-muted/40 border border-border rounded-xl px-4 py-3"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        data-testid="share-with-org-empty"
      >
        <div className="flex items-start gap-3">
          <Building2 className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">
              Nothing here to share with {org.name} yet
            </p>
            <p className="text-xs text-muted-foreground">
              Only standard activities can be shared with your organisation. Custom activities and donations stay personal to you.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss"
            className="p-1 rounded text-muted-foreground hover:bg-muted/60"
            data-testid="share-with-org-empty-dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </motion.div>
    );
  }

  // Initial prompt ───────────────────────────────────────────────────────────
  if (step === "prompt") {
    return (
      <motion.div
        className="mb-4 bg-white border-2 border-primary/40 rounded-xl p-4 shadow-sm"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        data-testid="share-with-org-prompt"
      >
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Building2 className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-display font-semibold text-foreground">
              Share this with {org.name}?
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Add your {shareableLines.length} activit{shareableLines.length === 1 ? "y" : "ies"} ({Math.round(totals.hours).toLocaleString("en-GB")} hrs) to your organisation's totals.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Not now"
            className="p-1.5 rounded text-muted-foreground hover:bg-muted/40 shrink-0"
            data-testid="share-with-org-dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center gap-2 mt-3 ml-12">
          <button
            type="button"
            onClick={() => setStep("summary")}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors"
            data-testid="share-with-org-start"
          >
            Share <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
            data-testid="share-with-org-not-now"
          >
            Not now
          </button>
        </div>
      </motion.div>
    );
  }

  // Inline flow ──────────────────────────────────────────────────────────────
  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload = {
        name: `Shared from My Impact ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`,
        activities: shareableLines.map(l => {
          const det = lineDetails[l.activityId];
          return {
            activityId: l.activityId,
            quantity: l.quantity,
            hoursPerYear: l.hoursPerYear,
            title: det?.title?.trim() || null,
            detail: det?.detail?.trim() || null,
          };
        }),
      };
      const res = await fetch(`${BASE}/api/org/member-submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Submission failed.");
      const id = (data as { record?: { id?: number } }).record?.id ?? null;
      setSubmittedRecordId(id);
      setStep("done");
    } catch (err) {
      setSubmitError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <motion.div
      className="mb-4 bg-white border-2 border-primary/40 rounded-xl shadow-sm overflow-hidden"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      data-testid="share-with-org-flow"
    >
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-primary/5">
        <div className="flex items-center gap-2 min-w-0">
          <Building2 className="w-4 h-4 text-primary shrink-0" />
          <p className="text-xs font-semibold text-foreground truncate">
            Share with {org.name}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <p className="text-[11px] text-muted-foreground">
            Step {step === "summary" ? 1 : step === "details" ? 2 : 3} of 3
          </p>
          <button
            type="button"
            onClick={() => { setStep("prompt"); setDismissed(true); }}
            aria-label="Close"
            className="p-1 rounded text-muted-foreground hover:bg-muted/40"
            data-testid="share-with-org-close-flow"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {step === "summary" && (
          <motion.div
            key="summary"
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            className="p-4"
            data-testid="share-with-org-step-summary"
          >
            <p className="text-sm font-medium text-foreground mb-1">Here's what we'll share</p>
            <p className="text-xs text-muted-foreground mb-3">
              Just your activities, the hours/quantities, and the estimated social value. Nothing else.
            </p>
            <ul className="divide-y divide-border border border-border rounded-lg overflow-hidden mb-3">
              {shareableLines.map(l => (
                <li
                  key={l.activityId}
                  className="px-3 py-2 flex items-center gap-3 text-sm"
                  data-testid={`share-with-org-line-${l.activityId}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">{l.activityName}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {l.unit === "hour"
                        ? `${l.hoursPerYear} hrs/yr`
                        : `${l.quantity} ${l.unitLabel || "units"}`}
                    </p>
                  </div>
                  <p className="text-xs font-semibold tabular-nums">{formatCurrency(l.estimatedValue)}</p>
                </li>
              ))}
            </ul>
            <div className="bg-muted/40 border border-border rounded-lg px-3 py-2 mb-3 text-[11px] text-muted-foreground flex items-start gap-2">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" />
              <span>
                <strong className="text-foreground">Donations and journal entries are not shared.</strong>{" "}
                Custom activities are excluded too, only standard activities go to your organisation.
              </span>
            </div>
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStep("prompt")}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStep("confirm")}
                  className="text-xs font-medium text-muted-foreground hover:text-foreground px-3 py-2"
                  data-testid="share-with-org-skip-details"
                >
                  Skip
                </button>
                <button
                  type="button"
                  onClick={() => setStep("details")}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors"
                  data-testid="share-with-org-add-detail"
                >
                  Add a bit more detail <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {step === "details" && (
          <motion.div
            key="details"
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            className="p-4"
            data-testid="share-with-org-step-details"
          >
            <p className="text-sm font-medium text-foreground mb-1">Add a bit more detail (optional)</p>
            <p className="text-xs text-muted-foreground mb-3">
              Helps {org.name} see what each activity was. Skip any you don't need.
            </p>
            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
              {shareableLines.map(l => {
                const det = lineDetails[l.activityId] ?? { title: "", detail: "" };
                return (
                  <div
                    key={l.activityId}
                    className="border border-border rounded-lg p-3"
                    data-testid={`share-with-org-detail-${l.activityId}`}
                  >
                    <p className="text-sm font-semibold text-foreground mb-2">{l.activityName}</p>
                    <input
                      type="text"
                      value={det.title}
                      onChange={e => setLineDetails(p => ({ ...p, [l.activityId]: { ...det, title: e.target.value } }))}
                      maxLength={120}
                      placeholder="Short title (optional)"
                      className="bg-white w-full px-3 py-1.5 rounded-md border border-border text-sm focus:outline-none focus:border-primary mb-2"
                      data-testid={`share-with-org-title-${l.activityId}`}
                    />
                    <textarea
                      value={det.detail}
                      onChange={e => setLineDetails(p => ({ ...p, [l.activityId]: { ...det, detail: e.target.value } }))}
                      maxLength={500}
                      rows={2}
                      placeholder="A short note (optional)"
                      className="bg-white w-full px-3 py-1.5 rounded-md border border-border text-sm focus:outline-none focus:border-primary resize-y"
                      data-testid={`share-with-org-note-${l.activityId}`}
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-between mt-3">
              <button
                type="button"
                onClick={() => setStep("summary")}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </button>
              <button
                type="button"
                onClick={() => setStep("confirm")}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors"
                data-testid="share-with-org-to-confirm"
              >
                Review <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        )}

        {step === "confirm" && (
          <motion.div
            key="confirm"
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            className="p-4"
            data-testid="share-with-org-step-confirm"
          >
            <p className="text-sm font-medium text-foreground mb-1">Ready to share?</p>
            <p className="text-xs text-muted-foreground mb-3">
              {shareableLines.length} activit{shareableLines.length === 1 ? "y" : "ies"} · {Math.round(totals.hours).toLocaleString("en-GB")} hrs · {formatCurrency(totals.value)}
            </p>
            <p className="text-[11px] text-muted-foreground mb-3">
              You can withdraw the submission afterwards if you change your mind.
            </p>
            {submitError && (
              <div className="bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-3 text-xs text-red-700 flex items-start gap-2" data-testid="share-with-org-error">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>{submitError}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStep(Object.keys(lineDetails).length > 0 ? "details" : "summary")}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                disabled={submitting}
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
                data-testid="share-with-org-submit"
              >
                {submitting
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sharing…</>
                  : <><Check className="w-3.5 h-3.5" /> Share with {org.name}</>
                }
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
