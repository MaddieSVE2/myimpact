import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Footer } from "@/components/layout/Footer";
import {
  Filter, Search, EyeOff, ChevronLeft, ChevronRight, BadgeCheck, AlertCircle, Users, Info, Download,
} from "lucide-react";
import {
  DEMO_ORG_ID, DEMO_ACTIVITIES, DEMO_MEMBERS,
  getDemoMember, getRemovedMemberIds, ALL_CATEGORIES,
  type ActivityCategory,
} from "@/lib/org-demo-mock";
import { useMyOrg, BASE } from "@/lib/org-export";
import { useOrgPeriod } from "@/hooks/useOrgPeriod";
import { OrgPeriodNavigator } from "@/components/OrgPeriodNavigator";

const PAGE_SIZE = 10;

function parseCategory(v: string): "all" | ActivityCategory {
  if ((ALL_CATEGORIES as string[]).includes(v)) return v as ActivityCategory;
  return "all";
}

const CATEGORY_PROXY: Record<ActivityCategory, string> = {
  "Environment":        "Wildlife Trusts wage-replacement proxy (2022)",
  "Community":          "HACT Social Value Bank — Community participation (2023)",
  "Health":             "Sport England / NEF wellbeing valuation (2022)",
  "Education":          "Pro Bono Economics / Power to Change literacy proxy (2022)",
  "Sport & Active":     "Sport England wellbeing SROI model (2023)",
  "Fundraising":        "NCVO volunteer time at median wage, ONS (2023)",
  "Mentoring":          "Volunteer Scotland Time Well Spent follow-up (2022)",
  "Arts & Culture":     "HACT Social Value Bank — Arts participation (2023)",
  "Animal Welfare":     "RSPCA SROI framework (2022)",
  "Emergency Response": "British Red Cross SROI model (2022)",
};

function calcActivityBreakdown(hours: number, socialValueGBP: number): string {
  if (hours <= 0) return `£${socialValueGBP.toLocaleString("en-GB")} (lump sum)`;
  const rate = socialValueGBP / hours;
  const rateStr = rate % 1 === 0 ? `£${rate.toFixed(0)}` : `£${rate.toFixed(2)}`;
  return `${hours.toLocaleString("en-GB")} hrs × ${rateStr}/hr`;
}

function calcRealBreakdown(hours: number, socialValueGBP: number, valuePerUnit: number, unitLabel: string): string {
  if (valuePerUnit > 0 && unitLabel) {
    const lowerUnit = unitLabel.toLowerCase();
    const isHourBased = lowerUnit.includes("hr") || lowerUnit.includes("hour");
    if (isHourBased && hours > 0) {
      const rateStr = valuePerUnit % 1 === 0 ? `£${valuePerUnit.toFixed(0)}` : `£${valuePerUnit.toFixed(2)}`;
      return `${hours.toLocaleString("en-GB")} hrs × ${rateStr}/hr`;
    }
    if (!isHourBased) {
      const qty = valuePerUnit > 0 ? Math.round(socialValueGBP / valuePerUnit * 100) / 100 : hours;
      const rateStr = valuePerUnit % 1 === 0 ? `£${valuePerUnit.toFixed(0)}` : `£${valuePerUnit.toFixed(2)}`;
      return `${qty.toLocaleString("en-GB")} ${unitLabel} × ${rateStr}`;
    }
  }
  return calcActivityBreakdown(hours, socialValueGBP);
}

interface RealActivity {
  id: string;
  occurredAt: string;
  memberId: string;
  memberName: string;
  memberEmail: string | null;
  category: string;
  activity: string;
  description: string;
  hours: number;
  socialValueGBP: number;
  verified: boolean;
  valuePerUnit: number;
  unitLabel: string;
  proxy: string;
  proxyYear: string;
  source: "member-submitted" | "org-attested";
}

interface RealMember {
  id: string;
  name: string;
  email: string | null;
}

