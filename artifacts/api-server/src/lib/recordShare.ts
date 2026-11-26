import type { impactRecordsTable } from "@workspace/db";
import { ACTIVITIES } from "./impactData.js";

/**
 * Which of a member's saved personal records can be shared with their
 * organisation through "Review & share", so they never enter one again.
 * Shared by the submit endpoint and the list of records still to share.
 */

type ImpactRecord = typeof impactRecordsTable.$inferSelect;

export type ShareSourceProblem = "not_personal" | "not_a_record";

/** Why `record` can't be the source of a share, or null when it can. */
export function shareSourceProblem(record: ImpactRecord): ShareSourceProblem | null {
  if (record.source === "member-submitted" || record.submittedToOrgId || record.attestedAt) {
    return "not_personal";
  }
  // Saved Full Impact Reports are period-level shareables and quick logs are
  // dated ones. Recurring confirmations, bulk retrospectives and API-attested
  // rows are excluded.
  if (record.kind !== "annual_estimate" && record.kind !== "legacy" && record.kind !== "quick_log") {
    return "not_a_record";
  }
  if (record.kind === "legacy") {
    // kind='legacy' also covers pre-kind quick logs, personal copies of
    // ad-hoc submissions (resultJson.orgRecordId), habit occurrences and
    // share copies. Ambiguous rows are rejected, never guessed at: the only
    // authoritative sign of a historical Full Impact Report is a stored
    // report period, which a dated record never has.
    const rj = record.resultJson as Record<string, unknown> | null;
    const isPersonalSubmissionCopy = rj !== null && typeof rj === "object" && rj.orgRecordId != null;
    const hasAuthoritativePeriod = record.reportStartDate != null && record.reportEndDate != null;
    if (
      !hasAuthoritativePeriod ||
      isPersonalSubmissionCopy ||
      record.habitTemplateId != null ||
      record.sourceReportId != null ||
      (record.source !== "user" && record.source !== "retrospective")
    ) {
      return "not_a_record";
    }
  }
  return null;
}

/**
 * How many lines of `record` an organisation can receive: standard activities
 * with a quantity, and custom lines valued in the stored result. Donations
 * and extra hours stay personal, so a record of only those has none.
 */
export function shareableLineCount(record: Pick<ImpactRecord, "activitiesJson" | "resultJson">): number {
  const ids = new Set<string>();
  const lines = Array.isArray(record.activitiesJson)
    ? (record.activitiesJson as Array<{ activityId?: unknown; quantity?: unknown; hoursPerYear?: unknown }>)
    : [];
  for (const line of lines) {
    const def = ACTIVITIES.find(a => a.id === line.activityId);
    if (!def) continue;
    const amount = Number(def.unit === "hour" ? line.hoursPerYear : line.quantity);
    if (Number.isFinite(amount) && amount > 0) ids.add(def.id);
  }
  const breakdowns = (record.resultJson as { activityBreakdowns?: unknown } | null)?.activityBreakdowns;
  for (const b of (Array.isArray(breakdowns) ? breakdowns : []) as Array<Record<string, unknown>>) {
    const id = typeof b.activityId === "string" ? b.activityId : "";
    if (!id.startsWith("custom_")) continue;
    if (typeof b.activityName !== "string" || !b.activityName.trim()) continue;
    if (Number(b.quantity) > 0 || Number(b.hours) > 0) ids.add(id);
  }
  return ids.size;
}
