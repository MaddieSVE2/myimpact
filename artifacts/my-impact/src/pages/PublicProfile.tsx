import { useEffect, useState } from "react";
import { useRoute, Link } from "wouter";
import { Globe, Clock, TrendingUp, Tag, BookOpen, AlertCircle, Loader2, ChevronRight } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface ProfileData {
  slug: string;
  displayName: string | null;
  customMessage: string | null;
  showHours: boolean;
  showSroi: boolean;
  showCategories: boolean;
  showJournalHighlights: boolean;
}

interface Stats {
  totalHours: number | null;
  totalSroi: number | null;
  categoryHours: Record<string, number> | null;
}

interface JournalHighlight {
  text: string;
  createdAt: string;
}

interface PublicProfileResponse {
  profile: ProfileData;
  stats: Stats;
  journalHighlights: JournalHighlight[];
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `£${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 1_000) return `£${(value / 1_000).toFixed(0)}k`;
  return `£${value.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

export default function PublicProfile() {
  const [, params] = useRoute("/profile/:slug");
  const slug = params?.slug ?? "";

  const [data, setData] = useState<PublicProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setNotFound(false);
    setError(false);

    fetch(`${BASE}/api/public-profile/${encodeURIComponent(slug)}`)
      .then(async (res) => {
        if (res.status === 404) { setNotFound(true); return; }
        if (res.status === 429) { setError(true); return; }
        if (!res.ok) { setError(true); return; }
        const json = await res.json();
        setData(json);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: "rgba(232,99,58,0.10)" }}>
          <Globe className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-2xl font-display font-bold text-foreground">Profile not found</h1>
        <p className="text-muted-foreground text-sm max-w-sm">
          This profile doesn't exist, has been disabled, or the account has been deleted.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
        >
          Go to My Impact <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
        <AlertCircle className="w-10 h-10 text-destructive" />
        <p className="text-sm text-muted-foreground">Something went wrong loading this profile. Please try again later.</p>
      </div>
    );
  }

  if (!data) return null;

  const { profile, stats, journalHighlights } = data;
  const displayName = profile.displayName || "Someone";
  const topCategories = profile.showCategories && stats.categoryHours
    ? Object.entries(stats.categoryHours)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 6)
    : [];

  const hasAnyStats = (profile.showHours && stats.totalHours != null) ||
    (profile.showSroi && stats.totalSroi != null) ||
    topCategories.length > 0;

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: "rgba(232,99,58,0.10)" }}>
          <Globe className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-2xl font-display font-bold text-foreground mb-1">{displayName}</h1>
        <p className="text-sm text-muted-foreground">My Social Impact</p>
      </div>

      {/* Custom message */}
      {profile.customMessage && profile.customMessage.trim() && (
        <div className="mb-6 p-5 rounded-2xl bg-white border border-border shadow-sm">
          <p className="text-sm text-foreground leading-relaxed italic">
            &ldquo;{profile.customMessage.trim()}&rdquo;
          </p>
        </div>
      )}

      {/* Stats */}
      {hasAnyStats && (
        <div className="mb-6 space-y-3">
          {(profile.showHours || profile.showSroi) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {profile.showHours && stats.totalHours != null && (
                <div className="bg-white rounded-2xl border border-border shadow-sm p-5 flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(232,99,58,0.10)" }}>
                    <Clock className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">{stats.totalHours.toLocaleString("en-GB")}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Total volunteering hours</p>
                  </div>
                </div>
              )}
              {profile.showSroi && stats.totalSroi != null && (
                <div className="bg-white rounded-2xl border border-border shadow-sm p-5 flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(232,99,58,0.10)" }}>
                    <TrendingUp className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">{formatCurrency(stats.totalSroi)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Social return on investment</p>
                    <p className="text-xs text-muted-foreground mt-0.5">estimated social value created</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Categories */}
          {topCategories.length > 0 && (
            <div className="bg-white rounded-2xl border border-border shadow-sm p-5">
              <div className="flex items-center gap-2 mb-4">
                <Tag className="w-4 h-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">Activity areas</h2>
              </div>
              <div className="space-y-2">
                {topCategories.map(([category, hours]) => {
                  const totalCatHours = topCategories.reduce((s, [, h]) => s + h, 0);
                  const pct = totalCatHours > 0 ? Math.round((hours / totalCatHours) * 100) : 0;
                  return (
                    <div key={category}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-foreground">{category}</span>
                        <span className="text-xs text-muted-foreground">{hours} hrs</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, background: "#F06127" }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {!hasAnyStats && (
        <div className="mb-6 p-5 rounded-2xl bg-white border border-border shadow-sm text-center">
          <p className="text-sm text-muted-foreground">No impact data to show yet.</p>
        </div>
      )}

      {/* Journal highlights */}
      {profile.showJournalHighlights && journalHighlights.length > 0 && (
        <div className="mb-6 bg-white rounded-2xl border border-border shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <BookOpen className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Journal highlights</h2>
          </div>
          <div className="space-y-3">
            {journalHighlights.map((entry, i) => (
              <div key={i} className="border-l-2 pl-3" style={{ borderColor: "#F06127" }}>
                <p className="text-sm text-foreground leading-relaxed">{entry.text}</p>
                <p className="text-xs text-muted-foreground mt-1">{formatDate(entry.createdAt)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer attribution */}
      <div className="text-center">
        <p className="text-xs text-muted-foreground">
          Powered by{" "}
          <Link href="/" className="text-primary hover:underline font-medium">
            My Impact
          </Link>
          {" "}— measure and share your social impact
        </p>
      </div>
    </div>
  );
}
