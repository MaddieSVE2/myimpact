import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import {
  Building2, ArrowLeft, Check, Loader2, ShieldCheck, AlertCircle, Camera, Trash2, CalendarRange, MapPin,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useGetActivities } from "@workspace/api-client-react";
import { useMyOrg } from "@/lib/org-export";
import { useAuth } from "@/lib/auth-context";

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

// Must match the server's attachment limits (api-server/src/routes/attachments.ts).
const EVIDENCE_MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const EVIDENCE_ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif",
]);
const EVIDENCE_ACCEPT = "image/jpeg,image/jpg,image/png,image/webp,image/gif,image/heic,image/heif";

interface HistoryRecord {
  id: string;
  name: string;
  period: string | null;
  entryDate: string;
  source: string;
  kind: string | null;
  location: unknown;
  reportStartDate: string | null;
  reportEndDate: string | null;
  reportPeriodType: string | null;
  activities: Array<{ activityId?: string; quantity?: number; hoursPerYear?: number; title?: string | null; detail?: string | null }> | null;
}

function useHistoryRecord(recordId: number | null) {
  return useQuery<HistoryRecord | null>({
    queryKey: ["share-report-record", recordId],
    enabled: recordId != null,
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/impact/history`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load your report.");
      const data = await res.json();
      const records: HistoryRecord[] = data?.records ?? data?.history ?? [];
      return records.find(r => String(r.id) === String(recordId)) ?? null;
    },
  });
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function locationLabel(loc: unknown): string | null {
  if (!loc || typeof loc !== "object") return null;
  const l = loc as Record<string, unknown>;
  const town = typeof l.townCity === "string" && l.townCity.trim() ? l.townCity.trim() : null;
  const postcode = typeof l.postcode === "string" && l.postcode.trim() ? l.postcode.trim() : null;
  if (town && postcode) return `${town} (${postcode})`;
  return town ?? postcode ?? null;
}

/**
 * "Review & share" — share activities from a saved Full Impact Report with
 * the member's explicit-submission organisation without re-entering anything.
 * Quantities, hours, values, period and location come straight from the
 * saved report (and are copied server-side); the member only chooses WHICH
 * activities to share and supplies genuinely missing organisation fields
 * (evidence when the org's policy demands it, an optional note).
 */
export default function OrgShareReport() {
  const [, params] = useRoute("/org/share-report/:recordId");
  const [, navigate] = useLocation();
  const recordId = params?.recordId ? parseInt(params.recordId, 10) : NaN;
  const validId = Number.isFinite(recordId) && recordId > 0 ? recordId : null;

  const { user, isLoading: authLoading } = useAuth();
  const { data: orgData, isLoading: orgLoading } = useMyOrg();
  const { data: report, isLoading: reportLoading, error: reportError } = useHistoryRecord(validId);
  const { data: activitiesData } = useGetActivities();
  const catalogue = useMemo(
    () => new Map((activitiesData?.activities ?? []).map(a => [a.id, a])),
    [activitiesData],
  );

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [initialised, setInitialised] = useState(false);
  const [note, setNote] = useState("");
  const [evidence, setEvidence] = useState<Array<{ id: number; name: string }>>([]);
  const [evidenceUploading, setEvidenceUploading] = useState(false);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState<{ recordId: number; status: "pending" | "approved" } | null>(null);

  // Shareable lines: standard catalogue activities present in the report.
  const shareableLines = useMemo(() => {
    const lines = Array.isArray(report?.activities) ? report!.activities! : [];
    return lines
      .filter(l => typeof l.activityId === "string" && l.activityId && l.activityId !== "something_else" && catalogue.has(l.activityId))
      .map(l => {
        const def = catalogue.get(l.activityId as string)!;
        const hours = typeof l.hoursPerYear === "number" ? l.hoursPerYear : 0;
        const quantity = typeof l.quantity === "number" ? l.quantity : 0;
        const isHourBased = def.unit === "hour" || def.unit === "hour_per_week";
        const formulaQty = isHourBased ? hours : quantity;
        const value = Math.round(formulaQty * (def.valuePerUnit ?? 0) * 100) / 100;
        return {
          activityId: l.activityId as string,
          name: def.name,
          category: def.category,
          unitLabel: def.unitLabel ?? "hrs",
          quantity,
          hours,
          value,
          detail: typeof l.detail === "string" ? l.detail : null,
        };
      });
  }, [report, catalogue]);

  // Default to everything selected once the report loads.
  useEffect(() => {
    if (!initialised && shareableLines.length > 0) {
      setSelected(new Set(shareableLines.map(l => l.activityId)));
      setInitialised(true);
    }
  }, [shareableLines, initialised]);

  if (authLoading || orgLoading || (validId != null && reportLoading)) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 flex justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-base font-semibold mb-2">Please log in to share your report with your organisation.</p>
        <Link href="/login" className="text-primary underline">Log in</Link>
      </div>
    );
  }

  const org = orgData?.org;
  if (!org) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-base font-semibold mb-2">You're not connected to an organisation yet.</p>
        <Link href="/org" className="text-primary underline">Go to the organisation portal</Link>
      </div>
    );
  }

  if (validId == null || (!reportLoading && !report) || reportError) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center" data-testid="share-report-not-found">
        <p className="text-base font-semibold mb-2">We couldn't find that report.</p>
        <p className="text-sm text-muted-foreground mb-4">It may have been deleted, or the link is out of date.</p>
        <Link href="/history" className="text-primary underline">Back to your impact</Link>
      </div>
    );
  }

  const evidencePolicy = org.evidencePolicy ?? "optional";
  const periodStart = report!.reportStartDate;
  const periodEnd = report!.reportEndDate;
  const locLabel = locationLabel(report!.location);
  const selectedLines = shareableLines.filter(l => selected.has(l.activityId));
  const totalValue = selectedLines.reduce((s, l) => s + l.value, 0);
  const totalHours = selectedLines.reduce((s, l) => s + l.hours, 0);
  const allSelected = shareableLines.length > 0 && selected.size === shareableLines.length;
  const evidenceMissing = evidencePolicy === "required" && evidence.length === 0;

  async function uploadEvidence(file: File) {
    setEvidenceError(null);
    if (file.size > EVIDENCE_MAX_FILE_BYTES) {
      setEvidenceError(`"${file.name}" is too big. Photos must be 10 MB or smaller.`);
      return;
    }
    if (!EVIDENCE_ALLOWED_IMAGE_TYPES.has(file.type.toLowerCase())) {
      setEvidenceError(`"${file.name}" isn't a supported photo type. Please use a JPEG, PNG, WebP, GIF, HEIC or HEIF image.`);
      return;
    }
    setEvidenceUploading(true);
    try {
      const urlRes = await fetch(`${BASE}/api/attachments/upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ mimeType: file.type, byteSize: file.size, kind: "photo", purpose: "org-evidence" }),
      });
      const urlData = await urlRes.json().catch(() => ({}));
      if (!urlRes.ok) throw new Error((urlData as { error?: string }).error ?? "Could not start the upload.");
      const { uploadUrl, storageKey } = urlData as { uploadUrl: string; storageKey: string };
      const putRes = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!putRes.ok) throw new Error("Upload failed. Please try again.");
      const regRes = await fetch(`${BASE}/api/attachments/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ storageKey, kind: "photo", purpose: "org-evidence" }),
      });
      const regData = await regRes.json().catch(() => ({}));
      if (!regRes.ok) throw new Error((regData as { error?: string }).error ?? "Could not save the photo.");
      const id = parseInt(String((regData as { id?: string }).id), 10);
      if (!Number.isFinite(id)) throw new Error("Could not save the photo.");
      setEvidence(prev => [...prev, { id, name: file.name }]);
    } catch (err) {
      setEvidenceError((err as Error).message);
    } finally {
      setEvidenceUploading(false);
    }
  }

  async function submit() {
    if (selectedLines.length === 0 || evidenceMissing || submitting) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${BASE}/api/org/member-submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          sourceReportId: validId,
          evidenceAttachmentIds: evidence.map(e => e.id),
          ...(note.trim() ? { note: note.trim() } : {}),
          activities: selectedLines.map(l => ({ activityId: l.activityId })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if ((data as { code?: string }).code === "already_shared") {
          throw new Error(`You've already shared activities from this report with ${org!.name}. Withdraw that submission first if you want to change it.`);
        }
        throw new Error((data as { error?: string }).error ?? "Sharing failed.");
      }
      setDone({
        recordId: data?.record?.id,
        status: data?.record?.verificationStatus === "pending" ? "pending" : "approved",
      });
    } catch (err) {
      setSubmitError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center" data-testid="share-report-done">
        <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
          <Check className="w-6 h-6 text-green-600" />
        </div>
        <h1 className="text-xl font-display font-semibold text-foreground mb-2">Shared with {org.name}</h1>
        <p className="text-sm text-muted-foreground mb-1">
          {selectedLines.length} {selectedLines.length === 1 ? "activity" : "activities"} from your report
          {periodStart && periodEnd ? ` (${formatDate(periodStart)} – ${formatDate(periodEnd)})` : ""} were shared.
        </p>
        <p className="text-sm text-muted-foreground mb-6" data-testid="share-report-done-status">
          {done.status === "pending"
            ? `They're awaiting review by a manager at ${org.name}.`
            : `${org.name} accepts member submissions automatically, so they already count towards its totals.`}
        </p>
        <div className="flex items-center justify-center gap-4 text-sm">
          <Link href="/org/submit/history" className="text-primary underline" data-testid="share-report-view-submissions">View my submissions</Link>
          <Link href="/history" className="text-primary underline">Back to your impact</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8" data-testid="share-report-root">
      <button
        type="button"
        onClick={() => window.history.length > 1 ? window.history.back() : navigate("/history")}
        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground mb-4"
        data-testid="share-report-back"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back
      </button>

      <div className="flex items-start gap-3 mb-2">
        <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
          <Building2 className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-display font-semibold text-foreground">Review &amp; share with {org.name}</h1>
          <p className="text-sm text-muted-foreground">
            {report!.kind === "quick_log"
              ? "These activities come straight from what you logged — nothing to re-enter. Untick anything you don't want to share."
              : "These activities come straight from your report — nothing to re-enter. Untick anything you don't want to share."}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground mb-5" data-testid="share-report-period">
        {periodStart && periodEnd ? (
          <span className="inline-flex items-center gap-1">
            <CalendarRange className="w-3.5 h-3.5" />
            Reporting period: {formatDate(periodStart)} – {formatDate(periodEnd)}
          </span>
        ) : report!.kind === "quick_log" && report!.entryDate ? (
          <span className="inline-flex items-center gap-1">
            <CalendarRange className="w-3.5 h-3.5" />
            Activity date: {formatDate(report!.entryDate.slice(0, 10))}
          </span>
        ) : null}
        {locLabel && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5" /> {locLabel}
          </span>
        )}
      </div>

      {shareableLines.length === 0 ? (
        <div className="bg-white border border-border rounded-xl p-6 text-center" data-testid="share-report-empty">
          <p className="text-sm font-semibold text-foreground mb-1">This report has no shareable activities.</p>
          <p className="text-xs text-muted-foreground mb-4">
            Only standard activities can be shared with your organisation. Custom activities and donations stay in your personal report.
          </p>
          <Link href="/history" className="text-primary underline text-sm">Back to your impact</Link>
        </div>
      ) : (
        <>
          <div className="bg-white border border-border rounded-xl overflow-hidden mb-4" data-testid="share-report-checklist">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/20">
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(shareableLines.map(l => l.activityId)))}
                  data-testid="share-report-select-all"
                />
                Select all ({shareableLines.length})
              </label>
              <span className="text-xs text-muted-foreground" data-testid="share-report-selection-summary">
                {selectedLines.length} selected · {Math.round(totalHours)} hrs · £{totalValue.toLocaleString("en-GB", { maximumFractionDigits: 0 })}
              </span>
            </div>
            <ul className="divide-y divide-border">
              {shareableLines.map(l => (
                <li key={l.activityId} className="px-4 py-3" data-testid={`share-report-line-${l.activityId}`}>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={selected.has(l.activityId)}
                      onChange={() => setSelected(prev => {
                        const next = new Set(prev);
                        if (next.has(l.activityId)) next.delete(l.activityId); else next.add(l.activityId);
                        return next;
                      })}
                      data-testid={`share-report-check-${l.activityId}`}
                    />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium text-foreground">{l.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {l.category} · {l.hours > 0 ? `${l.hours} hrs` : `${l.quantity} ${l.unitLabel}`} · £{l.value.toLocaleString("en-GB", { maximumFractionDigits: 0 })} social value
                      </span>
                      {l.detail && <span className="block text-xs text-muted-foreground italic mt-0.5">{l.detail}</span>}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>

          {evidencePolicy !== "not_required" && (
            <div className="bg-white border border-border rounded-xl p-5 mb-4" data-testid="share-report-evidence">
              <div className="flex items-center gap-2 mb-1">
                <ShieldCheck className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">
                  Evidence {evidencePolicy === "required" ? "(required)" : "(optional)"}
                </h3>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                {evidencePolicy === "required"
                  ? `${org.name} requires a photo of evidence with every submission.`
                  : `Add a photo if you'd like — ${org.name} doesn't require one.`}
              </p>
              {evidence.length > 0 && (
                <ul className="flex flex-wrap gap-2 mb-3">
                  {evidence.map(ev => (
                    <li key={ev.id} className="flex items-center gap-2 text-xs bg-muted/30 border border-border rounded-md px-2.5 py-1.5" data-testid={`share-report-evidence-item-${ev.id}`}>
                      <Camera className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="max-w-[180px] truncate">{ev.name}</span>
                      <button
                        type="button"
                        aria-label="Remove evidence"
                        onClick={() => setEvidence(prev => prev.filter(e => e.id !== ev.id))}
                        data-testid={`share-report-evidence-remove-${ev.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {evidence.length < 4 && (
                <label className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold cursor-pointer transition-colors ${evidenceUploading ? "opacity-60 pointer-events-none" : ""} border-border hover:bg-muted/30 text-foreground`}>
                  {evidenceUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
                  {evidenceUploading ? "Uploading…" : evidence.length > 0 ? "Add another photo" : "Add a photo"}
                  <input
                    type="file"
                    accept={EVIDENCE_ACCEPT}
                    className="hidden"
                    disabled={evidenceUploading}
                    data-testid="share-report-evidence-input"
                    onChange={e => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) uploadEvidence(f);
                    }}
                  />
                </label>
              )}
              {evidenceError && <p className="text-xs text-red-600 mt-2" data-testid="share-report-evidence-error">{evidenceError}</p>}
            </div>
          )}

          <div className="bg-white border border-border rounded-xl p-5 mb-4" data-testid="share-report-note">
            <h3 className="text-sm font-semibold text-foreground mb-1">Note for {org.name} (optional)</h3>
            <p className="text-xs text-muted-foreground mb-2">Anything your organisation should know about these activities.</p>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value.slice(0, 500))}
              rows={2}
              className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background"
              placeholder="e.g. All hours were with the Riverside branch"
              data-testid="share-report-note-input"
            />
          </div>

          {submitError && (
            <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 mb-4" data-testid="share-report-error">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => navigate("/history")}
              className="text-sm font-medium text-muted-foreground hover:text-foreground"
              data-testid="share-report-cancel"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={submitting || selectedLines.length === 0 || evidenceMissing}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
              data-testid="share-report-submit"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Share {selectedLines.length} {selectedLines.length === 1 ? "activity" : "activities"}
            </button>
          </div>
          {evidenceMissing && (
            <p className="text-xs text-muted-foreground text-right mt-2" data-testid="share-report-evidence-required-hint">
              {org.name} requires evidence before you can share.
            </p>
          )}
        </>
      )}
    </div>
  );
}
