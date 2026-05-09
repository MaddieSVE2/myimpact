import { useQuery } from "@tanstack/react-query";
import {
  DEMO_MEMBERS, getDemoMember, SDG_BY_CATEGORY,
  type DemoActivity, type SdgBreakdownPoint, computeMonthlyTrend,
} from "@/lib/org-demo-mock";
import {
  renderOrgPdf,
  type OrgBranding,
  type PreloadedLogo,
  type RenderOrgPdfArgs,
} from "@/lib/org-pdf-render";

export type { OrgBranding, PreloadedLogo, RenderOrgPdfArgs } from "@/lib/org-pdf-render";

export const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface SroiCostBreakdown {
  recruitment: number | null;
  onboarding: number | null;
  support: number | null;
  admin: number | null;
}

export interface MyOrgResponse {
  org: {
    id: string;
    name: string;
    type: string;
    role: string;
    aiSidekickEnabled?: boolean;
    sroiCostPerVolunteer?: number | null;
    sroiCostBreakdown?: SroiCostBreakdown;
    branding?: OrgBranding;
  } | null;
}

// Default SROI cost-per-volunteer used in the dashboard explainer when an
// organisation hasn't set its own per-volunteer cost in /org/settings.
export const DEFAULT_SROI_COST_PER_VOLUNTEER = 475;

export function useMyOrg() {
  return useQuery<MyOrgResponse>({
    queryKey: ["my-org"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/org/my`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });
}

export function hexToHslVar(hex: string | null | undefined): string | null {
  if (!hex) return null;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h *= 60;
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export function memberLabel(memberId: string, anon: boolean): { name: string; email: string } {
  if (anon) {
    const idx = DEMO_MEMBERS.findIndex(m => m.id === memberId);
    return { name: `Member ${String(idx + 1).padStart(3, "0")}`, email: "Not set" };
  }
  const m = getDemoMember(memberId);
  return { name: m?.name ?? memberId, email: m?.email ?? "" };
}

export function escapeCsv(v: string | number): string {
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function downloadCsv(
  rows: Array<Record<string, string | number>>,
  filename: string,
  // Optional comment lines (e.g. SROI assumptions) prepended above the header
  // row. Each entry is emitted as `# <text>` so spreadsheet apps still parse
  // the data, while funders reading the raw file see the assumption used.
  assumptions: string[] = [],
) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const lines: string[] = [];
  for (const a of assumptions) lines.push(`# ${a.replace(/\r?\n/g, " ")}`);
  lines.push(headers.join(","));
  for (const r of rows) lines.push(headers.map(h => escapeCsv(r[h] ?? "")).join(","));
  const csv = lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}

export function activityExportRows(
  activities: DemoActivity[],
  anonymise: boolean,
): Array<Record<string, string | number>> {
  return activities.map(a => {
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

export function sdgExportRows(sdgs: SdgBreakdownPoint[]): Array<Record<string, string | number>> {
  return sdgs.map(s => ({
    "SDG number": s.number,
    "SDG label": s.label,
    "Social value (GBP)": s.value,
    "Share (%)": s.pct,
    Hours: Math.round(s.hours * 10) / 10,
    Activities: s.activities,
    Members: s.members,
  }));
}

// Best-effort async loader: fetch a remote image (e.g. an org logo), convert
// it to a `data:` URL that jsPDF can consume via `addImage`, and read its
// natural pixel dimensions so the caller can preserve aspect ratio.
// Resolves to `null` on any failure (CORS, 404, unsupported format, timeout)
// so callers can fall back to a typographic lockup without throwing.
export async function loadLogoAsDataUrl(
  url: string,
  timeoutMs = 2500,
): Promise<PreloadedLogo | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, { signal: ctrl.signal, credentials: "omit", mode: "cors" });
    clearTimeout(timer);
    if (!res.ok) return null;
    const blob = await res.blob();
    const ct = (blob.type || "").toLowerCase();
    const lowerUrl = url.toLowerCase();
    let format: "PNG" | "JPEG" | null = null;
    if (ct.includes("png") || /\.png(\?|$)/.test(lowerUrl)) format = "PNG";
    else if (ct.includes("jpeg") || ct.includes("jpg") || /\.jpe?g(\?|$)/.test(lowerUrl)) format = "JPEG";
    if (!format) return null;
    const dataUrl: string = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(blob);
    });
    const dims = await new Promise<{ width: number; height: number } | null>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth || 1, height: img.naturalHeight || 1 });
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
    if (!dims) return null;
    return { dataUrl, format, width: dims.width, height: dims.height };
  } catch {
    return null;
  }
}

