import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Calendar, MapPin, Clock, X, ChevronRight, Loader2 } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface UpcomingEvent {
  id: number;
  sourceId: string;
  title: string;
  location: string | null;
  startsAt: string;
  endsAt: string;
}

interface PromptEvent {
  id: number;
  sourceId: string;
  title: string;
  location: string | null;
  startsAt: string;
  endsAt: string;
  durationHours: number;
  status: "pending" | "shown";
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const isTomorrow =
    d.getDate() === tomorrow.getDate() &&
    d.getMonth() === tomorrow.getMonth() &&
    d.getFullYear() === tomorrow.getFullYear();

  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (isToday) return `Today · ${time}`;
  if (isTomorrow) return `Tomorrow · ${time}`;
  const date = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  return `${date} · ${time}`;
}

export default function CalendarHomeWidget() {
  const [upcoming, setUpcoming] = useState<UpcomingEvent[] | null>(null);
  const [prompts, setPrompts] = useState<PromptEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissingId, setDismissingId] = useState<number | null>(null);

  const load = async () => {
    try {
      const [upRes, prRes] = await Promise.all([
        fetch(`${BASE}/api/calendar/upcoming`, { credentials: "include" }),
        fetch(`${BASE}/api/calendar/prompts`, { credentials: "include" }),
      ]);
      if (upRes.ok) {
        const data = await upRes.json();
        setUpcoming(data.events ?? []);
      } else {
        setUpcoming([]);
      }
      if (prRes.ok) {
        const data = await prRes.json();
        setPrompts(data.prompts ?? []);
        // Mark fresh prompts as shown so we know the user has seen them.
        for (const p of (data.prompts ?? []) as PromptEvent[]) {
          if (p.status === "pending") {
            fetch(`${BASE}/api/calendar/prompts/${p.id}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ action: "shown" }),
            }).catch(() => {});
          }
        }
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const dismissPrompt = async (id: number) => {
    setDismissingId(id);
    try {
      await fetch(`${BASE}/api/calendar/prompts/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "dismissed" }),
      });
      setPrompts((prev) => prev.filter((p) => p.id !== id));
    } finally {
      setDismissingId(null);
    }
  };

  const logPromptHref = (p: PromptEvent) =>
    `/wizard/actions?fromCalendar=${p.id}&title=${encodeURIComponent(p.title)}&hours=${encodeURIComponent(
      String(Math.max(1, Math.round(p.durationHours))),
    )}`;

  if (loading) return null;

  const hasContent = (upcoming && upcoming.length > 0) || prompts.length > 0;
  if (!hasContent) return null;

  return (
    <div style={{ background: "var(--brand-cream)", padding: "16px 5%" }}>
      <div style={{ maxWidth: 980, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12 }}>
        {prompts.length > 0 ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 overflow-hidden">
            <div className="px-4 py-3 border-b border-amber-200 flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-700" aria-hidden="true" />
              <p className="text-sm font-semibold text-amber-900">
                {prompts.length === 1 ? "Did you log this?" : "Did you log these?"}
              </p>
            </div>
            <ul className="divide-y divide-amber-100">
              {prompts.map((p) => (
                <li key={p.id} className="px-4 py-3 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-amber-900 truncate">{p.title}</p>
                    <p className="text-xs text-amber-800 mt-0.5">
                      {formatWhen(p.startsAt)} · {p.durationHours} hr
                      {p.location ? ` · ${p.location}` : ""}
                    </p>
                  </div>
                  <Link
                    href={logPromptHref(p)}
                    className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 text-white hover:bg-amber-700"
                  >
                    Log it <ChevronRight className="w-3 h-3" aria-hidden="true" />
                  </Link>
                  <button
                    onClick={() => dismissPrompt(p.id)}
                    disabled={dismissingId === p.id}
                    aria-label="Dismiss"
                    className="shrink-0 p-1 rounded text-amber-600 hover:text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                  >
                    {dismissingId === p.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <X className="w-3.5 h-3.5" aria-hidden="true" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {upcoming && upcoming.length > 0 ? (
          <div className="rounded-2xl border border-border bg-white overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                <p className="text-sm font-semibold text-foreground">Upcoming volunteering</p>
              </div>
              <Link
                href="/settings"
                className="text-xs font-semibold text-primary hover:underline"
              >
                Manage
              </Link>
            </div>
            <ul className="divide-y divide-border">
              {upcoming.slice(0, 3).map((e) => (
                <li key={e.id} className="px-4 py-3">
                  <p className="text-sm font-semibold text-foreground truncate">{e.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3 h-3" aria-hidden="true" />
                      {formatWhen(e.startsAt)}
                    </span>
                    {e.location ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-3 h-3" aria-hidden="true" />
                          <span className="truncate max-w-[200px]">{e.location}</span>
                        </span>
                      </>
                    ) : null}
                  </p>
                </li>
              ))}
            </ul>
            {upcoming.length > 3 ? (
              <div className="px-4 py-2 border-t border-border bg-muted/30">
                <p className="text-xs text-muted-foreground">
                  +{upcoming.length - 3} more in the next 30 days
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
