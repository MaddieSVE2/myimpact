/**
 * Custom (free-text, proxy-valued) lines of a saved impact record, read from
 * its stored result breakdowns. Personal records keep custom lines only
 * there (activitiesJson lists the standard activities), and member
 * submissions list them in activitiesJson without their pricing, so the
 * breakdowns are the one place to read a custom line's name and value.
 */
export interface CustomLine {
  activityId: string;
  name: string;
  hours: number;
  quantity: number;
  /** The line's activity value in pounds, as stored. */
  impactValue: number;
  valuePerUnit: number;
  unit: string;
  /** Unit for display: "hrs", "pounds" or the unit itself. */
  unitLabel: string;
  proxy: string;
  proxyYear: string;
}

const positive = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export function isCustomActivityId(id: string): boolean {
  return id.startsWith("custom_");
}

export function customLinesFromResult(resultJson: unknown): CustomLine[] {
  const rj = resultJson as { activityBreakdowns?: unknown } | null;
  const breakdowns = Array.isArray(rj?.activityBreakdowns) ? (rj!.activityBreakdowns as Array<Record<string, unknown>>) : [];
  const lines: CustomLine[] = [];
  for (const b of breakdowns) {
    const activityId = typeof b.activityId === "string" ? b.activityId : "";
    if (!isCustomActivityId(activityId)) continue;
    const name = typeof b.activityName === "string" && b.activityName.trim() ? b.activityName.trim() : "Custom activity";
    const hours = positive(b.hours);
    const quantity = positive(b.quantity);
    const impactValue = positive(b.impactValue);
    const unit = typeof b.unit === "string" ? b.unit : "hour";
    // Older breakdowns lack valuePerUnit: derive it from the stored value.
    let valuePerUnit = positive(b.valuePerUnit);
    if (valuePerUnit === 0 && impactValue > 0) {
      const formulaQty = unit === "hour" || unit === "hour_per_week" ? hours : quantity;
      if (formulaQty > 0) valuePerUnit = impactValue / formulaQty;
    }
    lines.push({
      activityId,
      name,
      hours,
      quantity,
      impactValue,
      valuePerUnit,
      unit,
      unitLabel: unit === "hour" || unit === "hour_per_week" ? "hrs" : unit === "pound" ? "pounds" : unit,
      proxy: typeof b.proxy === "string" ? b.proxy : "",
      proxyYear: typeof b.proxyYear === "string" ? b.proxyYear : "",
    });
  }
  return lines;
}
