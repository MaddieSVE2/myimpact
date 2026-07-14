import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  SDG_BY_CATEGORY,
  type DemoActivity, type SdgBreakdownPoint, computeMonthlyTrend,
} from "@/lib/org-demo-mock";
import { makeT } from "@/i18n/t";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/config";
import { getSdgByNumber, getSdgText } from "@/lib/sdg";

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

export interface SroiCostBreakdownArg {
  recruitment?: number | null;
  onboarding?: number | null;
  support?: number | null;
  admin?: number | null;
}

export interface PdfSections {
  stats: boolean;
  trend: boolean;
  highlights: boolean;
  sdgs: boolean;
  sroi: boolean;
  activityLog: boolean;
}

export const DEFAULT_PDF_SECTIONS: PdfSections = {
  stats: true,
  trend: true,
  highlights: true,
  sdgs: true,
  sroi: true,
  activityLog: true,
};

export interface RenderOrgPdfArgs {
  orgName: string;
  rows: Array<{ activity: DemoActivity; member: { name: string; email: string } }>;
  totals: { value: number; hours: number; activities: number };
  monthlyTrend: ReturnType<typeof computeMonthlyTrend>;
  filterSummary: string;
  highlights: Array<{ activity: DemoActivity; member: { name: string; email: string } }>;
  sdgs: SdgBreakdownPoint[];
  sroiCostPerVolunteer?: number | null;
  sroiCostBreakdown?: SroiCostBreakdownArg | null;
  branding?: OrgBranding | null;
  preloadedLogo?: PreloadedLogo | null;
  // SROI assumptions used to keep the PDF in sync with the on-screen
  // explainer. `costPerVolunteer` is the org-configured per-volunteer cost
  // (falling back to the platform default upstream); `totalMembers` is used
  // to compute total investment.
  sroi?: {
    costPerVolunteer: number;
    totalMembers: number;
    // True only when the org has explicitly configured a cost-per-volunteer
    // (i.e. not the platform default fallback). Gates the headline SROI cell.
    costConfigured?: boolean;
  } | null;
  // Active app locale; defaults to English. Used to keep the SROI section
  // copy aligned with the dashboard explainer in EN/CY.
  locale?: Locale;
  // Which sections to include in the rendered PDF. Defaults to all on.
  sections?: Partial<PdfSections>;
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
    sroiCostPerVolunteer, sroiCostBreakdown,
    branding, preloadedLogo, sroi, locale, sections: sectionsArg,
  } = args;
  const sec: PdfSections = { ...DEFAULT_PDF_SECTIONS, ...sectionsArg };
  void sroiCostPerVolunteer;
  const breakdownLines: Array<{ label: string; value: number }> = [];
  if (sroiCostBreakdown) {
    if (typeof sroiCostBreakdown.recruitment === "number") breakdownLines.push({ label: "Recruitment", value: sroiCostBreakdown.recruitment });
    if (typeof sroiCostBreakdown.onboarding === "number")  breakdownLines.push({ label: "Onboarding",  value: sroiCostBreakdown.onboarding });
    if (typeof sroiCostBreakdown.support === "number")     breakdownLines.push({ label: "Support",     value: sroiCostBreakdown.support });
    if (typeof sroiCostBreakdown.admin === "number")       breakdownLines.push({ label: "Admin",       value: sroiCostBreakdown.admin });
  }
  const loc = locale ?? DEFAULT_LOCALE;
  const t = makeT(loc);

  // Localised short goal label for an SDG number, reusing the shared SDG
  // reference data (EN/CY). Falls back to the English label baked into the
  // activity/breakdown data if the number isn't recognised.
  const sdgLabelFor = (number: number, fallback: string): string => {
    const goal = getSdgByNumber(number);
    return goal ? getSdgText(goal, loc).label : fallback;
  };

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
  if (sec.stats) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); setText(MUTED);
    doc.text("AT A GLANCE", margin, y);
    y += 12;

    const cardGap = 14;
    const cardH = 80;
    const statCards = [
      { label: "Social value", value: `£${totals.value.toLocaleString("en-GB")}`, sub: "Total generated" },
      { label: "Hours logged", value: Math.round(totals.hours).toLocaleString("en-GB"), sub: "Member volunteer time" },
      { label: "Activities",   value: totals.activities.toLocaleString("en-GB"),       sub: "Logged in this period" },
    ];
    // Surface the SROI ratio in the headline row when cost-per-volunteer is
    // configured, using the same calculation as the dashboard and the SROI
    // assumptions section below. Omitted cleanly otherwise.
    if (sroi && sroi.costConfigured && sroi.totalMembers > 0 && sroi.costPerVolunteer > 0) {
      const headlineInvestment = sroi.totalMembers * sroi.costPerVolunteer;
      const headlineRatio = totals.value / headlineInvestment;
      statCards.push({
        label: "SROI",
        value: `£${headlineRatio.toFixed(2)}`,
        sub: "Value per £1 invested",
      });
    }
    const cardW = (contentW - cardGap * (statCards.length - 1)) / statCards.length;
    statCards.forEach((c, i) => {
      const x = margin + i * (cardW + cardGap);
      setFill(brandTint);
      doc.roundedRect(x, y, cardW, cardH, 8, 8, "F");
      setFill(brand);
      doc.roundedRect(x, y, 4, cardH, 2, 2, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(8); setText(MUTED);
      doc.text(c.label.toUpperCase(), x + 16, y + 18);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(statCards.length > 3 ? 18 : 22); setText(INK);
      doc.text(c.value, x + 16, y + 48);
      doc.setFont("helvetica", "normal"); doc.setFontSize(9); setText(MUTED);
      doc.text(c.sub, x + 16, y + 66);
    });
    y += cardH + 14;
    // Plain-language explanation of the headline social value figure, mirroring
    // the on-screen metric tooltip so the context isn't lost in the export.
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); setText(MUTED);
    const totalValueHelp = doc.splitTextToSize(t("metricHelp.totalSocialValue"), contentW) as string[];
    doc.text(totalValueHelp, margin, y);
    y += totalValueHelp.length * 10 + 14;
  } else {
    y += 16;
  }

  // ===== MONTHLY TREND CHART ================================================
  if (sec.trend) {
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
  }

  // ===== HIGHLIGHTS =========================================================
  if (sec.highlights) {
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
  }

  // ===== SDG BREAKDOWN ======================================================
  if (sec.sdgs) {
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
        doc.text(sdgLabelFor(s.number, s.label), margin + 38, y + 14);
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
  }

  // ===== SROI ASSUMPTIONS ===================================================
  // Mirrors the dashboard SROI explainer so the on-screen and exported
  // numbers tell the same story to funders.
  if (sec.sroi && sroi && sroi.totalMembers > 0) {
    y = ensureSpace(y, 130);
    y = drawSectionHeading(y, t("orgDashboard.sroiTitle"));
    const totalInvestment = sroi.totalMembers * sroi.costPerVolunteer;
    const ratio = totalInvestment > 0 ? totals.value / totalInvestment : 0;

    // Plain-language explanation of the SROI metric, mirroring the on-screen
    // metric tooltip so funders reading the PDF get the same context.
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); setText(MUTED);
    const sroiHelp = doc.splitTextToSize(t("metricHelp.sroi"), contentW) as string[];
    doc.text(sroiHelp, margin, y);
    y += sroiHelp.length * 10 + 10;

    doc.setFont("helvetica", "normal"); doc.setFontSize(9); setText(MUTED);
    const body = t("orgDashboard.sroiBody", {
      costPerVolunteer: `£${sroi.costPerVolunteer.toLocaleString("en-GB")}`,
      members: sroi.totalMembers.toLocaleString("en-GB"),
      totalInvestment: `£${totalInvestment.toLocaleString("en-GB")}`,
      socialValue: `£${totals.value.toLocaleString("en-GB")}`,
      ratio: `£${ratio.toFixed(2)}`,
    });
    const bodyLines = doc.splitTextToSize(body, contentW) as string[];
    doc.text(bodyLines, margin, y);
    y += bodyLines.length * 11 + 10;

    const sroiCardGap = 12;
    const sroiCardW = (contentW - sroiCardGap * 3) / 4;
    const sroiCardH = 64;
    y = ensureSpace(y, sroiCardH + 8);
    const sroiCards = [
      {
        label: t("orgDashboard.sroiOrgInvestmentLabel").toUpperCase(),
        value: `£${sroi.costPerVolunteer.toLocaleString("en-GB")}`,
        sub: t("orgDashboard.sroiOrgInvestmentSub"),
      },
      {
        label: t("orgDashboard.sroiTotalInvestmentLabel").toUpperCase(),
        value: `£${totalInvestment.toLocaleString("en-GB")}`,
        sub: t("orgDashboard.sroiTotalInvestmentSub"),
      },
      {
        label: t("orgDashboard.sroiSocialValueLabel").toUpperCase(),
        value: `£${totals.value.toLocaleString("en-GB")}`,
        sub: t("orgDashboard.sroiSocialValueSub"),
      },
      {
        label: t("orgDashboard.sroiRatioLabel").toUpperCase(),
        value: `£${ratio.toFixed(2)}`,
        sub: t("orgDashboard.sroiRatioSub"),
        emphasised: true,
      },
    ];
    sroiCards.forEach((c, i) => {
      const x = margin + i * (sroiCardW + sroiCardGap);
      setFill(c.emphasised ? brand : SURFACE);
      doc.roundedRect(x, y, sroiCardW, sroiCardH, 6, 6, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(7);
      setText(c.emphasised ? WHITE : MUTED);
      doc.text(c.label, x + 12, y + 16);
      doc.setFont("helvetica", "bold"); doc.setFontSize(16);
      setText(c.emphasised ? WHITE : INK);
      doc.text(c.value, x + 12, y + 38);
      doc.setFont("helvetica", "normal"); doc.setFontSize(8);
      setText(c.emphasised ? WHITE : MUTED);
      doc.text(c.sub, x + 12, y + 54);
    });
    y += sroiCardH + 18;

    // Auditable Recruitment / Onboarding / Support / Admin sub-amounts
    // making up the per-volunteer cost. Wording matches the dashboard
    // SROI explainer table. Omitted cleanly when nothing is set.
    if (breakdownLines.length > 0) {
      y = ensureSpace(y, 26 + breakdownLines.length * 14);
      doc.setFont("helvetica", "bold"); doc.setFontSize(9); setText(MUTED);
      doc.text("Per-volunteer cost breakdown", margin, y);
      y += 6;
      setDraw(HAIRLINE); doc.setLineWidth(0.5);
      doc.line(margin, y, margin + contentW, y);
      y += 12;
      breakdownLines.forEach((l) => {
        doc.setFont("helvetica", "normal"); doc.setFontSize(9); setText(MUTED);
        doc.text(l.label, margin, y);
        doc.setFont("helvetica", "bold"); doc.setFontSize(9); setText(INK);
        const v = `£${l.value.toLocaleString("en-GB")}`;
        doc.text(v, margin + contentW - doc.getTextWidth(v), y);
        y += 14;
      });
      y += 4;
    }
  }

  // ===== ACTIVITY TABLE =====================================================
  if (sec.activityLog) {
    y = ensureSpace(y, 110);
    y = drawSectionHeading(y, "Activity log");

    // Compact SDG key so the numbered/colour-coded badges in the SDG column
    // are self-explanatory to readers skimming the log — each number is shown
    // next to its localised goal label.
    const legendSdgs = (() => {
      const seen = new Map<number, { number: number; color: string; label: string }>();
      for (const { activity } of rows) {
        const sdg = SDG_BY_CATEGORY[activity.category];
        if (sdg && !seen.has(sdg.number)) {
          seen.set(sdg.number, { number: sdg.number, color: sdg.color, label: sdg.label });
        }
      }
      return [...seen.values()].sort((a, b) => a.number - b.number);
    })();

    if (legendSdgs.length > 0) {
      doc.setFont("helvetica", "bold"); doc.setFontSize(8); setText(MUTED);
      doc.text(t("orgDashboard.sdgKey").toUpperCase(), margin, y);
      y += 12;

      const chip = 12;
      const gapAfterChip = 4;
      const itemGap = 14;
      const lineH = 17;
      let lx = margin;
      doc.setFontSize(8.5);
      legendSdgs.forEach((g) => {
        const label = sdgLabelFor(g.number, g.label);
        doc.setFont("helvetica", "normal");
        const labelW = doc.getTextWidth(label);
        const itemW = chip + gapAfterChip + labelW;
        if (lx > margin && lx + itemW > margin + contentW) {
          lx = margin;
          y += lineH;
        }
        y = ensureSpace(y, lineH);
        const chipColor = hexToRgb(g.color);
        setFill(chipColor);
        doc.roundedRect(lx, y - chip + 2.5, chip, chip, 2.5, 2.5, "F");
        doc.setFont("helvetica", "bold"); doc.setFontSize(7); setText(WHITE);
        const num = String(g.number);
        const nw = doc.getTextWidth(num);
        doc.text(num, lx + chip / 2 - nw / 2, y - chip + 2.5 + chip / 2 + 2.4);
        doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); setText(INK);
        doc.text(label, lx + chip + gapAfterChip, y);
        lx += itemW + itemGap;
      });
      y += 12;
    }

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
      // Colour-code the SDG cell with the goal's official colour and white
      // numeral, so each activity carries the same numbered/colour badge style
      // used on screen and in the SDG breakdown section above.
      didParseCell: (data) => {
        if (data.section !== "body" || data.column.index !== 3) return;
        const row = rows[data.row.index];
        const sdg = row ? SDG_BY_CATEGORY[row.activity.category] : undefined;
        if (!sdg) return;
        data.cell.styles.fillColor = hexToRgb(sdg.color);
        data.cell.styles.textColor = [255, 255, 255];
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.halign = "center";
        data.cell.styles.valign = "middle";
      },
      margin: { left: margin, right: margin, top: margin + 8, bottom: FOOTER_RESERVE + 8 },
      showHead: "everyPage",
    });
  }

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
