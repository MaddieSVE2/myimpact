// Renders a per-activity calculation formula string like "48 hrs × £14.43/hr"
// from a saved activity breakdown. Returns "" when no rate is stored (older
// records saved before the formula infrastructure existed).
export function calcResultBreakdown(b: {
  unit?: string;
  unitLabel?: string;
  valuePerUnit?: number;
  quantity?: number;
  hours: number;
  impactValue: number;
}): string {
  const vpu = b.valuePerUnit;
  if (!vpu) return "";
  // Monetary entries (donations, funds raised) are valued pound-for-pound —
  // show the true annual amount rather than a misleading unit formula.
  if (b.unit === "pound") {
    const amount = b.quantity ?? Math.round(b.impactValue / vpu);
    return `£${amount.toLocaleString("en-GB")}/year`;
  }
  const rate = `£${vpu % 1 === 0 ? vpu.toFixed(0) : vpu.toFixed(2)}`;
  if (b.unit === "hour" || !b.unit) {
    return `${Math.round(b.hours).toLocaleString("en-GB")} hrs × ${rate}/hr`;
  }
  const qty = b.quantity ?? (vpu > 0 ? Math.round(b.impactValue / vpu) : 0);
  const unitLabel = b.unitLabel ?? b.unit;
  let sing = unitLabel;
  if (unitLabel === "hours") sing = "hr";
  else if (unitLabel === "miles") sing = "mile";
  else if (unitLabel === "weeks per year") sing = "week";
  else if (unitLabel === "people helped" || unitLabel === "people") sing = "person";
  else if (unitLabel === "young people") sing = "young person";
  else if (unitLabel === "children") sing = "child";
  else if (unitLabel.endsWith("s") && unitLabel.length > 2) sing = unitLabel.slice(0, -1);
  return `${qty.toLocaleString("en-GB")} ${unitLabel} × ${rate}/${sing}`;
}
