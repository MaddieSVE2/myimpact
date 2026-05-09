import { useEffect, useMemo, useState } from "react";
import { Calendar, Loader2, Plug, X, RefreshCw, AlertCircle, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Provider = "google" | "microsoft";

interface ConnectorStatus {
  connected: boolean;
  accountEmail: string | null;
  reason?: string;
}

interface StatusResponse {
  google: ConnectorStatus;
  microsoft: ConnectorStatus;
}

interface CalendarOption {
  id: string;
  name: string;
  primary: boolean;
}

interface SourceRow {
  id: string;
  provider: Provider;
  calendarId: string | null;
  calendarName: string | null;
  filterText: string | null;
  status: string;
  providerAccountEmail: string | null;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  createdAt: string;
}

const PROVIDERS: Array<{ id: Provider; label: string; icon: string }> = [
  { id: "google", label: "Google Calendar", icon: "G" },
  { id: "microsoft", label: "Microsoft Outlook", icon: "M" },
];

function formatRelative(iso: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} hr ago`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default function CalendarSyncSection() {
  const { toast } = useToast();
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [picker, setPicker] = useState<{
    provider: Provider;
    calendars: CalendarOption[];
    accountEmail: string | null;
    calendarId: string;
    filterText: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [pickerLoading, setPickerLoading] = useState(false);

  const refresh = async () => {
    try {
      const [statusRes, sourcesRes] = await Promise.all([
        fetch(`${BASE}/api/calendar/status`, { credentials: "include" }),
        fetch(`${BASE}/api/calendar/sources`, { credentials: "include" }),
      ]);
      if (statusRes.ok) setStatus(await statusRes.json());
      if (sourcesRes.ok) {
        const data = await sourcesRes.json();
        setSources(data.sources ?? []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const sourcesByProvider = useMemo(() => {
    const map: Partial<Record<Provider, SourceRow>> = {};
    for (const s of sources) map[s.provider as Provider] = s;
    return map;
  }, [sources]);

  const openPicker = async (provider: Provider) => {
    setPickerLoading(true);
    try {
      const res = await fetch(`${BASE}/api/calendar/calendars/${provider}`, {
        credentials: "include",
      });
      if (res.status === 409) {
        toast({
          title: "Not connected yet",
          description:
            provider === "google"
              ? "Google Calendar needs to be connected by your team admin."
              : "Microsoft Outlook needs to be connected by your team admin.",
          variant: "destructive",
        });
        return;
      }
      if (!res.ok) {
        toast({
          title: "Could not load calendars",
          description: "Please try again.",
          variant: "destructive",
        });
        return;
      }
      const data = await res.json();
      const existing = sourcesByProvider[provider];
      const primary = data.calendars.find((c: CalendarOption) => c.primary) ?? data.calendars[0];
      setPicker({
        provider,
        calendars: data.calendars,
        accountEmail: data.accountEmail,
        calendarId: existing?.calendarId ?? primary?.id ?? "",
        filterText: existing?.filterText ?? "volunteer, mentoring",
      });
    } finally {
      setPickerLoading(false);
    }
  };

  const submitPicker = async () => {
    if (!picker) return;
    setBusy(true);
    try {
      const cal = picker.calendars.find((c) => c.id === picker.calendarId);
      const existing = sourcesByProvider[picker.provider];
      const url = existing
        ? `${BASE}/api/calendar/sources/${existing.id}`
        : `${BASE}/api/calendar/sources`;
      const method = existing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          provider: picker.provider,
          calendarId: picker.calendarId,
          calendarName: cal?.name ?? null,
          filterText: picker.filterText.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          title: "Could not save",
          description: data.error ?? "Please try again.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: existing ? "Calendar updated" : "Calendar connected",
        description: data.warning ?? "We'll show matching events on your home page.",
      });
      setPicker(null);
      refresh();
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async (sourceId: string, providerLabel: string) => {
    if (!confirm(`Disconnect ${providerLabel}? We'll stop syncing events and delete cached items.`)) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${BASE}/api/calendar/sources/${sourceId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        toast({
          title: "Could not disconnect",
          description: "Please try again.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: `${providerLabel} disconnected`,
        description: "Tokens revoked and cached events removed.",
      });
      refresh();
    } finally {
      setBusy(false);
    }
  };

  const resync = async (sourceId: string) => {
    setBusy(true);
    try {
      const res = await fetch(`${BASE}/api/calendar/sources/${sourceId}/sync`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        toast({
          title: "Sync failed",
          description: "Please try again in a moment.",
          variant: "destructive",
        });
        return;
      }
      toast({ title: "Synced", description: "We've pulled the latest matching events." });
      refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="bg-white rounded-2xl border border-border shadow-sm mb-4 overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center gap-2">
        <Calendar className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-foreground">Calendar sync</h2>
      </div>

      <div className="px-5 py-5 space-y-4">
        <p className="text-xs text-muted-foreground leading-relaxed">
          Connect Google Calendar or Outlook to see upcoming volunteering on your home page and get a
          one-tap log prompt two hours after each event ends. We only read events, we'll never write
          back.
        </p>

        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-2">
            {PROVIDERS.map((p) => {
              const source = sourcesByProvider[p.id];
              const connectorStatus = status?.[p.id];
              const isConnected = !!source;
              return (
                <div
                  key={p.id}
                  className="flex items-start gap-3 p-3 rounded-xl border border-border bg-muted/20"
                >
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm shrink-0"
                    style={{
                      background: p.id === "google" ? "#fff" : "#0078d4",
                      color: p.id === "google" ? "#4285F4" : "#fff",
                      border: p.id === "google" ? "1px solid #e5e7eb" : "none",
                    }}
                    aria-hidden="true"
                  >
                    {p.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <p className="text-sm font-medium text-foreground">{p.label}</p>
                      {isConnected ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                          <CheckCircle2 className="w-3 h-3" aria-hidden="true" /> Connected
                        </span>
                      ) : null}
                    </div>
                    {isConnected && source ? (
                      <>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {source.calendarName ?? "Default calendar"}
                          {source.filterText ? ` · filter: "${source.filterText}"` : ""}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Last synced {formatRelative(source.lastSyncedAt)}
                          {source.providerAccountEmail ? ` · ${source.providerAccountEmail}` : ""}
                        </p>
                        {source.lastSyncError ? (
                          <p className="text-xs text-amber-700 mt-1 flex items-start gap-1">
                            <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" aria-hidden="true" />
                            <span className="break-words">{source.lastSyncError}</span>
                          </p>
                        ) : null}
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={() => openPicker(p.id)}
                            disabled={busy || pickerLoading}
                            className="text-xs font-semibold text-primary hover:underline disabled:opacity-50"
                          >
                            Edit calendar / filter
                          </button>
                          <span className="text-muted-foreground text-xs">·</span>
                          <button
                            onClick={() => resync(source.id)}
                            disabled={busy}
                            className="text-xs font-semibold text-primary hover:underline disabled:opacity-50 inline-flex items-center gap-1"
                          >
                            <RefreshCw className="w-3 h-3" aria-hidden="true" /> Sync now
                          </button>
                          <span className="text-muted-foreground text-xs">·</span>
                          <button
                            onClick={() => disconnect(source.id, p.label)}
                            disabled={busy}
                            className="text-xs font-semibold text-destructive hover:underline disabled:opacity-50"
                          >
                            Disconnect
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {connectorStatus?.connected
                            ? "Choose a calendar and (optionally) a title filter."
                            : "Not yet connected on this server."}
                        </p>
                        <button
                          onClick={() => openPicker(p.id)}
                          disabled={busy || pickerLoading}
                          className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
                        >
                          <Plug className="w-3.5 h-3.5" aria-hidden="true" />
                          Connect
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {picker ? (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => !busy && setPicker(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">
                Connect {picker.provider === "google" ? "Google Calendar" : "Outlook"}
              </p>
              <button
                onClick={() => !busy && setPicker(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              {picker.accountEmail ? (
                <p className="text-xs text-muted-foreground">
                  Connected as <span className="font-semibold">{picker.accountEmail}</span>
                </p>
              ) : null}
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5">
                  Calendar to read from
                </label>
                <select
                  value={picker.calendarId}
                  onChange={(e) => setPicker({ ...picker, calendarId: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                >
                  {picker.calendars.length === 0 ? (
                    <option value="">No calendars available</option>
                  ) : null}
                  {picker.calendars.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.primary ? " (primary)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5">
                  Match events whose title contains
                </label>
                <input
                  type="text"
                  value={picker.filterText}
                  onChange={(e) => setPicker({ ...picker, filterText: e.target.value })}
                  placeholder="e.g. volunteer, mentoring"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Comma-separated. Leave blank to include every event in the chosen calendar.
                </p>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-border flex items-center justify-end gap-2 bg-muted/20">
              <button
                onClick={() => !busy && setPicker(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={submitPicker}
                disabled={busy || !picker.calendarId}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                {sourcesByProvider[picker.provider] ? "Save changes" : "Connect & sync"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
