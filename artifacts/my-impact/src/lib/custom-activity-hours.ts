/**
 * Hours of someone's time behind an activity described in their own words,
 * for the amount they entered.
 *
 * Hours are the amount itself, and money is not time. For anything else the
 * analysis estimates the time one of them takes (`hoursPerUnit`): none for an
 * everyday habit, so 75 reused bags are not 150 hours of volunteering. With
 * no estimate (the litter-picking route gives none) it is two hours each,
 * and at least one.
 */
export function customActivityHours(unit: string, quantity: number, hoursPerUnit?: number | null): number {
  if (unit === "hour") return quantity;
  if (unit === "pound") return 0;
  if (typeof hoursPerUnit === "number" && Number.isFinite(hoursPerUnit) && hoursPerUnit >= 0) {
    return Math.round(quantity * hoursPerUnit * 10) / 10;
  }
  return Math.max(1, Math.round(quantity * 2));
}
