import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Download, FileSpreadsheet, FileText, EyeOff, AlertCircle, CheckCircle2,
} from "lucide-react";
import {
  DEMO_ORG_ID, DEMO_ACTIVITIES,
  computeDemoAggregates, computeMonthlyTrend, computeSdgBreakdown,
  getRemovedMemberIds,
} from "@/lib/org-demo-mock";
import {
  useMyOrg, memberLabel, downloadCsv, activityExportRows, sdgExportRows, buildOrgPdf,
  buildOrgPdfBlobAsync,
} from "@/lib/org-export";
import { PdfPager } from "@/components/PdfPager";

export default function OrgExport() {
  const { data: orgData, isLoading, isError } = useMyOrg();
  const [, setLocation] = useLocation();

  const [anonymise, setAnonymise] = useState(true);
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  const isManager = orgData?.org?.role === "manager";
  const isDemoOrg = orgData?.org?.id === DEMO_ORG_ID;

  useEffect(() => {
    if (orgData?.org && isManager && !isDemoOrg) {
      setLocation("/org", { replace: true });
    }
  }, [orgData?.org, isManager, isDemoOrg, setLocation]);

  const removedIds = useMemo(
    () => isDemoOrg ? new Set(getRemovedMemberIds(DEMO_ORG_ID)) : new Set<string>(),
    [isDemoOrg],
  );
  const filtered = useMemo(() => {
    return DEMO_ACTIVITIES.filter(a => {
      if (removedIds.has(a.memberId)) return false;
      if (from && a.occurredAt < from) return false;
      if (to && a.occurredAt > to) return false;
      return true;
    }).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  }, [removedIds, from, to]);

  const aggregates = useMemo(() => computeDemoAggregates(filtered), [filtered]);
  const trend = useMemo(() => computeMonthlyTrend(filtered), [filtered]);
  const sdgs = useMemo(() => computeSdgBreakdown(filtered), [filtered]);

  if (isLoading) {
    return <div className="max-w-5xl mx-auto px-4 py-16 flex justify-center">
      <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>;
  }
  if (isError) {
    return <div className="max-w-2xl mx-auto px-4 py-16 text-center">
      <AlertCircle className="w-6 h-6 text-red-500 mx-auto mb-2" />
      <p className="text-base font-semibold">Could not load your organisation</p>
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
    </div>;
  }
  if (!isDemoOrg) {
    return <div className="max-w-2xl mx-auto px-4 py-16 flex justify-center">
      <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>;
  }

  const orgName = orgData.org.name;
  const slug = orgName.replace(/\s+/g, "-").toLowerCase();

  function rangeSummary(): string {
    const bits: string[] = [];
    if (from) bits.push(`From: ${from}`);
    if (to) bits.push(`To: ${to}`);
    if (anonymise) bits.push("Anonymised");
    return bits.join(" · ");
  }

  function handleCsvActivity() {
    if (filtered.length === 0) return;
    downloadCsv(activityExportRows(filtered, anonymise), `${slug}-activity.csv`);
  }
  function handleCsvSdg() {
    if (sdgs.length === 0) return;
    downloadCsv(sdgExportRows(sdgs), `${slug}-sdg-breakdown.csv`);
  }
  const pdfArgs = useMemo(() => {
    if (!orgData?.org) return null;
    const rowsForPdf = filtered.map(a => ({ activity: a, member: memberLabel(a.memberId, anonymise) }));
    const highlights = [...rowsForPdf]
      .sort((a, b) => b.activity.socialValueGBP - a.activity.socialValueGBP)
      .slice(0, 5);
    return {
      orgName,
      rowsForPdf,
      totals: {
        value: aggregates.totalSocialValue,
        hours: aggregates.totalHours,
        activities: aggregates.totalActivities,
      },
      trend,
      rangeSummary: rangeSummary(),
      highlights,
      sdgs,
      branding: orgData.org.branding ?? null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgData?.org, orgName, filtered, anonymise, aggregates, trend, sdgs, from, to]);

  function handlePdf() {
    if (!pdfArgs || filtered.length === 0) return;
    buildOrgPdf(
      pdfArgs.orgName,
      pdfArgs.rowsForPdf,
      pdfArgs.totals,
      pdfArgs.trend,
      pdfArgs.rangeSummary,
      pdfArgs.highlights,
      pdfArgs.sdgs,
      pdfArgs.branding,
    );
  }

  // ----- Live preview --------------------------------------------------------
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const previewSeq = useRef(0);

  useEffect(() => {
    if (!pdfArgs) return;
    if (filtered.length === 0) {
      setPreviewUrl(prev => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setPreviewError(null);
      setPreviewLoading(false);
      return;
    }
    const mySeq = ++previewSeq.current;
    setPreviewLoading(true);
    setPreviewError(null);
    const handle = window.setTimeout(async () => {
      try {
        const blob = await buildOrgPdfBlobAsync({
          orgName: pdfArgs.orgName,
          rows: pdfArgs.rowsForPdf,
          totals: pdfArgs.totals,
          monthlyTrend: pdfArgs.trend,
          filterSummary: pdfArgs.rangeSummary,
          highlights: pdfArgs.highlights,
          sdgs: pdfArgs.sdgs,
          branding: pdfArgs.branding,
        });
        if (mySeq !== previewSeq.current) return;
        if (!(blob instanceof Blob)) {
          setPreviewError("Could not build preview");
          setPreviewLoading(false);
          return;
        }
        const url = URL.createObjectURL(blob);
        setPreviewUrl(prev => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
        setPreviewLoading(false);
      } catch {
        if (mySeq !== previewSeq.current) return;
        setPreviewError("Could not build preview");
        setPreviewLoading(false);
      }
    }, 250);
    return () => window.clearTimeout(handle);
  }, [pdfArgs, filtered.length]);

  const previewUrlRef = useRef<string | null>(null);
  useEffect(() => {
    previewUrlRef.current = previewUrl;
  }, [previewUrl]);
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8" data-testid="org-export-root">
      <div className="flex items-center gap-2 mb-1">
        <Download className="w-5 h-5 text-primary" />
        <h1 className="text-2xl font-display font-semibold text-foreground">Export</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-5">
        Download a polished impact report (PDF) or raw activity data (CSV) for your funders, board or comms team.
      </p>


      {/* Options */}
      <div className="bg-white border border-border rounded-xl p-5 mb-6">
        <h3 className="text-sm font-semibold text-foreground mb-3">Options</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">From</label>
            <input
              type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="w-full px-2 py-1.5 rounded-md border border-border text-xs"
              data-testid="export-from"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">To</label>
            <input
              type="date" value={to} onChange={e => setTo(e.target.value)}
              className="w-full px-2 py-1.5 rounded-md border border-border text-xs"
              data-testid="export-to"
            />
          </div>
          <div className="flex items-end">
            <label className="inline-flex items-center gap-1.5 text-xs text-foreground cursor-pointer select-none py-1.5">
              <input
                type="checkbox"
                checked={anonymise}
                onChange={e => setAnonymise(e.target.checked)}
                className="rounded border-border"
                data-testid="export-anonymise"
              />
              <EyeOff className="w-3 h-3" /> Anonymise members
            </label>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1.5">
          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
          {filtered.length} {filtered.length === 1 ? "activity" : "activities"} included
          {anonymise ? " · names will be replaced with Member 001, 002, …" : " · names and emails will be included"}
        </p>
      </div>

      {/* Live preview */}
      <div className="bg-white border border-border rounded-xl p-5 mb-6" data-testid="export-preview-card">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Live preview</h3>
            <p className="text-[11px] text-muted-foreground">
              Updates automatically when you change the date range, anonymisation or branding.
            </p>
          </div>
          {previewLoading && (
            <div
              className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
              data-testid="export-preview-loading"
            >
              <div className="animate-spin w-3 h-3 border-2 border-primary border-t-transparent rounded-full" />
              Updating…
            </div>
          )}
        </div>
        <div className="relative w-full" style={{ minHeight: 520 }}>
          {previewError ? (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-red-600">
              {previewError}
            </div>
          ) : filtered.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
              No activities in this range — adjust the filters above to see a preview.
            </div>
          ) : previewUrl ? (
            <PdfPager src={previewUrl} height={500} />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" />
            </div>
          )}
        </div>
      </div>

      {/* Download cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-white border border-border rounded-xl p-5">
          <FileText className="w-5 h-5 text-primary mb-2" />
          <h4 className="text-sm font-semibold text-foreground mb-1">Impact PDF</h4>
          <p className="text-xs text-muted-foreground mb-4">
            A funder-ready report with summary stats, monthly trend, top SDGs, highlights and full activity table.
          </p>
          <button
            onClick={handlePdf}
            disabled={filtered.length === 0}
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
            data-testid="button-export-pdf"
          >
            <FileText className="w-3.5 h-3.5" /> Download PDF
          </button>
        </div>

        <div className="bg-white border border-border rounded-xl p-5">
          <FileSpreadsheet className="w-5 h-5 text-primary mb-2" />
          <h4 className="text-sm font-semibold text-foreground mb-1">Activity CSV</h4>
          <p className="text-xs text-muted-foreground mb-4">
            Every activity in the chosen range as a spreadsheet row, including hours, social value and SDG.
          </p>
          <button
            onClick={handleCsvActivity}
            disabled={filtered.length === 0}
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-border text-xs font-semibold hover:bg-muted/30 transition-colors disabled:opacity-50"
            data-testid="button-export-csv-activity"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" /> Download CSV
          </button>
        </div>

        <div className="bg-white border border-border rounded-xl p-5">
          <FileSpreadsheet className="w-5 h-5 text-primary mb-2" />
          <h4 className="text-sm font-semibold text-foreground mb-1">SDG breakdown CSV</h4>
          <p className="text-xs text-muted-foreground mb-4">
            One row per Sustainable Development Goal, with social value, hours, members and activities.
          </p>
          <button
            onClick={handleCsvSdg}
            disabled={sdgs.length === 0}
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-border text-xs font-semibold hover:bg-muted/30 transition-colors disabled:opacity-50"
            data-testid="button-export-csv-sdg"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" /> Download CSV
          </button>
        </div>
      </div>
    </div>
  );
}
