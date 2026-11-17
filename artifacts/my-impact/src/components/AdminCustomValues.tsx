import { useState } from "react";
import { Loader2 } from "lucide-react";
import { BASE } from "@/lib/api";

interface Line {
  recordId: number;
  index: number;
  activityId: string;
  entryDate: string;
  isOrgCopy: boolean;
  name: string;
  proxy: string;
  proxyUnit: string;
  unit: string;
  quantity: number;
  hours: number;
  reason: "unrelated" | "unit" | "hours" | "large";
  suggested: boolean;
  removesValue: boolean;
  removesHours: boolean;
  before: number;
  after: number;
}

interface Applied {
  corrected: number;
  entries: number;
  before: number;
  after: number;
}

const pounds = (n: number) => `£${n.toLocaleString("en-GB", { maximumFractionDigits: 2 })}`;
const keyOf = (l: Line) => `${l.recordId}:${l.index}:${l.activityId}`;

function why(l: Line): string {
  switch (l.reason) {
    case "unrelated":
      return "The proxy has no word in common with what they wrote.";
    case "unit":
      return `The proxy is priced per "${l.proxyUnit}", not per ${l.unit}.`;
    case "hours":
      return "Two hours of volunteering were assumed for each item.";
    case "large":
      return "Nothing found wrong, but it's a large value. Tick it if it looks wrong.";
  }
}

function change(l: Line): string {
  if (l.removesValue && l.removesHours) return "Removes the proxy value and the assumed hours.";
  if (l.removesValue) return "Removes the proxy value. The hours stay.";
  return "Removes the assumed hours. The proxy value stays.";
}

/**
 * Corrects activities described in someone's own words that were saved with
 * a value that doesn't stand up (/api/admin/custom-values): a proxy that has
 * nothing to do with the activity, one priced per something else, or two
 * hours of volunteering assumed for each item. Find lists them; the ticked
 * ones are corrected.
 */
export default function AdminCustomValues() {
  const [lines, setLines] = useState<Line[] | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [applied, setApplied] = useState<Applied | null>(null);
  const [busy, setBusy] = useState<"find" | "apply" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const show = (found: Line[]) => {
    setLines(found);
    setTicked(new Set(found.filter((l) => l.suggested).map(keyOf)));
  };

  const find = async () => {
    setBusy("find");
    setError(null);
    setApplied(null);
    try {
      const res = await fetch(`${BASE}/api/admin/custom-values`, { credentials: "include" });
      if (!res.ok) throw new Error(`The server answered ${res.status}.`);
      show(((await res.json()) as { lines: Line[] }).lines);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  };

  const chosen = (lines ?? []).filter((l) => ticked.has(keyOf(l)));
  const before = chosen.reduce((s, l) => s + l.before, 0);
  const after = chosen.reduce((s, l) => s + l.after, 0);

  const apply = async () => {
    if (chosen.length === 0) return;
    const count = `${chosen.length} ${chosen.length === 1 ? "activity" : "activities"}`;
    if (!window.confirm(`Correct ${count}? ${pounds(before)} becomes ${pounds(after)} on members' saved entries.`)) return;
    setBusy("apply");
    setError(null);
    try {
      const res = await fetch(`${BASE}/api/admin/custom-values`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          lines: chosen.map((l) => ({ recordId: l.recordId, index: l.index, activityId: l.activityId })),
        }),
      });
      if (!res.ok) throw new Error(`The server answered ${res.status}.`);
      const body = (await res.json()) as Applied & { lines: Line[] };
      setApplied(body);
      show(body.lines);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  };

  const toggle = (l: Line) =>
    setTicked((old) => {
      const next = new Set(old);
      if (!next.delete(keyOf(l))) next.add(keyOf(l));
      return next;
    });

  return (
    <section className="bg-white border border-border rounded-xl p-5 mb-8" aria-labelledby="custom-values-heading">
      <h2 id="custom-values-heading" className="text-base font-semibold text-foreground">
        Correct activities described in members' own words
      </h2>
      <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
        Before November 2026, an activity someone described themselves could be matched to a proxy that had nothing
        to do with it, priced per household or per tonne for each item, and given two hours of volunteering for each
        item: 75 reused carrier bags came to £16,000. This finds the saved activities affected. Correcting one keeps
        it on the member's record and removes the value that doesn't stand up.
      </p>
      <div className="flex items-center gap-2 mt-4">
        <button
          type="button"
          onClick={() => void find()}
          disabled={busy !== null}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted/30 disabled:opacity-50"
        >
          {busy === "find" && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />} Find them
        </button>
        <button
          type="button"
          onClick={() => void apply()}
          disabled={busy !== null || chosen.length === 0}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--brand-orange)" }}
        >
          {busy === "apply" && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />} Correct the ticked ones
        </button>
      </div>
      {error && <p className="text-sm text-destructive mt-3" role="alert">{error}</p>}
      <div className="mt-4 text-sm" data-testid="custom-values-summary" aria-live="polite">
        {applied && (
          <p className="text-foreground mb-2">
            Corrected <strong>{applied.corrected}</strong> {applied.corrected === 1 ? "activity" : "activities"} in{" "}
            <strong>{applied.entries}</strong> {applied.entries === 1 ? "entry" : "entries"}: {pounds(applied.before)}{" "}
            became {pounds(applied.after)}.
          </p>
        )}
        {lines && lines.length === 0 && <p className="text-foreground">Nothing left to correct or check.</p>}
        {lines && lines.length > 0 && (
          <p className="text-foreground">
            <strong>{chosen.length}</strong> of {lines.length} ticked: {pounds(before)} would become {pounds(after)}.
          </p>
        )}
      </div>
      {lines && lines.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="text-left text-xs w-full">
            <thead>
              <tr className="text-muted-foreground">
                <th className="pr-3 py-1 font-semibold">Correct</th>
                <th className="pr-3 py-1 font-semibold">Entry</th>
                <th className="pr-3 py-1 font-semibold">What they wrote</th>
                <th className="pr-3 py-1 font-semibold">Valued as</th>
                <th className="pr-3 py-1 font-semibold">Why it's listed</th>
                <th className="pr-3 py-1 font-semibold">Now</th>
                <th className="py-1 font-semibold">After</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={keyOf(l)} className="border-t border-border align-top" data-testid="custom-values-line">
                  <td className="pr-3 py-2">
                    <input
                      type="checkbox"
                      checked={ticked.has(keyOf(l))}
                      onChange={() => toggle(l)}
                      aria-label={`Correct "${l.name}" in entry ${l.recordId}`}
                    />
                  </td>
                  <td className="pr-3 py-2 whitespace-nowrap">
                    #{l.recordId}
                    <br />
                    {l.entryDate}
                    {l.isOrgCopy && (
                      <>
                        <br />
                        organisation's copy
                      </>
                    )}
                  </td>
                  <td className="pr-3 py-2 max-w-[16rem]">{l.name}</td>
                  <td className="pr-3 py-2 max-w-[18rem]">
                    {l.proxy || "No proxy"}
                    <br />
                    <span className="text-muted-foreground">
                      {l.unit && l.unit !== "hour" ? `${l.quantity} × ${l.unit}, ` : ""}
                      {l.hours} {l.hours === 1 ? "hour" : "hours"}
                    </span>
                  </td>
                  <td className="pr-3 py-2 max-w-[18rem]">
                    {why(l)}
                    <br />
                    <span className="text-muted-foreground">{change(l)}</span>
                  </td>
                  <td className="pr-3 py-2 whitespace-nowrap">{pounds(l.before)}</td>
                  <td className="py-2 whitespace-nowrap">{pounds(l.after)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
