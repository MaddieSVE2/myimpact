import { useEffect, useState } from "react";
import { TrendingUp, BarChart3, Users, AlertCircle } from "lucide-react";

interface FunnelStep {
  key: string;
  label: string;
  users: number;
  conversionFromPrev: number | null;
  conversionFromStart: number | null;
}

interface FunnelView {
  id: string;
  title: string;
  description: string;
  windowDays: number;
  steps: FunnelStep[];
}

interface RetentionCohort {
  windowDays: number;
  signups: number;
  d1: number;
  d7: number;
  d30: number;
  d1Pct: number | null;
  d7Pct: number | null;
  d30Pct: number | null;
}

interface EventCount {
  eventName: string;
  surface: string;
  total: number;
}

interface FunnelResponse {
  windowDays: number;
  generatedAt: string;
  eventNames: readonly string[];
  funnels: FunnelView[];
  retention: RetentionCohort;
  eventCounts: EventCount[];
}

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
const WINDOW_OPTIONS = [7, 30, 90];

function FunnelBar({ step, maxUsers }: { step: FunnelStep; maxUsers: number }) {
  const widthPct = maxUsers > 0 ? Math.max(2, (step.users / maxUsers) * 100) : 0;
  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className="w-44 shrink-0 text-sm text-foreground truncate" title={step.label}>{step.label}</div>
      <div className="flex-1 relative h-7 rounded-md bg-secondary/40 overflow-hidden border border-border">
        <div
          className="absolute inset-y-0 left-0 bg-primary/80 transition-all"
          style={{ width: `${widthPct}%` }}
        />
        <div className="absolute inset-0 flex items-center justify-end pr-2 text-xs font-medium text-foreground">
          {step.users}
        </div>
      </div>
      <div className="w-32 text-right text-xs text-muted-foreground">
        {step.conversionFromPrev != null ? (
          <>
            <span className="font-medium text-foreground">{step.conversionFromPrev}%</span>
            <span className="text-muted-foreground"> from prev</span>
          </>
        ) : (
          <span className="italic">start</span>
        )}
      </div>
    </div>
  );
}

function FunnelCard({ funnel }: { funnel: FunnelView }) {
  const max = Math.max(...funnel.steps.map((s) => s.users), 1);
  return (
    <div className="rounded-xl border border-border bg-background p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          {funnel.title}
        </h3>
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          last {funnel.windowDays}d
        </span>
      </div>
      <p className="text-xs text-muted-foreground mb-4">{funnel.description}</p>
      <div className="flex flex-col gap-1">
        {funnel.steps.map((s) => (
          <FunnelBar key={s.key} step={s} maxUsers={max} />
        ))}
      </div>
    </div>
  );
}

function RetentionCard({ retention }: { retention: RetentionCohort }) {
  const cells: { label: string; pct: number | null; count: number }[] = [
    { label: "D1", pct: retention.d1Pct, count: retention.d1 },
    { label: "D7", pct: retention.d7Pct, count: retention.d7 },
    { label: "D30", pct: retention.d30Pct, count: retention.d30 },
  ];
  return (
    <div className="rounded-xl border border-border bg-background p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          Retention (D1 / D7 / D30)
        </h3>
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          last {retention.windowDays}d
        </span>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Of {retention.signups} member signups in the window, the share who logged any
        member-side analytics event around days 1, 7, and 30 after joining.
        Cohorts younger than the bucket are excluded automatically.
      </p>
      <div className="grid grid-cols-3 gap-3">
        {cells.map((c) => (
          <div key={c.label} className="rounded-lg border border-border bg-secondary/30 p-3">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{c.label}</div>
            <div className="text-2xl font-bold text-foreground mt-1">
              {c.pct == null ? "n/a" : `${c.pct}%`}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">{c.count} users</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EventCountsTable({ counts }: { counts: EventCount[] }) {
  if (counts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">
        No analytics events recorded in the window yet.
      </p>
    );
  }
  return (
    <div className="rounded-xl border border-border bg-background overflow-hidden shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-secondary/40">
            <th className="text-left px-4 py-2 font-semibold text-foreground">Event</th>
            <th className="text-left px-4 py-2 font-semibold text-foreground">Surface</th>
            <th className="text-right px-4 py-2 font-semibold text-foreground">Count</th>
          </tr>
        </thead>
        <tbody>
          {counts.map((c, i) => (
            <tr key={`${c.eventName}-${c.surface}-${i}`} className={i % 2 === 0 ? "bg-background" : "bg-secondary/20"}>
              <td className="px-4 py-2 font-mono text-xs text-foreground">{c.eventName}</td>
              <td className="px-4 py-2 text-muted-foreground">
                <span className={c.surface === "org" ? "text-blue-700" : "text-emerald-700"}>{c.surface}</span>
              </td>
              <td className="px-4 py-2 text-right text-foreground font-medium">{c.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminFunnels() {
  const [windowDays, setWindowDays] = useState(30);
  const [data, setData] = useState<FunnelResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`${BASE}/api/analytics/admin/funnels?days=${windowDays}`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setData(d as FunnelResponse);
      })
      .catch((err) => setError(err?.message ?? "Failed to load funnels"))
      .finally(() => setLoading(false));
  }, [windowDays]);

  return (
    <section className="mt-12">
      <div className="flex items-center justify-between flex-wrap gap-4 mb-2">
        <h2 className="text-xl font-display font-bold text-foreground flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-primary" />
          Funnel analytics
        </h2>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Window:</span>
          {WINDOW_OPTIONS.map((d) => (
            <button
              key={d}
              onClick={() => setWindowDays(d)}
              className={`px-3 py-1 rounded-md border transition-colors ${
                windowDays === d
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-foreground border-border hover:border-primary/40"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        Privacy-first internal analytics. No data leaves My Impact servers.
        Member and organisation surfaces are tracked separately.
      </p>

      {error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 text-sm mb-4 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {loading && !data && (
        <p className="text-sm text-muted-foreground">Loading analytics…</p>
      )}

      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {data.funnels.map((f) => (
            <FunnelCard key={f.id} funnel={f} />
          ))}
          <RetentionCard retention={data.retention} />
          <div className="lg:col-span-2">
            <h3 className="text-sm font-semibold text-foreground mb-2 mt-2">Raw event counts (last {data.windowDays}d)</h3>
            <EventCountsTable counts={data.eventCounts} />
          </div>
        </div>
      )}
    </section>
  );
}
