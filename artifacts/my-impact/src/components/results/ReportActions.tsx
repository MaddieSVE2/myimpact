import { useState } from "react";
import { Link } from "wouter";
import { ArrowRight, BookOpen, Download, FileText, Linkedin, Share2, Twitter } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { paintResultsShareCard } from "@/lib/share-cards";
import { ANALYTICS_EVENTS, track } from "@/lib/analytics";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const LOGO_SRC = `${BASE}/images/myimpact.png`;
const SHARE_URL = "https://myimpact.uk";

/** The figures a report is made from: one entry, or a whole year. */
export interface ReportResult {
  totalValue: number;
  impactValue: number;
  contributionValue: number;
  donationsValue: number;
  personalDevelopmentValue: number;
}

async function loadLogoDataUrl(src: string): Promise<string | undefined> {
  try {
    const res = await fetch(src);
    if (!res.ok) return undefined;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return undefined;
  }
}

function download(href: string, name: string) {
  const link = document.createElement("a");
  link.href = href;
  link.download = name;
  link.click();
}

/**
 * Download PDF, PNG, Share, Journal and "Get personalised ideas" for a
 * report: the results bar after a calculation, and the year-so-far actions
 * on /impact and History.
 */
export function ReportActions({
  result,
  shareText,
  fileStem,
  coveredPeriod,
  source,
  menuOpensUp = false,
  className = "",
}: {
  result: ReportResult;
  shareText: string;
  /** File names: `${fileStem}.pdf` and `${fileStem}.png`. */
  fileStem: string;
  /** Printed on the PDF cover, e.g. "2026 so far". */
  coveredPeriod?: string;
  /** For analytics. */
  source: "results" | "impact" | "history";
  /** The share menu opens upwards (for a bar fixed to the bottom). */
  menuOpensUp?: boolean;
  className?: string;
}) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const paintCard = async () =>
    paintResultsShareCard({
      totalValue: result.totalValue,
      impactValue: result.impactValue,
      contributionValue: result.contributionValue,
      donationsValue: result.donationsValue,
      personalDevelopmentValue: result.personalDevelopmentValue,
      logoSrc: await loadLogoDataUrl(LOGO_SRC),
    });

  const handleDownloadPdf = async () => {
    setExportingPdf(true);
    try {
      const res = await fetch(`${BASE}/api/impact/pdf`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          impactResult: result,
          name: user?.email ?? "My Impact",
          date: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
          ...(coveredPeriod ? { coveredPeriod } : {}),
        }),
      });
      if (!res.ok) throw new Error("Server error");
      const url = URL.createObjectURL(await res.blob());
      download(url, `${fileStem}.pdf`);
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "PDF export failed", description: "Could not generate the PDF. Please try again.", variant: "destructive" });
    } finally {
      setExportingPdf(false);
    }
  };

  const handleExportPNG = async () => {
    setExporting(true);
    try {
      download((await paintCard()).toDataURL("image/png"), `${fileStem}.png`);
    } catch {
      toast({ title: "Export failed", description: "Could not generate the image.", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const handleNativeShare = async () => {
    const hasNative = typeof navigator !== "undefined" && typeof navigator.share === "function";
    track(ANALYTICS_EVENTS.SHARE_CLICK, { source, channel: hasNative ? "native" : "menu" });
    if (!hasNative) {
      setShareOpen((o) => !o);
      return;
    }
    // Share the branded report card image when the platform supports file
    // sharing — far more useful than a bare link to the homepage.
    try {
      const blob = await new Promise<Blob | null>(async (resolve) => (await paintCard()).toBlob(resolve, "image/png"));
      if (blob) {
        const file = new File([blob], `${fileStem}.png`, { type: "image/png" });
        if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: "My Impact", text: `${shareText} ${SHARE_URL}` });
          return;
        }
      }
    } catch (err) {
      // AbortError means the user dismissed the share sheet — stop quietly.
      if (err instanceof DOMException && err.name === "AbortError") return;
    }
    try {
      await navigator.share({ title: "My Impact", text: shareText, url: SHARE_URL });
    } catch {
      // user cancelled — nothing to do
    }
  };

  const trackShare = (channel: "twitter" | "linkedin") => track(ANALYTICS_EVENTS.SHARE_CLICK, { source, channel });

  return (
    <div className={`flex items-center gap-2.5 flex-wrap ${className}`} data-testid={`report-actions-${source}`}>
      <button
        type="button"
        onClick={handleDownloadPdf}
        disabled={exportingPdf}
        className="flex items-center justify-center gap-1.5 px-3.5 py-3 min-h-[44px] rounded-lg border text-sm font-medium transition-all disabled:opacity-50 shrink-0"
        style={{ borderColor: "var(--brand-orange)", color: "var(--brand-orange)" }}
      >
        <FileText className="w-3.5 h-3.5" aria-hidden="true" />
        {exportingPdf ? "Generating…" : "Download PDF"}
      </button>
      <button
        type="button"
        onClick={handleExportPNG}
        disabled={exporting}
        className="flex items-center justify-center gap-1.5 px-3.5 py-3 min-h-[44px] rounded-lg border border-border text-sm font-medium text-foreground hover:border-foreground/40 hover:bg-muted/30 transition-all disabled:opacity-50 shrink-0"
      >
        <Download className="w-3.5 h-3.5" aria-hidden="true" />
        {exporting ? "Exporting…" : "PNG"}
      </button>

      <div className="relative shrink-0">
        <button
          type="button"
          onClick={handleNativeShare}
          aria-expanded={shareOpen}
          className="flex items-center justify-center gap-1.5 px-3.5 py-3 min-h-[44px] rounded-lg border border-border text-sm font-medium text-foreground hover:border-foreground/40 hover:bg-muted/30 transition-all"
        >
          <Share2 className="w-3.5 h-3.5" aria-hidden="true" /> Share
        </button>
        {shareOpen && (
          <div className={`absolute ${menuOpensUp ? "bottom-full mb-2" : "top-full mt-2"} left-0 bg-white border border-border rounded-lg shadow-lg py-1 min-w-[160px] z-50`}>
            <a
              href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(SHARE_URL)}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackShare("twitter")}
              className="flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-muted transition-colors"
            >
              <Twitter className="w-3.5 h-3.5 text-sky-500" aria-hidden="true" /> Share on X
            </a>
            <a
              href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(SHARE_URL)}&summary=${encodeURIComponent(shareText)}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackShare("linkedin")}
              className="flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-muted transition-colors"
            >
              <Linkedin className="w-3.5 h-3.5 text-blue-600" aria-hidden="true" /> Share on LinkedIn
            </a>
          </div>
        )}
      </div>

      <Link
        href="/journal"
        className="flex items-center justify-center gap-1.5 px-3.5 py-3 min-h-[44px] rounded-lg border border-border text-sm font-medium text-foreground hover:border-foreground/40 hover:bg-muted/30 transition-all shrink-0"
      >
        <BookOpen className="w-3.5 h-3.5" aria-hidden="true" /> Journal
      </Link>

      <Link
        href="/suggestions"
        className="flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] rounded-lg text-sm font-bold text-white whitespace-nowrap transition-all hover:-translate-y-px"
        style={{ background: "var(--brand-orange-bright)", boxShadow: "0 2px 12px color-mix(in srgb, var(--brand-orange-bright) 25%, transparent)" }}
      >
        Get personalised ideas <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
      </Link>
    </div>
  );
}
