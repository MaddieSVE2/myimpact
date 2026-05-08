import { useQuery } from "@tanstack/react-query";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  DEMO_MEMBERS, getDemoMember, SDG_BY_CATEGORY,
  type DemoActivity, type SdgBreakdownPoint, computeMonthlyTrend,
} from "@/lib/org-demo-mock";

export const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface OrgBranding {
  logoUrl: string | null;
  logoKey: string | null;
  brandPrimary: string | null;
  brandAccent: string | null;
}
export interface MyOrgResponse {
  org: { id: string; name: string; type: string; role: string; branding?: OrgBranding } | null;
}

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
    return { name: `Member ${String(idx + 1).padStart(3, "0")}`, email: "—" };
  }
  const m = getDemoMember(memberId);
  return { name: m?.name ?? memberId, email: m?.email ?? "" };
}

export function escapeCsv(v: string | number): string {
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function downloadCsv(rows: Array<Record<string, string | number>>, filename: string) {
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

// --- Internal design system for the org PDF -----------------------------------
// Kept private to this module so the public `buildOrgPdf` signature is stable.

type RGB = [number, number, number];

function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function mixRgb(a: RGB, b: RGB, t: number): RGB {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

// Best-effort async loader: fetch a remote image (e.g. an org logo), convert
// it to a `data:` URL that jsPDF can consume via `addImage`, and read its
// natural pixel dimensions so the caller can preserve aspect ratio.
// Resolves to `null` on any failure (CORS, 404, unsupported format, timeout)
// so callers can fall back to a typographic lockup without throwing.
async function loadImageAsDataUrl(
  url: string,
  timeoutMs = 2500,
): Promise<{ dataUrl: string; format: "PNG" | "JPEG"; width: number; height: number } | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, { signal: ctrl.signal, credentials: "omit", mode: "cors" });
    clearTimeout(timer);
    if (!res.ok) return null;
    const blob = await res.blob();
    // Detect format from Content-Type first; fall back to URL extension so
    // signed object URLs without a Content-Type still classify correctly.
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
  // (which omit it) continue to work without changes. The function returns
  // a Promise to support best-effort logo embedding, but legacy non-awaiting
  // callers still work (the PDF saves once the promise settles).
  branding?: OrgBranding | null,
): Promise<void> {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 48;
  const contentW = pageW - margin * 2;

  // ----- Colour tokens ------------------------------------------------------
  const TEAL: RGB = [13, 148, 136];
  const validHex = (h: string | null | undefined) => !!h && /^#?[0-9a-f]{6}$/i.test(h);
  const brand: RGB = validHex(branding?.brandPrimary) ? hexToRgb(branding!.brandPrimary!) : TEAL;
  // brandAccent is used as the bar-top highlight, the stat-card accent rail
  // and SDG section ornament when set; otherwise we derive a lighter brand
  // tint so the design still reads as branded.
  const accent: RGB = validHex(branding?.brandAccent)
    ? hexToRgb(branding!.brandAccent!)
    : mixRgb(brand, [255, 255, 255], 0.30);
  const brandDark = mixRgb(brand, [0, 0, 0], 0.22);
  const brandTint = mixRgb(brand, [255, 255, 255], 0.86);

  const INK: RGB = [15, 23, 42];        // primary text
  const MUTED: RGB = [71, 85, 105];     // secondary text
  const SUBTLE: RGB = [148, 163, 184];  // tertiary / axis labels
  const HAIRLINE: RGB = [226, 232, 240];
  const SURFACE: RGB = [248, 250, 252];
  const WHITE: RGB = [255, 255, 255];

  // ----- jsPDF colour helpers -----------------------------------------------
  const setFill = (c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
  const setText = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);
  const setDraw = (c: RGB) => doc.setDrawColor(c[0], c[1], c[2]);

  const FOOTER_RESERVE = 36;

  // ----- Layout helpers -----------------------------------------------------
  function drawSectionHeading(yIn: number, label: string): number {
    doc.setFont("helvetica", "bold"); doc.setFontSize(13); setText(INK);
    doc.text(label, margin, yIn);
    setDraw(HAIRLINE); doc.setLineWidth(0.5);
    doc.line(margin, yIn + 6, margin + contentW, yIn + 6);
    return yIn + 22;
  }

  function ensureSpace(currentY: number, needed: number): number {
    const limit = pageH - FOOTER_RESERVE;
    if (currentY + needed > limit) {
      doc.addPage();
      return margin + 16;
    }
    return currentY;
  }

  // ===== COVER HEADER BAND ==================================================
  const headerH = 130;
  setFill(brand);
  doc.rect(0, 0, pageW, headerH, "F");
  // Bottom strip uses the brand accent (when set) — falls back to a darker
  // shade of the brand otherwise. Gives the header band a clear two-tone
  // edge that picks up `OrgBranding.brandAccent`.
  setFill(validHex(branding?.brandAccent) ? accent : brandDark);
  doc.rect(0, headerH, pageW, 4, "F");

  // Logo: try a best-effort embed of `branding.logoUrl` (PNG/JPEG via
  // `addImage`). On any failure (CORS, 404, unsupported format, timeout)
  // we silently fall back to the typographic initials lockup in the brand
  // colour — see "Out of scope" in the task spec.
  const lockupX = margin;
  const lockupY = 42;
  const lockupSize = 56;
  setFill(WHITE);
  doc.roundedRect(lockupX, lockupY, lockupSize, lockupSize, 8, 8, "F");
  let logoEmbedded = false;
  if (branding?.logoUrl) {
    const loaded = await loadImageAsDataUrl(branding.logoUrl);
    if (loaded) {
      try {
        // Preserve the logo's natural aspect ratio: fit it inside the padded
        // box and centre any letterbox margin. Without this, wide or tall
        // logos get visibly stretched.
        const pad = 6;
        const boxW = lockupSize - pad * 2;
        const boxH = lockupSize - pad * 2;
        const scale = Math.min(boxW / loaded.width, boxH / loaded.height);
        const drawW = loaded.width * scale;
        const drawH = loaded.height * scale;
        const drawX = lockupX + pad + (boxW - drawW) / 2;
        const drawY = lockupY + pad + (boxH - drawH) / 2;
        doc.addImage(
          loaded.dataUrl, loaded.format,
          drawX, drawY, drawW, drawH,
          undefined, "FAST",
        );
        logoEmbedded = true;
      } catch {
        // fall through to typographic lockup below
      }
    }
  }
  if (!logoEmbedded) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(22); setText(brand);
    const initials = orgName
      .split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0].toUpperCase()).join("") || "·";
    const initW = doc.getTextWidth(initials);
    doc.text(initials, lockupX + 28 - initW / 2, lockupY + 36);
  }

  // Title block
  setText(WHITE);
  doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  doc.text("MEMBER IMPACT REPORT", lockupX + 76, lockupY + 14);
  doc.setFont("helvetica", "bold"); doc.setFontSize(22);
  doc.text(orgName, lockupX + 76, lockupY + 38);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  const generatedStr = `Generated ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}`;
  const periodStr = filterSummary && filterSummary.trim().length > 0 ? filterSummary : "All activity to date";
  doc.text(`${periodStr}  ·  ${generatedStr}`, lockupX + 76, lockupY + 54);

  // ===== SUMMARY STAT CARDS =================================================
  let y = headerH + 32;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); setText(MUTED);
  doc.text("AT A GLANCE", margin, y);
  y += 12;

  const cardGap = 14;
  const cardW = (contentW - cardGap * 2) / 3;
  const cardH = 80;
  const statCards = [
    { label: "Social value", value: `£${totals.value.toLocaleString("en-GB")}`, sub: "Total generated" },
    { label: "Hours logged", value: Math.round(totals.hours).toLocaleString("en-GB"), sub: "Member volunteer time" },
    { label: "Activities",   value: totals.activities.toLocaleString("en-GB"),       sub: "Logged in this period" },
  ];
  statCards.forEach((c, i) => {
    const x = margin + i * (cardW + cardGap);
    setFill(brandTint);
    doc.roundedRect(x, y, cardW, cardH, 8, 8, "F");
    setFill(brand);
    doc.roundedRect(x, y, 4, cardH, 2, 2, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); setText(MUTED);
    doc.text(c.label.toUpperCase(), x + 16, y + 18);
    doc.setFont("helvetica", "bold"); doc.setFontSize(22); setText(INK);
    doc.text(c.value, x + 16, y + 48);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); setText(MUTED);
    doc.text(c.sub, x + 16, y + 66);
  });
  y += cardH + 26;

  // ===== MONTHLY TREND CHART ================================================
  y = drawSectionHeading(y, "Monthly social value trend");
  if (monthlyTrend.length === 0) {
    setText(MUTED); doc.setFont("helvetica", "normal"); doc.setFontSize(10);
    doc.text("No activity recorded in this period.", margin, y + 14);
    y += 30;
  } else {
    const chartH = 150;
    const chartTop = y;
    const chartBottom = y + chartH - 22; // leave room for month labels
    const chartLeft = margin + 36;       // y-axis label gutter
    const chartRight = margin + contentW - 4;
    const chartInnerW = chartRight - chartLeft;
    const maxVal = Math.max(1, ...monthlyTrend.map(p => p.value));
    const niceMax = Math.max(50, Math.ceil(maxVal / 50) * 50);

    // Gridlines + y-axis labels
    setDraw(HAIRLINE); doc.setLineWidth(0.5);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); setText(SUBTLE);
    const gridLines = 4;
    for (let i = 0; i <= gridLines; i++) {
      const gy = chartBottom - (i / gridLines) * (chartBottom - chartTop - 8);
      doc.line(chartLeft, gy, chartRight, gy);
      const v = Math.round((i / gridLines) * niceMax);
      doc.text(`£${v}`, margin, gy + 3);
    }

    // Bars (width auto-scales to month count, capped to keep things tidy)
    const n = monthlyTrend.length;
    const slot = chartInnerW / n;
    const barW = Math.min(36, Math.max(6, slot * 0.62));
    monthlyTrend.forEach((p) => {
      const i = monthlyTrend.indexOf(p);
      const cx = chartLeft + slot * i + slot / 2;
      const x = cx - barW / 2;
      const usableH = chartBottom - chartTop - 8;
      const h = (p.value / niceMax) * usableH;
      const by = chartBottom - h;
      const radius = Math.min(3, barW / 2);
      // Base fill (brand)
      setFill(brand);
      doc.roundedRect(x, by, barW, h, radius, radius, "F");
      // Two-tone highlight near the top of the bar
      if (h > 10) {
        setFill(accent);
        doc.roundedRect(x, by, barW, Math.min(h * 0.45, 14), radius, radius, "F");
      }
      // Value label above bar — only when there's room and width is sensible
      if (barW >= 14) {
        doc.setFont("helvetica", "bold"); doc.setFontSize(7); setText(MUTED);
        const vt = `£${p.value}`;
        const vw = doc.getTextWidth(vt);
        doc.text(vt, cx - vw / 2, Math.max(chartTop + 8, by - 3));
      }
      // Month label below baseline
      doc.setFont("helvetica", "normal"); doc.setFontSize(7); setText(MUTED);
      const lw = doc.getTextWidth(p.label);
      doc.text(p.label, cx - lw / 2, chartBottom + 12);
    });

    // Baseline
    setDraw(MUTED); doc.setLineWidth(0.6);
    doc.line(chartLeft, chartBottom, chartRight, chartBottom);
    y += chartH + 10;
  }

  // ===== HIGHLIGHTS =========================================================
  y = ensureSpace(y, 60);
  y = drawSectionHeading(y, "Highlights");
  if (highlights.length === 0) {
    setText(MUTED); doc.setFont("helvetica", "normal"); doc.setFontSize(10);
    doc.text("No activities to highlight in this range.", margin, y);
    y += 18;
  } else {
    highlights.slice(0, 5).forEach((h) => {
      const sdg = SDG_BY_CATEGORY[h.activity.category];
      const sdgColor: RGB = sdg ? hexToRgb(sdg.color) : brand;
      doc.setFont("helvetica", "normal"); doc.setFontSize(9);
      const desc = doc.splitTextToSize(h.activity.description, contentW - 30) as string[];
      const blockH = 44 + desc.length * 11;
      y = ensureSpace(y, blockH + 8);
      // Card background
      setFill(SURFACE);
      doc.roundedRect(margin, y, contentW, blockH, 6, 6, "F");
      // Coloured left accent bar
      setFill(sdgColor);
      doc.rect(margin, y, 4, blockH, "F");
      // Title
      doc.setFont("helvetica", "bold"); doc.setFontSize(11); setText(INK);
      doc.text(h.activity.activity, margin + 14, y + 18);
      // Meta row
      doc.setFont("helvetica", "normal"); doc.setFontSize(9); setText(MUTED);
      const meta = `${h.member.name}  ·  £${h.activity.socialValueGBP}  ·  ${h.activity.hours}h  ·  SDG ${sdg?.number ?? "—"}`;
      doc.text(meta, margin + 14, y + 32);
      // Description
      setText(MUTED);
      doc.text(desc, margin + 14, y + 46);
      y += blockH + 8;
    });
  }

  // ===== SDG BREAKDOWN ======================================================
  y += 6;
  y = ensureSpace(y, 60);
  y = drawSectionHeading(y, "UN Sustainable Development Goals");
  if (sdgs.length === 0) {
    setText(MUTED); doc.setFont("helvetica", "normal"); doc.setFontSize(10);
    doc.text("No SDG-aligned activities in this range.", margin, y);
    y += 18;
  } else {
    const maxVal = Math.max(1, ...sdgs.map(s => s.value));
    const rowH = 30;
    const badgeSize = 22;
    const barAreaX = margin + 210;
    const barAreaW = contentW - 210 - 90;
    const valueRightX = margin + contentW - 6;
    sdgs.forEach((s, i) => {
      y = ensureSpace(y, rowH + 4);
      const sdgColor = hexToRgb(s.color);
      // Alt row tint
      if (i % 2 === 0) {
        setFill(SURFACE);
        doc.roundedRect(margin, y, contentW, rowH, 4, 4, "F");
      }
      // SDG number badge
      const badgeY = y + (rowH - badgeSize) / 2;
      setFill(sdgColor);
      doc.roundedRect(margin + 8, badgeY, badgeSize, badgeSize, 4, 4, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(11); setText(WHITE);
      const badgeT = String(s.number);
      const bw = doc.getTextWidth(badgeT);
      doc.text(badgeT, margin + 8 + badgeSize / 2 - bw / 2, badgeY + badgeSize / 2 + 3.5);
      // Label + meta
      doc.setFont("helvetica", "bold"); doc.setFontSize(10); setText(INK);
      doc.text(s.label, margin + 38, y + 14);
      doc.setFont("helvetica", "normal"); doc.setFontSize(8); setText(MUTED);
      doc.text(`${s.activities} activities  ·  ${s.members} members`, margin + 38, y + 24);
      // Bar (track + fill)
      const trackY = y + rowH / 2 - 4;
      setFill(mixRgb(sdgColor, [255, 255, 255], 0.78));
      doc.roundedRect(barAreaX, trackY, barAreaW, 8, 3, 3, "F");
      const fillW = Math.max(2, (s.value / maxVal) * barAreaW);
      setFill(sdgColor);
      doc.roundedRect(barAreaX, trackY, fillW, 8, 3, 3, "F");
      // Value + percent right-aligned
      doc.setFont("helvetica", "bold"); doc.setFontSize(10); setText(INK);
      const valStr = `£${s.value.toLocaleString("en-GB")}`;
      doc.text(valStr, valueRightX - doc.getTextWidth(valStr), y + 14);
      doc.setFont("helvetica", "normal"); doc.setFontSize(8); setText(MUTED);
      const pctStr = `${s.pct}%`;
      doc.text(pctStr, valueRightX - doc.getTextWidth(pctStr), y + 24);
      y += rowH + 2;
    });
  }
  y += 12;

  // ===== ACTIVITY TABLE =====================================================
  // Reserve enough room for the heading + a couple of body rows so the heading
  // never gets orphaned at the very bottom of a page.
  y = ensureSpace(y, 110);
  y = drawSectionHeading(y, "Activity log");

  autoTable(doc, {
    startY: y,
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
    styles: {
      fontSize: 8, cellPadding: 6, valign: "top",
      textColor: [30, 41, 59], lineColor: HAIRLINE, lineWidth: 0.3,
    },
    headStyles: {
      fillColor: brand, textColor: 255, fontStyle: "bold",
      fontSize: 8.5, cellPadding: 7, halign: "left",
    },
    alternateRowStyles: { fillColor: SURFACE },
    columnStyles: {
      0: { cellWidth: 56 },
      1: { cellWidth: 72 },
      2: { cellWidth: 54 },
      3: { cellWidth: 28, halign: "center" },
      4: { cellWidth: 207 },
      5: { cellWidth: 32, halign: "right" },
      6: { cellWidth: 38, halign: "right" },
    },
    margin: { left: margin, right: margin, top: margin + 8, bottom: FOOTER_RESERVE + 8 },
    showHead: "everyPage",
  });

  // ===== FOOTER PASS (every page) ==========================================
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    const fy = pageH - 18;
    setDraw(HAIRLINE); doc.setLineWidth(0.5);
    doc.line(margin, fy - 12, pageW - margin, fy - 12);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); setText(MUTED);
    // Left
    doc.text(p === 1 ? "My Impact" : orgName, margin, fy);
    // Center
    const pageStr = `Page ${p} of ${totalPages}`;
    doc.text(pageStr, (pageW - doc.getTextWidth(pageStr)) / 2, fy);
    // Right
    const right = "Generated by My Impact";
    doc.text(right, pageW - margin - doc.getTextWidth(right), fy);
  }

  doc.save(`${orgName.replace(/\s+/g, "-").toLowerCase()}-impact-report.pdf`);
}
