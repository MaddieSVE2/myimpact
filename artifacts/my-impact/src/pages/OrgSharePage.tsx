import { useEffect, useState } from "react";
import { useRoute, Link } from "wouter";
import { Building2, BarChart2, Users, TrendingUp, Clock, AlertCircle, Loader2, ChevronRight, Lock } from "lucide-react";
import { PageMeta } from "@/components/PageMeta";
import { formatCurrency } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer,
} from "recharts";
import { ImpactTimeline, type MonthlyDataPoint } from "@/components/ImpactTimeline";
import { UKRegionMap, type RegionData } from "@/components/UKRegionMap";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface CostBreakdown {
  recruitment: number | null;
  onboarding: number | null;
  support: number | null;
  admin: number | null;
}

interface ShareInfo {
  slug: string;
  scope: "all" | "summary" | "timeline" | "categories" | "regions";
  funderLabel: string | null;
  expiresAt: string | null;
  orgName: string;
  orgType: string;
  sroiCostPerVolunteer: number | null;
  sroiCostBreakdown: CostBreakdown | null;
  sroiRatio: number | null;
}

interface SummarySection {
  totalSocialValue: number;
  totalHours: number;
  totalMemberCount: number;
  totalUsers: number;
  averageValuePerPerson: number;
}

interface CategoryEntry { category: string; value: number; }

interface ShareResponse {
  share: ShareInfo;
  sections: {
    summary: SummarySection | null;
    monthly: MonthlyDataPoint[] | null;
    valueByCategory: CategoryEntry[] | null;
    regions: RegionData[] | null;
  };
}