function useRealOrgActivities(enabled: boolean, from: string, to: string) {
  return useQuery<{ activities: RealActivity[]; members: RealMember[] }>({
    queryKey: ["org-activities", from, to],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to)   params.set("to",   to);
      const res = await fetch(`${BASE}/api/org/activities?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load activities");
      return res.json();
    },
    enabled,
  });
}

export default function OrgActivities() {
  const { data: orgData, isLoading, isError } = useMyOrg();

  const [category, setCategory] = useState<"all" | ActivityCategory>("all");
  const [memberId, setMemberId] = useState<"all" | string>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [anonymise, setAnonymise] = useState(false);
  const [openTooltip, setOpenTooltip] = useState<string | null>(null);

  const isManager = orgData?.org?.role === "manager";
  const isDemoOrg = orgData?.org?.id === DEMO_ORG_ID;
  const summaryYearStart = orgData?.org?.summaryYearStart ?? "01-01";
  const { periodOffset, setPeriodOffset, periodBounds, isCurrentPeriod, periodFrom, periodTo } = useOrgPeriod(summaryYearStart, isDemoOrg);

  const [from, setFrom] = useState<string>(() => periodFrom);
  const [to, setTo] = useState<string>(() => periodTo);

  useEffect(() => {
    setFrom(periodFrom);
    setTo(periodTo);
    setPage(1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodFrom, periodTo]);

  useEffect(() => {
    setOpenTooltip(null);
  }, [page, category, memberId, query, from, to]);

  useEffect(() => {
    if (!openTooltip) return;
    function handleMouseDown(e: MouseEvent) {
      const target = e.target as Element;
      if (!target.closest("[data-tooltip-wrapper]")) {
        setOpenTooltip(null);
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [openTooltip]);

  const realFeedEnabled = Boolean(orgData?.org && isManager && !isDemoOrg);
  const { data: realData, isLoading: realLoading } = useRealOrgActivities(realFeedEnabled, from, to);

  const removedIds = useMemo(
    () => isDemoOrg ? new Set(getRemovedMemberIds(DEMO_ORG_ID)) : new Set<string>(),
    [isDemoOrg],
  );

  const demoActivities = useMemo(
    () => DEMO_ACTIVITIES.filter(a => !removedIds.has(a.memberId)),
    [removedIds],
  );

  // For real orgs: build a stable anonymisation index from the members list.
  const realMemberIndex = useMemo<Map<string, number>>(() => {
    const map = new Map<string, number>();
    if (realData?.members) {
      realData.members.forEach((m, idx) => map.set(m.id, idx + 1));
    }
    return map;
  }, [realData?.members]);

  function realMemberLabel(mId: string, anon: boolean): { name: string; email: string } {
    if (anon) {
      const idx = realMemberIndex.get(mId) ?? 0;
      return { name: `Member ${String(idx).padStart(3, "0")}`, email: "Not set" };
    }
    const act = realData?.activities.find(a => a.memberId === mId);
    return {
      name: act?.memberName ?? mId,
      email: act?.memberEmail ?? "",
    };
  }

  const filtered = useMemo(() => {
    if (isDemoOrg) {
      return demoActivities.filter(a => {
        if (category !== "all" && a.category !== category) return false;
        if (memberId !== "all" && a.memberId !== memberId) return false;
        if (from && a.occurredAt < from) return false;
        if (to && a.occurredAt > to) return false;
        if (query) {
          const q = query.toLowerCase();
          const m = getDemoMember(a.memberId);
          const hay = `${a.activity} ${a.description} ${anonymise ? "" : (m?.name ?? "")}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      }).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
    }

    return (realData?.activities ?? []).filter(a => {
      if (category !== "all" && a.category !== category) return false;
      if (memberId !== "all" && a.memberId !== memberId) return false;
      if (query) {
        const q = query.toLowerCase();
        const hay = `${a.activity} ${a.description} ${anonymise ? "" : a.memberName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  }, [isDemoOrg, demoActivities, realData?.activities, category, memberId, from, to, query, anonymise]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function downloadCSV() {
    const headers = ["Date", "Member Name", "Member Email", "Category", "Activity", "Description", "Hours", "Social Value (GBP)", "Verified"];

    const rows = filtered.map(a => {
      const isReal = !isDemoOrg;
      let memberName: string;
      let memberEmail: string;

      if (isReal) {
        const label = realMemberLabel(a.memberId, anonymise);
        memberName = label.name;
        memberEmail = anonymise ? "" : (label.email ?? "");
      } else {
        const demo = getDemoMember(a.memberId);
        if (anonymise) {
          const idx = DEMO_MEMBERS.findIndex(dm => dm.id === a.memberId);
          memberName = `Member ${String(idx + 1).padStart(3, "0")}`;
          memberEmail = "";
        } else {
          memberName = demo?.name ?? a.memberId;
          memberEmail = demo?.email ?? "";
        }
      }

      const date = new Date(a.occurredAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

      return [
        date,
        memberName,
        memberEmail,
        a.category,
        a.activity,
        a.description,
        String(a.hours),
        String(a.socialValueGBP),
        a.verified ? "Yes" : "No",
      ];
    });

    const escape = (v: string) => {
      const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    const csvContent = [headers, ...rows].map(r => r.map(escape).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `activity-feed-${from || "all"}-to-${to || "all"}${anonymise ? "-anonymised" : ""}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  if (isLoading) {
    return <div className="max-w-5xl mx-auto px-4 py-16 flex justify-center">
      <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>;
  }

  if (isError) {
    return <div className="max-w-2xl mx-auto px-4 py-16 text-center">
      <AlertCircle className="w-6 h-6 text-red-500 mx-auto mb-2" />
      <p className="text-base font-semibold mb-1">Could not load your organisation</p>
    </div>;
  }

  if (!orgData?.org) {
    return <div className="max-w-2xl mx-auto px-4 py-20 text-center">
      <p className="text-base font-semibold mb-2">You're not in an organisation yet.</p>
      <Link href="/org" className="text-primary underline">Go to the organisation portal</Link>
    </div>;
  }

  if (!isManager) {
    return <div className="max-w-2xl mx-auto px-4 py-20 text-center">
      <p className="text-base font-semibold mb-2">Manager access required</p>
      <Link href="/org" className="text-primary text-sm underline mt-3 inline-block">Back to your organisation page</Link>
    </div>;
  }

  if (!isDemoOrg && realLoading) {
    return <div className="max-w-5xl mx-auto px-4 py-16 flex justify-center">
      <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>;
  }

  return (
    <>
      <div className="max-w-5xl mx-auto px-4 py-8" data-testid="org-activities-root">
        <div className="flex items-start justify-between gap-3 mb-1">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            <h1 className="text-2xl font-display font-semibold text-foreground">Activity feed</h1>
          </div>
          <OrgPeriodNavigator
            periodOffset={periodOffset}
            setPeriodOffset={setPeriodOffset}
            label={periodBounds.label}
            isCurrentPeriod={isCurrentPeriod}
          />
        </div>
        <p className="text-sm text-muted-foreground mb-5">
          The detailed log of every member action, with names visible by default. Use Anonymise to remove identifying information before sharing.
        </p>


        <div className="bg-white border border-border rounded-xl p-5 mb-6">
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Filters</h3>
              <span className="text-[13px] text-muted-foreground">({filtered.length} {filtered.length === 1 ? "result" : "results"})</span>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <label className="inline-flex items-center gap-1.5 text-[13px] text-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={anonymise}
                  onChange={e => setAnonymise(e.target.checked)}
                  className="rounded border-border"
                  data-testid="checkbox-anonymise"
                />
                <EyeOff className="w-3 h-3" /> Anonymise members
              </label>
              <button
                type="button"
                onClick={downloadCSV}
                disabled={filtered.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-[13px] font-medium hover:bg-muted/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                data-testid="btn-download-csv"
              >
                <Download className="w-3.5 h-3.5" /> Download CSV
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 mb-4">
            <div className="lg:col-span-2 relative">
              <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={query}
                onChange={e => { setQuery(e.target.value); setPage(1); }}
                placeholder="Search description, activity, member…"
                className="w-full pl-8 pr-2 py-1.5 rounded-md border border-border text-[13px] focus:outline-none focus:border-primary"
                data-testid="input-search"
              />
            </div>
            <select value={category} onChange={e => { setCategory(parseCategory(e.target.value)); setPage(1); }} className="px-2 py-1.5 rounded-md border border-border text-[13px] bg-white" data-testid="select-category">
              <option value="all">All categories</option>
              {ALL_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={memberId} onChange={e => { setMemberId(e.target.value); setPage(1); }} className="px-2 py-1.5 rounded-md border border-border text-[13px] bg-white" data-testid="select-member">
              <option value="all">All members</option>
              {isDemoOrg
                ? DEMO_MEMBERS.filter(m => !removedIds.has(m.id)).map(m => (
                    <option key={m.id} value={m.id}>{anonymise ? `Member ${String(DEMO_MEMBERS.findIndex(dm => dm.id === m.id) + 1).padStart(3, "0")}` : m.name}</option>
                  ))
                : (realData?.members ?? []).map((m, idx) => (
                    <option key={m.id} value={m.id}>{anonymise ? `Member ${String(idx + 1).padStart(3, "0")}` : m.name}</option>
                  ))
              }
            </select>
            <div className="flex gap-1">
              <input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1); }} className="flex-1 min-w-0 px-2 py-1.5 rounded-md border border-border text-[13px]" aria-label="From" />
              <input type="date" value={to} onChange={e => { setTo(e.target.value); setPage(1); }} className="flex-1 min-w-0 px-2 py-1.5 rounded-md border border-border text-[13px]" aria-label="To" />
            </div>
          </div>

          {filtered.length === 0 ? (
            <p className="text-[13px] text-muted-foreground text-center py-8">No activities match these filters.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b border-border">
                      <th className="font-semibold uppercase text-[11px] tracking-wider py-2 pr-3 min-w-[96px] whitespace-nowrap">Date</th>
                      <th className="font-semibold uppercase text-[11px] tracking-wider py-2 pr-3 min-w-[130px]">Member</th>
                      <th className="font-semibold uppercase text-[11px] tracking-wider py-2 pr-3 min-w-[110px]">Category</th>
                      <th className="font-semibold uppercase text-[11px] tracking-wider py-2 pr-3 min-w-[160px]">Activity</th>
                      <th className="font-semibold uppercase text-[11px] tracking-wider py-2 pr-3 min-w-[56px] text-right whitespace-nowrap">Hours</th>
                      <th className="font-semibold uppercase text-[11px] tracking-wider py-2 pr-3 min-w-[110px] text-right whitespace-nowrap">Social Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map(a => {
                      const isReal = !isDemoOrg;
                      const m = isReal
                        ? realMemberLabel(a.memberId, anonymise)
                        : (() => {
                            const demo = getDemoMember(a.memberId);
                            if (anonymise) {
                              const idx = DEMO_MEMBERS.findIndex(dm => dm.id === a.memberId);
                              return { name: `Member ${String(idx + 1).padStart(3, "0")}`, email: "" };
                            }
                            return { name: demo?.name ?? a.memberId, email: demo?.email ?? "" };
                          })();

                      const realA = a as RealActivity;
                      const demoA = a as typeof DEMO_ACTIVITIES[number];

                      const proxyText = isReal
                        ? (realA.proxy || "")
                        : CATEGORY_PROXY[(a as typeof DEMO_ACTIVITIES[number]).category as ActivityCategory] ?? "";

                      const breakdownText = isReal
                        ? calcRealBreakdown(realA.hours, realA.socialValueGBP, realA.valuePerUnit, realA.unitLabel)
                        : calcActivityBreakdown(demoA.hours, demoA.socialValueGBP);

                      return (
                        <tr key={a.id} className="border-b border-border/60 align-top hover:bg-muted/20" data-testid={`row-activity-${a.id}`}>
                          <td className="py-2 pr-3 text-muted-foreground whitespace-nowrap">{new Date(a.occurredAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</td>
                          <td className="py-2 pr-3">
                            <p className="font-medium text-foreground">{m.name}</p>
                            {!anonymise && m.email && <p className="text-[11px] text-muted-foreground">{m.email}</p>}
                          </td>
                          <td className="py-2 pr-3"><span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[11px] font-semibold">{a.category}</span></td>
                          <td className="py-2 pr-3 max-w-md">
                            <p className="font-medium text-foreground">{a.activity}</p>
                            <p className="text-[12px] text-muted-foreground leading-snug mt-0.5">{a.description}</p>
                          </td>
                          <td className="py-2 pr-3 text-right whitespace-nowrap">{a.hours}</td>
                          <td className="py-2 pr-3 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1 justify-end">
                              <span className="font-semibold text-foreground">£{a.socialValueGBP.toLocaleString("en-GB")}</span>
                              {a.verified && <BadgeCheck className="w-3 h-3 text-green-600 shrink-0" aria-label="Verified" />}
                              <div className="relative" data-tooltip-wrapper>
                                <button
                                  type="button"
                                  onClick={() => setOpenTooltip(prev => prev === a.id ? null : a.id)}
                                  className="text-muted-foreground hover:text-primary transition-colors"
                                  aria-label="How this value is calculated"
                                  data-testid={`value-info-${a.id}`}
                                >
                                  <Info className="w-3 h-3" />
                                </button>
                                {openTooltip === a.id && (
                                  <div className="absolute right-0 top-5 z-30 w-60 px-3 py-2.5 rounded-md bg-white border border-border shadow-lg text-[12px] text-muted-foreground leading-relaxed">
                                    <p className="font-semibold text-foreground mb-1 tabular-nums">{breakdownText}</p>
                                    {proxyText && <p className="mb-1.5">{proxyText}</p>}
                                    <Link href="/methodology" className="text-primary hover:underline font-medium" data-testid={`methodology-link-${a.id}`} onClick={() => setOpenTooltip(null)}>
                                      Learn about our methodology →
                                    </Link>
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 text-[13px]">
                  <p className="text-muted-foreground">Page {safePage} of {totalPages}</p>
                  <div className="flex gap-1">
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage === 1} className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border disabled:opacity-40">
                      <ChevronLeft className="w-3 h-3" /> Prev
                    </button>
                    <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages} className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border disabled:opacity-40">
                      Next <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <p className="text-[13px] text-muted-foreground">
          Need to share this with funders or your board? Head to{" "}
          <Link href="/org/export" className="text-primary underline">Export</Link>{" "}
          to download a polished PDF or CSV (with optional anonymisation).
        </p>
      </div>
      <Footer />
    </>
  );
}
