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

export function buildOrgPdf(
  orgName: string,
  rows: Array<{ activity: DemoActivity; member: { name: string; email: string } }>,
  totals: { value: number; hours: number; activities: number },
  monthlyTrend: ReturnType<typeof computeMonthlyTrend>,
  filterSummary: string,
  highlights: Array<{ activity: DemoActivity; member: { name: string; email: string } }>,
  sdgs: SdgBreakdownPoint[],
) {
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
      doc.setFillColor(13, 148, 136);
      doc.rect(x, baseY - h, barW, h, "F");
      doc.setTextColor(80);
      doc.text(p.label, x, baseY + 12);
      doc.text(`£${p.value}`, x, baseY - h - 4);
    });
  }

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
