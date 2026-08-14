import { useEffect, useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Building2, ArrowRight, X, Eye } from "lucide-react";
import type { ImpactResult } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { useMyOrg, BASE } from "@/lib/org-export";

interface MyConsentResponse {
  consent: { status: string; shareFrom: string } | null;
}

/** Consent for consented-logging orgs; only fetched when relevant. */
function useMyConsent(enabled: boolean) {
  return useQuery<MyConsentResponse>({
    queryKey: ["my-org-consent"],
    enabled,
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/org/my/consent`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });
}

/**
 * Post-log organisation banner, shown on the Results page after a member
 * calculates/saves an entry. Mode-aware:
 *
 * - consented_logging (automatic visibility): the activity is already
 *   visible to the organisation, so asking "share with organisation?" would
 *   be redundant — we show an informational note instead.
 * - explicit_submission: nothing reaches the organisation's named feed
 *   unless the member submits it, so we offer "Review & share": a checklist
 *   pre-populated from the saved report (never the blank submission form),
 *   so the member never re-enters activities or quantities. The shared
 *   record is twin-linked to the report, so org totals are never
 *   double-counted. The personal Impact Report keeps this activity either way.
 */
interface ShareWithOrgPromptProps {
  result: ImpactResult | null;
  /** True once the shown result has been persisted as a record. */
  saved?: boolean;
  /** ISO activity date (YYYY-MM-DD) of the saved/shown entry, when known. */
  entryDate?: string | null;
  /** Id of the saved impact record backing the shown result, when known. */
  savedRecordId?: number | null;
}

export function ShareWithOrgPrompt({ result, saved = false, entryDate = null, savedRecordId = null }: ShareWithOrgPromptProps) {
  const { data: orgData, isLoading: orgLoading } = useMyOrg();
  const consentedOrg = orgData?.org?.dataSharingMode === "consented_logging" && orgData.org.role !== "manager";
  const { data: consentData, isLoading: consentLoading } = useMyConsent(!!consentedOrg);
  const [dismissed, setDismissed] = useState(false);

  // Reset when the user runs a new calculation.
  useEffect(() => {
    setDismissed(false);
  }, [result]);

  if (orgLoading) return null;
  const org = orgData?.org;
  if (!org || org.role === "manager") return null;
  if (!result || dismissed) return null;

  // Automatic visibility: no question — just tell the member what happens.
  // The "will be visible" note must only appear when it is true: the member
  // is an ACTIVE org member with an ACTIVE consent whose shareFrom window
  // covers new activity. Otherwise the record does not meet the server's
  // sharing predicate, so show nothing rather than promise visibility.
  if (org.dataSharingMode === "consented_logging") {
    // Only promise visibility for a record that exists and actually meets
    // the server's sharing predicate (recordInSharedWindow): saved, active
    // membership, active consent, and the record's activity date on/after
    // the consent's shareFrom. Otherwise show nothing.
    if (!saved || consentLoading) return null;
    if (org.membershipStatus && org.membershipStatus !== "active") return null;
    const consent = consentData?.consent;
    if (!consent || consent.status !== "active" || !consent.shareFrom) return null;
    const recordTime = entryDate ? new Date(`${entryDate}T23:59:59Z`).getTime() : NaN;
    if (!Number.isFinite(recordTime) || recordTime < new Date(consent.shareFrom).getTime()) return null;
    return (
      <motion.div
        className="mb-4 bg-muted/40 border border-border rounded-xl px-4 py-3 flex items-start gap-3"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        data-testid="share-with-org-auto-note"
      >
        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <Eye className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground">
            This activity will be visible to <span className="font-semibold">{org.name}</span>.
          </p>
          <p className="text-xs text-muted-foreground">
            You share your logged activity with your organisation automatically. Manage this in the{" "}
            <Link href="/org" className="text-primary hover:underline">Org Portal</Link>.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="text-muted-foreground hover:text-foreground shrink-0"
          data-testid="share-with-org-auto-note-dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </motion.div>
    );
  }

  // Explicit submission: offer "Review & share" from the saved report. The
  // review screen is populated from the persisted record, so it can only be
  // offered once the report has been saved.
  if (!saved || savedRecordId == null) return null;
  return (
    <motion.div
      className="mb-4 bg-card border border-border rounded-xl px-4 py-3 flex items-start gap-3 flex-wrap"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      data-testid="share-with-org-prompt"
    >
      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
        <Building2 className="w-4 h-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">Share activities from this report with {org.name}?</p>
        <p className="text-xs text-muted-foreground">
          Review the activities you just reported and choose what to share — no re-typing.
          Your personal Impact Report keeps everything either way.
        </p>
      </div>
      <div className="flex items-center gap-2 ml-auto">
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="text-xs font-medium text-muted-foreground hover:text-foreground"
          data-testid="share-with-org-not-now"
        >
          Not now
        </button>
        <Link
          href={`/org/share-report/${savedRecordId}`}
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          data-testid="share-with-org-share-link"
        >
          Review &amp; share <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </motion.div>
  );
}
