import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { NoIndexMeta } from "@/components/PageMeta";

const ADMIN_EMAILS = [
  "hello@myimpact.uk",
  "maddie@socialvalueengine.com",
  "ivan.annibal@roseregeneration.co.uk",
];

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Proxy {
  id: number;
  title: string;
  value: string;
  unit: string;
  sourceYear: string;
  horizon: string;
  deflationFactor: number;
  allowedUnits: string[];
  enabled: boolean;
  updatedBy: string | null;
}

const HORIZONS = ["per_instance", "annual", "multi_year", "lifetime"] as const;
const HORIZON_LABELS: Record<string, string> = {
  per_instance: "One-off",
  annual: "Annual",
  multi_year: "Multi-year",
  lifetime: "Lifetime",
};
const UNITS = ["hour", "session", "person", "item", "household"] as const;

const gbp = (n: number) =>
  n.toLocaleString("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 2 });

function ProxyRowEditor({ proxy, onSaved }: { proxy: Proxy; onSaved: (p: Proxy) => void }) {
  const [factor, setFactor] = useState(String(proxy.deflationFactor));
  const [horizon, setHorizon] = useState(proxy.horizon);
  const [units, setUnits] = useState<string[]>(proxy.allowedUnits);
  const [enabled, setEnabled] = useState(proxy.enabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);

  const factorNum = parseFloat(factor);
  const factorValid = isFinite(factorNum) && factorNum > 0 && factorNum <= 1;
  const rawValue = parseFloat(proxy.value);
  const deflated = factorValid ? rawValue * factorNum : rawValue;

  const dirty =
    factorNum !== proxy.deflationFactor ||
    horizon !== proxy.horizon ||
    enabled !== proxy.enabled ||
    units.slice().sort().join(",") !== proxy.allowedUnits.slice().sort().join(",");

  const toggleUnit = (u: string) =>
    setUnits((prev) => (prev.includes(u) ? prev.filter((x) => x !== u) : [...prev, u]));

  const save = async () => {
    if (!factorValid || units.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`${BASE}/api/admin/proxies/${proxy.id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deflationFactor: factorNum, horizon, allowedUnits: units, enabled }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Save failed");
      onSaved(data.proxy as Proxy);
      setFlash(true);
      setTimeout(() => setFlash(false), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`border rounded-lg p-4 space-y-3 ${enabled ? "" : "opacity-60 bg-secondary/30"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-sm">{proxy.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {gbp(rawValue)} per {proxy.unit || "unit"}
            {proxy.sourceYear ? ` · ${proxy.sourceYear}` : ""}
            {proxy.updatedBy ? ` · last edited by ${proxy.updatedBy}` : ""}
          </p>
        </div>
        <label className="flex items-center gap-1.5 text-xs shrink-0 cursor-pointer">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Enabled
        </label>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <label className="text-xs space-y-1">
          <span className="block text-muted-foreground">Horizon</span>
          <select
            value={horizon}
            onChange={(e) => setHorizon(e.target.value)}
            className="border rounded px-2 py-1 text-sm bg-background"
          >
            {HORIZONS.map((h) => (
              <option key={h} value={h}>
                {HORIZON_LABELS[h]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs space-y-1">
          <span className="block text-muted-foreground">Deflation factor (0–1)</span>
          <input
            type="text"
            inputMode="decimal"
            value={factor}
            onChange={(e) => setFactor(e.target.value)}
            className={`border rounded px-2 py-1 text-sm w-24 bg-background ${factorValid ? "" : "border-red-500"}`}
          />
        </label>
        <div className="text-xs">
          <span className="block text-muted-foreground">Applied value</span>
          <span className={`text-sm font-medium ${factorValid && factorNum < 1 ? "text-emerald-700" : ""}`}>
            {factorValid ? gbp(deflated) : "—"}
          </span>
        </div>
        <div className="text-xs space-y-1">
          <span className="block text-muted-foreground">Allowed units</span>
          <div className="flex flex-wrap gap-1">
            {UNITS.map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => toggleUnit(u)}
                className={`px-2 py-0.5 rounded-full border text-xs ${
                  units.includes(u)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground"
                }`}
              >
                {u}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={!dirty || saving || !factorValid || units.length === 0}
          className="ml-auto px-3 py-1.5 rounded bg-primary text-primary-foreground text-sm disabled:opacity-40"
        >
          {saving ? "Saving…" : flash ? "Saved ✓" : "Save"}
        </button>
      </div>
      {units.length === 0 && <p className="text-xs text-red-600">Select at least one allowed unit.</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

export default function AdminProxies() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const isAdmin = user && ADMIN_EMAILS.includes(user.email.toLowerCase());

  const [proxies, setProxies] = useState<Proxy[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [horizon, setHorizon] = useState("");
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const limit = 25;
  const pageCount = Math.max(1, Math.ceil(total / limit));

  useEffect(() => {
    if (isLoading) return;
    if (!user || !isAdmin) setLocation("/", { replace: true });
  }, [isLoading, user, isAdmin, setLocation]);

  useEffect(() => {
    if (isLoading || !user || !isAdmin) return;
    setFetching(true);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search) params.set("search", search);
    if (horizon) params.set("horizon", horizon);
    fetch(`${BASE}/api/admin/proxies?${params}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Failed to load proxies"))))
      .then((data) => {
        setProxies(data.proxies);
        setTotal(data.total);
        setError(null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setFetching(false));
  }, [isLoading, user, isAdmin, page, search, horizon]);

  if (isLoading || !user || !isAdmin) return null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <NoIndexMeta />
      <div>
        <Link href="/admin" className="text-sm text-muted-foreground hover:underline">
          ← Back to admin
        </Link>
        <h1 className="text-2xl font-bold mt-2">Financial proxies</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Manage the proxy bank used by the AI matcher for custom activities. Long-horizon proxies
          (lifetime and multi-year outcomes) are deflated so a single contribution only claims a
          defensible share of the full value. Disabled proxies are never offered to the matcher.
        </p>
      </div>

      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setSearch(searchInput.trim());
        }}
      >
        <input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search proxies…"
          className="border rounded px-3 py-1.5 text-sm bg-background flex-1 min-w-48"
        />
        <select
          value={horizon}
          onChange={(e) => {
            setPage(1);
            setHorizon(e.target.value);
          }}
          className="border rounded px-2 py-1.5 text-sm bg-background"
        >
          <option value="">All horizons</option>
          {HORIZONS.map((h) => (
            <option key={h} value={h}>
              {HORIZON_LABELS[h]}
            </option>
          ))}
        </select>
        <button type="submit" className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-sm">
          Search
        </button>
      </form>

      {fetching ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : proxies.length === 0 ? (
        <p className="text-sm text-muted-foreground">No proxies match.</p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {total.toLocaleString()} proxies · page {page} of {pageCount}
          </p>
          <div className="space-y-3">
            {proxies.map((p) => (
              <ProxyRowEditor
                key={p.id}
                proxy={p}
                onSaved={(updated) =>
                  setProxies((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
                }
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1.5 rounded border text-sm disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= pageCount}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 rounded border text-sm disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}
