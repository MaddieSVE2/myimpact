import { useState } from "react";
import { Loader2 } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Summary {
  entries: number;
  members: number;
  before: number;
  after: number;
  largest: { id: number; entryDate: string; before: number; after: number }[];
  applied?: boolean;
}

const pounds = (n: number) => `£${n.toLocaleString("en-GB", { maximumFractionDigits: 2 })}`;

/**
 * Re-values one-off entries saved when yearly activities (befriending,
 * caring, food waste and the like) counted a full year per entry
 * (/api/admin/revalue-one-off). Preview first; Apply saves the new values.
 */
export default function AdminRevalueOneOff() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [busy, setBusy] = useState<"preview" | "apply" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (method: "GET" | "POST") => {
    setBusy(method === "GET" ? "preview" : "apply");
    setError(null);
    try {
      const res = await fetch(`${BASE}/api/admin/revalue-one-off`, { method, credentials: "include" });
      if (!res.ok) throw new Error(`The server answered ${res.status}.`);
      setSummary(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  };

  const apply = () => {
    if (!summary || summary.entries === 0) return;
    if (!window.confirm(`Re-value ${summary.entries} entries for ${summary.members} members? This changes their saved values.`)) return;
    void run("POST");
  };

  return (
    <section className="bg-white border border-border rounded-xl p-5 mb-8" aria-labelledby="revalue-heading">
      <h2 id="revalue-heading" className="text-base font-semibold text-foreground">Re-value one-off entries</h2>
      <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
        Quick Log entries and regular-activity occurrences saved before 13 October 2026 counted a full year's
        value per person for activities such as befriending or caring, and a year's household saving every time
        for food waste or energy use. This re-values them as one-off entries now are: those activities as
        volunteering time, and each household habit once a year.
      </p>
      <div className="flex items-center gap-2 mt-4">
        <button
          type="button"
          onClick={() => void run("GET")}
          disabled={busy !== null}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted/30 disabled:opacity-50"
        >
          {busy === "preview" && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />} Preview
        </button>
        <button
          type="button"
          onClick={apply}
          disabled={busy !== null || !summary || summary.applied || summary.entries === 0}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--brand-orange)" }}
        >
          {busy === "apply" && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />} Apply
        </button>
      </div>
      {error && <p className="text-sm text-destructive mt-3" role="alert">{error}</p>}
      {summary && (
        <div className="mt-4 text-sm" data-testid="revalue-summary" aria-live="polite">
          {summary.entries === 0 ? (
            <p className="text-foreground">Nothing to re-value: every one-off entry already has its current value.</p>
          ) : (
            <>
              <p className="text-foreground">
                {summary.applied ? "Re-valued" : "Would re-value"} <strong>{summary.entries}</strong>{" "}
                {summary.entries === 1 ? "entry" : "entries"} for <strong>{summary.members}</strong>{" "}
                {summary.members === 1 ? "member" : "members"}: {pounds(summary.before)} in total becomes{" "}
                {pounds(summary.after)}.
              </p>
              <table className="mt-3 text-left text-xs">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="pr-4 py-1 font-semibold">Entry</th>
                    <th className="pr-4 py-1 font-semibold">Date</th>
                    <th className="pr-4 py-1 font-semibold">Before</th>
                    <th className="py-1 font-semibold">After</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.largest.map((c) => (
                    <tr key={c.id}>
                      <td className="pr-4 py-1">#{c.id}</td>
                      <td className="pr-4 py-1">{c.entryDate}</td>
                      <td className="pr-4 py-1">{pounds(c.before)}</td>
                      <td className="py-1">{pounds(c.after)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {summary.largest.length < summary.entries && (
                <p className="text-xs text-muted-foreground mt-1">The {summary.largest.length} largest changes.</p>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
