import { useQuery } from "@tanstack/react-query";
import { apiJson } from "@/lib/api";

/** A saved personal record the member can send to their organisation as it is. */
export interface ShareableRecord {
  id: number;
  name: string;
  kind: string;
  /** YYYY-MM-DD */
  entryDate: string;
  /** Set for a full report; a Quick Log entry has only its date. */
  reportPeriod: { start: string; end: string } | null;
  activityCount: number;
  totalHours: number;
  totalValue: number;
}

export interface ShareableRecordsResponse {
  org: { id: string; name: string; dataSharingMode: "explicit_submission" | "consented_logging" } | null;
  records: ShareableRecord[];
}

export const SHAREABLE_RECORDS_KEY = ["org-shareable-records"];

/**
 * The member's saved records that Review & share would accept and their
 * organisation has not been sent: made before they joined, or dated before
 * the day their automatic sharing starts.
 */
export function useShareableRecords(enabled = true) {
  return useQuery<ShareableRecordsResponse>({
    queryKey: SHAREABLE_RECORDS_KEY,
    queryFn: () => apiJson("/api/org/my/shareable-records", { errorMessage: "Failed to load your saved records" }),
    enabled,
  });
}