function formatExpiry(iso: string | null): string {
  if (!iso) return "no expiry";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const BREAKDOWN_LABELS: Array<{ key: keyof CostBreakdown; label: string }> = [
  { key: "recruitment", label: "Recruitment" },
  { key: "onboarding",  label: "Onboarding" },
  { key: "support",     label: "Support" },
  { key: "admin",       label: "Admin" },
];

function CostBreakdownTable({ breakdown }: { breakdown: CostBreakdown | null }) {
  if (!breakdown) return null;
  const lines = BREAKDOWN_LABELS.filter(({ key }) => typeof breakdown[key] === "number");
  if (lines.length === 0) return null;
  return (
    <table className="w-full text-[13px] mt-3 border-t border-border">
      <tbody>
        {lines.map(({ key, label }) => (
          <tr key={key} className="border-t border-border first:border-0">
            <td className="py-1.5 text-muted-foreground">{label}</td>
            <td className="py-1.5 text-right font-semibold text-foreground">£{(breakdown[key] as number).toLocaleString("en-GB")}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function OrgSharePage() {
  const [, params] = useRoute("/org/share/:slug");
  const slug = params?.slug ?? "";

  const [data, setData] = useState<ShareResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setErrorMsg(null);
    setData(null);

    fetch(`${BASE}/api/org-share/${encodeURIComponent(slug)}`, { credentials: "omit" })
      .then(async (res) => {
        if (res.status === 200) {
          setData(await res.json());
          return;
        }
        const body = await res.json().catch(() => ({}));
        const msg = body && typeof body === "object" && "error" in body && typeof (body as Record<string, unknown>).error === "string"
          ? (body as Record<string, string>).error
          : null;
        if (res.status === 404) setErrorMsg(msg ?? "Share link not found.");
        else if (res.status === 410) setErrorMsg(msg ?? "This share link is no longer valid.");
        else if (res.status === 429) setErrorMsg("Too many requests. Please slow down and try again in a minute.");
        else setErrorMsg(msg ?? "Could not load this share link.");
      })
      .catch(() => setErrorMsg("Could not load this share link. Please try again later."))
      .finally(() => setLoading(false));
  }, [slug]);

  const orgName = data?.share.orgName ?? null;
  const metaSummary = data?.sections.summary ?? null;
  const shareMetaTitle = orgName
    ? `${orgName} — Organisation Impact Report | My Impact`
    : "Organisation Impact Report — My Impact";
  const shareMetaDescription = orgName && metaSummary
    ? `${orgName} has generated £${metaSummary.totalSocialValue.toLocaleString("en-GB")} in social value across ${metaSummary.totalMemberCount.toLocaleString("en-GB")} members. Anonymised impact data shared via My Impact.`
    : "View an organisation's anonymised, aggregated impact data — total social value, volunteer hours, and member activity. Shared via My Impact.";
  const shareMetaCanonical = slug ? `https://myimpact.uk/org/share/${encodeURIComponent(slug)}` : undefined;

  if (loading) {
    return (
      <>
        <PageMeta title={shareMetaTitle} description={shareMetaDescription} canonical={shareMetaCanonical} />
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </>
    );
  }

  if (errorMsg || !data) {
    return (
      <>
        <PageMeta title={shareMetaTitle} description={shareMetaDescription} canonical={shareMetaCanonical} noIndex={true} />
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: "rgba(232,99,58,0.10)" }}>
            <Lock className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-display font-bold text-foreground">Share link unavailable</h1>
          <p className="text-muted-foreground text-sm max-w-sm">{errorMsg ?? "This link is no longer available."}</p>
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
            Visit My Impact <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </>
    );
  }

  const { share, sections } = data;
  const summary = sections.summary;
  const monthly = sections.monthly;
  const categories = sections.valueByCategory;
  const regions = sections.regions;

  const validity = share.expiresAt ? `valid until ${formatExpiry(share.expiresAt)}` : "no expiry set";
  const headerLine = `Shared by ${share.orgName}${share.funderLabel ? ` with ${share.funderLabel}` : ""} · ${validity}`;

  return (
    <>
    <PageMeta title={shareMetaTitle} description={shareMetaDescription} canonical={shareMetaCanonical} />
    <div className="max-w-4xl mx-auto px-4 py-10">
      {/* Header band */}
      <div className="bg-primary/5 border border-primary/20 rounded-xl p-5 mb-6">
        <div className="flex items-start gap-3">
          <div className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(232,99,58,0.15)" }}>
            <Building2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-[13px] font-semibold text-primary uppercase tracking-wider mb-1">Funder share · read only</p>
            <p className="text-sm font-medium text-foreground leading-snug">{headerLine}</p>
          </div>
        </div>
      </div>

      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <h1 className="text-2xl font-display font-semibold text-foreground">{share.orgName}</h1>
          <span className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-[13px] font-semibold capitalize">{share.orgType}</span>
        </div>
        <p className="text-sm text-muted-foreground">Anonymised aggregate impact across members.</p>
      </div>

      {/* Summary tiles */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <div className="bg-primary border border-primary rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-white/70" />
              <p className="text-[13px] font-semibold text-white/70 uppercase tracking-wider">Total social value</p>
            </div>
            <p className="text-2xl font-display font-bold text-white">£{summary.totalSocialValue.toLocaleString("en-GB")}</p>
          </div>
          <div className="bg-white border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-4 h-4 text-primary" />
              <p className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wider">Members</p>
            </div>
            <p className="text-2xl font-display font-bold text-foreground">{summary.totalMemberCount.toLocaleString("en-GB")}</p>
            <p className="text-[13px] text-muted-foreground mt-1">{summary.totalUsers} with saved records</p>
          </div>
          <div className="bg-white border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <BarChart2 className="w-4 h-4 text-primary" />
              <p className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wider">Avg per person</p>
            </div>
            <p className="text-2xl font-display font-bold text-foreground">£{summary.averageValuePerPerson.toLocaleString("en-GB")}</p>
          </div>
          <div className="bg-white border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-primary" />
              <p className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wider">Total hours given</p>
            </div>
            <p className="text-2xl font-display font-bold text-foreground">{Math.round(summary.totalHours).toLocaleString("en-GB")}</p>
            <p className="text-[13px] text-muted-foreground mt-1">volunteering hours</p>
          </div>
        </div>
      )}

      {/* Per-volunteer cost breakdown */}
      {share.sroiCostPerVolunteer !== null && (
        <div className="bg-white border border-border rounded-xl p-5 mb-6">
          <h3 className="text-sm font-semibold text-foreground mb-1">Per-volunteer investment</h3>
          <p className="text-[13px] text-muted-foreground mb-4">The estimated cost this organisation invests per volunteer.</p>
          <div className="flex items-end gap-3 mb-3">
            <p className="text-2xl font-display font-bold text-foreground">£{share.sroiCostPerVolunteer.toLocaleString("en-GB")}</p>
            <p className="text-[13px] text-muted-foreground mb-1">per volunteer</p>
          </div>
          <CostBreakdownTable breakdown={share.sroiCostBreakdown} />
        </div>
      )}

      {/* SROI ratio */}
      {share.sroiRatio !== null && (
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-5 mb-6">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Social return on investment</h3>
          </div>
          <p className="text-[13px] text-muted-foreground mb-3">Social value created for every £1 this organisation invests in its volunteers.</p>
          <p className="text-3xl font-display font-bold text-primary">
            £{share.sroiRatio.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            <span className="text-base font-semibold text-foreground"> social value per £1 invested</span>
          </p>
        </div>
      )}

      {/* Timeline */}
      {monthly && (
        <div className="bg-white border border-border rounded-xl p-5 mb-6">
          <h3 className="text-sm font-semibold text-foreground mb-1">Impact over time</h3>
          <p className="text-[13px] text-muted-foreground mb-4">Cumulative social value generated by members, by month.</p>
          <ImpactTimeline data={monthly} isLoading={false} />
        </div>
      )}

      {/* Categories */}
      {categories && categories.length > 0 && (
        <div className="bg-white border border-border rounded-xl p-5 mb-6">
          <h3 className="text-sm font-semibold text-foreground mb-1">Social value by category</h3>
          <p className="text-[13px] text-muted-foreground mb-4">All data is anonymised: no individual names are shown.</p>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categories} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="category" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={v => `£${(v / 1000).toFixed(1)}k`} />
                <RechartsTooltip formatter={(v: number) => [formatCurrency(v), "Social Value"]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="value" fill="#F06127" radius={[4, 4, 0, 0]} isAnimationActive animationDuration={900} animationEasing="ease-out" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Regions */}
      {regions && (
        <div className="bg-white border border-border rounded-xl p-5 mb-6">
          <h3 className="text-sm font-semibold text-foreground mb-1">Where members are</h3>
          <p className="text-[13px] text-muted-foreground mb-4">Member activity by UK region. Click any shaded area for details.</p>
          {regions.length > 0 ? (
            <>
              <UKRegionMap regions={regions} />
              <div className="mt-4">
                <p className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Region summary</p>
                <div className="space-y-2">
                  {regions.map(r => (
                    <div key={r.region} className="flex items-center gap-3">
                      <div className="w-28 shrink-0">
                        <p className="text-sm font-medium text-foreground">{r.region}</p>
                        <p className="text-[13px] text-muted-foreground">{r.members} members</p>
                      </div>
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-primary/60 transition-all" style={{ width: `${r.pct}%` }} />
                      </div>
                      <p className="w-8 text-right text-sm font-semibold text-foreground shrink-0">{r.pct}%</p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="h-[120px] flex items-center justify-center text-center">
              <p className="text-sm text-muted-foreground">No regional data yet.</p>
            </div>
          )}
        </div>
      )}

      {/* Footer attribution */}
      <div className="text-center pt-4">
        <p className="text-[13px] text-muted-foreground inline-flex items-center gap-1">
          <AlertCircle className="w-3 h-3" aria-hidden="true" />
          This is a read-only snapshot · Powered by{" "}
          <Link href="/" className="text-primary hover:underline font-medium">My Impact</Link>
        </p>
      </div>
    </div>
    </>
  );
}
