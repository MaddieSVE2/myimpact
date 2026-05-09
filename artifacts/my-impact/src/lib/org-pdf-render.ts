import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  SDG_BY_CATEGORY,
  type DemoActivity, type SdgBreakdownPoint, computeMonthlyTrend,
} from "@/lib/org-demo-mock";

export interface OrgBranding {
  logoUrl: string | null;
  logoKey: string | null;
  brandPrimary: string | null;
  brandAccent: string | null;
}

export interface PreloadedLogo {
  dataUrl: string;
  format: "PNG" | "JPEG";
  width: number;
  height: number;
}

export interface RenderOrgPdfArgs {
  orgName: string;
  rows: Array<{ activity: DemoActivity; member: { name: string; email: string } }>;
  totals: { value: number; hours: number; activities: number };
  monthlyTrend: ReturnType<typeof computeMonthlyTrend>;
  filterSummary: string;
  highlights: Array<{ activity: DemoActivity; member: { name: string; email: string } }>;
  sdgs: SdgBreakdownPoint[];
  branding?: OrgBranding | null;
  preloadedLogo?: PreloadedLogo | null;
}

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

// Pure, synchronous renderer. No DOM access — safe to call from a Web Worker.
// Returns the rendered jsPDF document for the caller to save() or output().
export function renderOrgPdf(args: RenderOrgPdfArgs): jsPDF {
  const {
    orgName, rows, totals, monthlyTrend, filterSummary, highlights, sdgs,
    branding, preloadedLogo,
  } = args;

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 48;
  const contentW = pageW - margin * 2;

  const TEAL: RGB = [13, 148, 136];
  const validHex = (h: string | null | undefined) => !!h && /^#?[0-9a-f]{6}$/i.test(h);
  const brand: RGB = validHex(branding?.brandPrimary) ? hexToRgb(branding!.brandPrimary!) : TEAL;
  const accent: RGB = validHex(branding?.brandAccent)
    ? hexToRgb(branding!.brandAccent!)
    : mixRgb(brand, [255, 255, 255], 0.30);
  const brandDark = mixRgb(brand, [0, 0, 0], 0.22);
  const brandTint = mixRgb(brand, [255, 255, 255], 0.86);

  const INK: RGB = [15, 23, 42];
  const MUTED: RGB = [71, 85, 105];
  const SUBTLE: RGB = [148, 163, 184];
  const HAIRLINE: RGB = [226, 232, 240];
  const SURFACE: RGB = [248, 250, 252];
  const WHITE: RGB = [255, 255, 255];

  const setFill = (c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
  const setText = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);
  const setDraw = (c: RGB) => doc.setDrawColor(c[0], c[1], c[2]);

  const FOOTER_RESERVE = 36;

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
  setFill(validHex(branding?.brandAccent) ? accent : brandDark);
  doc.rect(0, headerH, pageW, 4, "F");

  const lockupX = margin;
  const lockupY = 42;
  const lockupSize = 56;
  setFill(WHITE);
  doc.roundedRect(lockupX, lockupY, lockupSize, lockupSize, 8, 8, "F");
  let logoEmbedded = false;
  if (preloadedLogo) {
    try {
      const pad = 6;
      const boxW = lockupSize - pad * 2;
      const boxH = lockupSize - pad * 2;
      const scale = Math.min(boxW / preloadedLogo.width, boxH / preloadedLogo.height);
      const drawW = preloadedLogo.width * scale;
      const drawH = preloadedLogo.height * scale;
      const drawX = lockupX + pad + (boxW - drawW) / 2;
      const drawY = lockupY + pad + (boxH - drawH) / 2;
      doc.addImage(
        preloadedLogo.dataUrl, preloadedLogo.format,
        drawX, drawY, drawW, drawH,
        undefined, "FAST",
      );
      logoEmbedded = true;
    } catch {
      // fall through to typographic lockup
    }
  }
  if (!logoEmbedded) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(22); setText(brand);
    const initials = orgName
      .split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0].toUpperCase()).join("") || "·";
    const initW = doc.getTextWidth(initials);
    doc.text(initials, lockupX + 28 - initW / 2, lockupY + 36);
  }

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
    const chartBottom = y + chartH - 22;
    const chartLeft = margin + 36;
    const chartRight = margin + contentW - 4;
    const chartInnerW = chartRight - chartLeft;
    const maxVal = Math.max(1, ...monthlyTrend.map(p => p.value));
    const niceMax = Math.max(50, Math.ceil(maxVal / 50) * 50);

    setDraw(HAIRLINE); doc.setLineWidth(0.5);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); setText(SUBTLE);
    const gridLines = 4;
    for (let i = 0; i <= gridLines; i++) {
      const gy = chartBottom - (i / gridLines) * (chartBottom - chartTop - 8);
      doc.line(chartLeft, gy, chartRight, gy);
      const v = Math.round((i / gridLines) * niceMax);
      doc.text(`£${v}`, margin, gy + 3);
    }

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
      setFill(brand);
      doc.roundedRect(x, by, barW, h, radius, radius, "F");
      if (h > 10) {
        setFill(accent);
        doc.roundedRect(x, by, barW, Math.min(h * 0.45, 14), radius, radius, "F");
      }
      if (barW >= 14) {
        doc.setFont("helvetica", "bold"); doc.setFontSize(7); setText(MUTED);
        const vt = `£${p.value}`;
        const vw = doc.getTextWidth(vt);
        doc.text(vt, cx - vw / 2, Math.max(chartTop + 8, by - 3));
      }
      doc.setFont("helvetica", "normal"); doc.setFontSize(7); setText(MUTED);
      const lw = doc.getTextWidth(p.label);
      doc.text(p.label, cx - lw / 2, chartBottom + 12);
    });

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
      setFill(SURFACE);
      doc.roundedRect(margin, y, contentW, blockH, 6, 6, "F");
      setFill(sdgColor);
      doc.rect(margin, y, 4, blockH, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(11); setText(INK);
      doc.text(h.activity.activity, margin + 14, y + 18);
      doc.setFont("helvetica", "normal"); doc.setFontSize(9); setText(MUTED);
      const meta = `${h.member.name}  ·  £${h.activity.socialValueGBP}  ·  ${h.activity.hours}h  ·  SDG ${sdg?.number ?? "n/a"}`;
      doc.text(meta, margin + 14, y + 32);
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
      if (i % 2 === 0) {
        setFill(SURFACE);
        doc.roundedRect(margin, y, contentW, rowH, 4, 4, "F");
      }
      const badgeY = y + (rowH - badgeSize) / 2;
      setFill(sdgColor);
      doc.roundedRect(margin + 8, badgeY, badgeSize, badgeSize, 4, 4, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(11); setText(WHITE);
      const badgeT = String(s.number);
      const bw = doc.getTextWidth(badgeT);
      doc.text(badgeT, margin + 8 + badgeSize / 2 - bw / 2, badgeY + badgeSize / 2 + 3.5);
      doc.setFont("helvetica", "bold"); doc.setFontSize(10); setText(INK);
      doc.text(s.label, margin + 38, y + 14);
      doc.setFont("helvetica", "normal"); doc.setFontSize(8); setText(MUTED);
      doc.text(`${s.activities} activities  ·  ${s.members} members`, margin + 38, y + 24);
      const trackY = y + rowH / 2 - 4;
      setFill(mixRgb(sdgColor, [255, 255, 255], 0.78));
      doc.roundedRect(barAreaX, trackY, barAreaW, 8, 3, 3, "F");
      const fillW = Math.max(2, (s.value / maxVal) * barAreaW);
      setFill(sdgColor);
      doc.roundedRect(barAreaX, trackY, fillW, 8, 3, 3, "F");
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
        sdg ? `${sdg.number}` : "n/a",
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
    doc.text(p === 1 ? "My Impact" : orgName, margin, fy);
    const pageStr = `Page ${p} of ${totalPages}`;
    doc.text(pageStr, (pageW - doc.getTextWidth(pageStr)) / 2, fy);
    const right = "Generated by My Impact";
    doc.text(right, pageW - margin - doc.getTextWidth(right), fy);
  }

  return doc;
}
