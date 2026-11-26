import { useState } from "react";
import { Link } from "wouter";
import { ArrowRight, Building2 } from "lucide-react";
import { useShareableRecords, type ShareableRecord } from "@/lib/shareable-records";

const COLLAPSED_COUNT = 3;

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function recordSummary(r: ShareableRecord): string {
  const when = r.reportPeriod
    ? `${formatDate(r.reportPeriod.start)} to ${formatDate(r.reportPeriod.end)}`
    : formatDate(r.entryDate);
  const parts = [when, `${r.activityCount} ${r.activityCount === 1 ? "activity" : "activities"}`];
  if (r.totalHours > 0) parts.push(`${r.totalHours} hrs`);
  parts.push(`£${r.totalValue.toLocaleString("en-GB", { maximumFractionDigits: 0 })} social value`);
  return parts.join(" · ");
}

/**
 * Offers the records a member saved before joining (or before their automatic
 * sharing started) for Review & share, so they are never entered again.
 * Renders nothing when there is nothing left to share.
 */
export function ShareSavedRecordsCard({ testIdPrefix }: { testIdPrefix: "home" | "member" | "joined" }) {
  const { data } = useShareableRecords();
  const [showAll, setShowAll] = useState(false);

  const org = data?.org;
  const records = data?.records ?? [];
  if (!org || records.length === 0) return null;

  const visible = showAll ? records : records.slice(0, COLLAPSED_COUNT);
  const count = records.length;
  const noun = count === 1 ? "record" : "records";

  return (
    <section
      className="bg-white border border-primary/30 rounded-2xl p-5 sm:p-6 shadow-sm text-left"
      data-testid={`${testIdPrefix}-share-saved-records`}
    >
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Building2 className="w-5 h-5 text-primary" aria-hidden="true" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground">Share what you've already recorded</h3>
          <p className="text-sm text-muted-foreground leading-relaxed mt-0.5">
            {org.dataSharingMode === "consented_logging"
              ? `You have ${count} saved ${noun} dated before you started sharing with ${org.name}, so ${count === 1 ? "it is" : "they are"} not shared yet. `
              : `You have ${count} saved ${noun} that you have not sent to ${org.name}. `}
            You don't need to enter anything again: check what's in a record, choose what to send, and your personal record stays as it is.
          </p>
        </div>
      </div>

      <ul className="divide-y divide-border border border-border rounded-xl overflow-hidden">
        {visible.map(r => (
          <li
            key={r.id}
            className="flex items-center gap-3 px-4 py-3 flex-wrap"
            data-testid={`${testIdPrefix}-shareable-record-${r.id}`}
          >
            <div className="flex-1 min-w-[12rem]">
              <p className="text-sm font-medium text-foreground">{r.name}</p>
              <p className="text-xs text-muted-foreground">{recordSummary(r)}</p>
            </div>
            <Link
              href={`/org/share-report/${r.id}`}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors"
              aria-label={`Review and share ${r.name}`}
              data-testid={`${testIdPrefix}-link-share-record-${r.id}`}
            >
              Review &amp; share <ArrowRight className="w-3 h-3" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>

      {count > COLLAPSED_COUNT && (
        <button
          type="button"
          onClick={() => setShowAll(v => !v)}
          className="mt-3 text-xs font-semibold text-primary hover:underline"
          aria-expanded={showAll}
          data-testid={`${testIdPrefix}-toggle-shareable-records`}
        >
          {showAll ? "Show fewer" : `Show all ${count}`}
        </button>
      )}
    </section>
  );
}