export async function buildOrgPdf(
  orgName: string,
  rows: Array<{ activity: DemoActivity; member: { name: string; email: string } }>,
  totals: { value: number; hours: number; activities: number },
  monthlyTrend: ReturnType<typeof computeMonthlyTrend>,
  filterSummary: string,
  highlights: Array<{ activity: DemoActivity; member: { name: string; email: string } }>,
  sdgs: SdgBreakdownPoint[],
  // Optional — extra parameter kept backward compatible so existing callers
  // (which omit it) continue to work without changes.
  branding?: OrgBranding | null,
  // When `"blob"`, the function returns the rendered PDF as a Blob instead
  // of triggering a download. Defaults to `"save"` to preserve the existing
  // behaviour for the Download PDF button.
  output: "save" | "blob" = "save",
  sroi?: RenderOrgPdfArgs["sroi"],
  locale?: RenderOrgPdfArgs["locale"],
  // Optional auditable per-volunteer cost sub-amounts (Recruitment /
  // Onboarding / Support / Admin). When provided, rendered as a small
  // breakdown table in the SROI assumptions section of the PDF so
  // funders see the same numbers as the dashboard.
  costBreakdown?: SroiCostBreakdown | null,
): Promise<Blob | void> {
  const preloadedLogo = branding?.logoUrl ? await loadLogoAsDataUrl(branding.logoUrl) : null;
  const doc = renderOrgPdf({
    orgName, rows, totals, monthlyTrend, filterSummary, highlights, sdgs,
    sroiCostPerVolunteer: sroi?.costPerVolunteer ?? null,
    sroiCostBreakdown: costBreakdown ?? null,
    branding: branding ?? null, preloadedLogo, sroi: sroi ?? null, locale,
  });
  if (output === "blob") {
    return doc.output("blob");
  }
  doc.save(`${orgName.replace(/\s+/g, "-").toLowerCase()}-impact-report.pdf`);
}

// ---------------------------------------------------------------------------
// Web Worker-based PDF builder for the live preview.
//
// jsPDF rendering (cover, charts, SDG section, full activity table) is fully
// synchronous and ran on the main thread, briefly freezing scrolling/typing
// whenever a filter changed. We now do that work inside a dedicated worker
// so the UI stays responsive. The Download PDF button keeps using the
// main-thread `buildOrgPdf` so its behaviour is unchanged.

type PendingResolver = {
  resolve: (blob: Blob) => void;
  reject: (err: Error) => void;
};

let workerInstance: Worker | null = null;
let workerSeq = 0;
const pending = new Map<number, PendingResolver>();

function getWorker(): Worker | null {
  if (typeof window === "undefined" || typeof Worker === "undefined") return null;
  if (workerInstance) return workerInstance;
  try {
    workerInstance = new Worker(
      new URL("../workers/orgPdfWorker.ts", import.meta.url),
      { type: "module" },
    );
    workerInstance.addEventListener("message", (e: MessageEvent<{ type: string; seq: number; blob?: Blob; message?: string }>) => {
      const data = e.data;
      const handler = pending.get(data.seq);
      if (!handler) return;
      pending.delete(data.seq);
      if (data.type === "result" && data.blob) {
        handler.resolve(data.blob);
      } else if (data.type === "skipped") {
        // The worker dropped this job because a newer request superseded
        // it before we got to render. Reject with a sentinel error the
        // caller is expected to ignore via the stale-seq guard.
        handler.reject(new Error("PDF worker job superseded"));
      } else {
        handler.reject(new Error(data.message ?? "PDF worker failed"));
      }
    });
    workerInstance.addEventListener("error", (e: ErrorEvent) => {
      const err = new Error(e.message || "PDF worker error");
      pending.forEach(h => h.reject(err));
      pending.clear();
    });
  } catch {
    workerInstance = null;
  }
  return workerInstance;
}

// Builds the impact PDF off the main thread. Pre-loads the logo on the main
// thread first (workers don't have `Image()`), then ships a structured-clone
// safe args bundle to the worker. Falls back to the synchronous path when no
// worker is available (e.g. SSR or ancient browsers) so the preview still
// works, just on the main thread.
export async function buildOrgPdfBlobAsync(
  args: Omit<RenderOrgPdfArgs, "preloadedLogo">,
): Promise<Blob> {
  const preloadedLogo = args.branding?.logoUrl
    ? await loadLogoAsDataUrl(args.branding.logoUrl)
    : null;
  const fullArgs: RenderOrgPdfArgs = { ...args, preloadedLogo };

  const worker = getWorker();
  if (!worker) {
    const doc = renderOrgPdf(fullArgs);
    return doc.output("blob");
  }

  const seq = ++workerSeq;
  return new Promise<Blob>((resolve, reject) => {
    pending.set(seq, { resolve, reject });
    worker.postMessage({ type: "build", seq, args: fullArgs });
  });
}
