import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { Footer } from "@/components/layout/Footer";
import {
  Filter, Search, EyeOff, ChevronLeft, ChevronRight, BadgeCheck, AlertCircle, Users,
} from "lucide-react";
import {
  DEMO_ORG_ID, DEMO_ACTIVITIES, DEMO_MEMBERS,
  getDemoMember, getRemovedMemberIds,
  type ActivityCategory,
} from "@/lib/org-demo-mock";
import { useMyOrg, memberLabel } from "@/lib/org-export";

const PAGE_SIZE = 10;
const CATEGORIES: ActivityCategory[] = ["Environment", "Community", "Health", "Education"];

function parseCategory(v: string): "all" | ActivityCategory {
  if (v === "Environment" || v === "Community" || v === "Health" || v === "Education") return v;
  return "all";
}

export default function OrgActivities() {
  const { data: orgData, isLoading, isError } = useMyOrg();
  const [, setLocation] = useLocation();

  const [category, setCategory] = useState<"all" | ActivityCategory>("all");
  const [memberId, setMemberId] = useState<"all" | string>("all");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [anonymise, setAnonymise] = useState(false);

  const isManager = orgData?.org?.role === "manager";
  const isDemoOrg = orgData?.org?.id === DEMO_ORG_ID;

  useEffect(() => {
    if (orgData?.org && isManager && !isDemoOrg) {
      setLocation("/org", { replace: true });
    }
  }, [orgData?.org, isManager, isDemoOrg, setLocation]);

  const removedIds = useMemo(
    () => isDemoOrg ? new Set(getRemovedMemberIds(DEMO_ORG_ID)) : new Set<string>(),
    [isDemoOrg],
  );

  const allActivities = useMemo(
    () => DEMO_ACTIVITIES.filter(a => !removedIds.has(a.memberId)),
    [removedIds],
  );

  const filtered = useMemo(() => {
    return allActivities.filter(a => {
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
  }, [allActivities, category, memberId, from, to, query, anonymise]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

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

  if (!isDemoOrg) {
    return <div className="max-w-2xl mx-auto px-4 py-16 flex justify-center">
      <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>;
  }

  return (
    <>
    <div className="max-w-5xl mx-auto px-4 py-8" data-testid="org-activities-root">
      <div className="flex items-center gap-2 mb-1">
        <Users className="w-5 h-5 text-primary" />
        <h1 className="text-2xl font-display font-semibold text-foreground">Activity feed</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-5">
        The detailed log of every member action, with names visible by default. Use Anonymise to remove identifying information before sharing.
      </p>


      <div className="bg-white border border-border rounded-xl p-5 mb-6">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Filters</h3>
            <span className="text-xs text-muted-foreground">({filtered.length} {filtered.length === 1 ? "result" : "results"})</span>
          </div>
          <label className="inline-flex items-center gap-1.5 text-xs text-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={anonymise}
              onChange={e => setAnonymise(e.target.checked)}
              className="rounded border-border"
              data-testid="checkbox-anonymise"
            />
            <EyeOff className="w-3 h-3" /> Anonymise members
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 mb-4">
          <div className="lg:col-span-2 relative">
            <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={query}
              onChange={e => { setQuery(e.target.value); setPage(1); }}
              placeholder="Search description, activity, member…"
              className="w-full pl-8 pr-2 py-1.5 rounded-md border border-border text-xs focus:outline-none focus:border-primary"
              data-testid="input-search"
            />
          </div>
          <select value={category} onChange={e => { setCategory(parseCategory(e.target.value)); setPage(1); }} className="px-2 py-1.5 rounded-md border border-border text-xs bg-white" data-testid="select-category">
            <option value="all">All categories</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={memberId} onChange={e => { setMemberId(e.target.value); setPage(1); }} className="px-2 py-1.5 rounded-md border border-border text-xs bg-white" data-testid="select-member">
            <option value="all">All members</option>
            {DEMO_MEMBERS.filter(m => !removedIds.has(m.id)).map(m => (
              <option key={m.id} value={m.id}>{anonymise ? memberLabel(m.id, true).name : m.name}</option>
            ))}
          </select>
          <div className="flex gap-1">
            <input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1); }} className="flex-1 min-w-0 px-2 py-1.5 rounded-md border border-border text-xs" aria-label="From" />
            <input type="date" value={to} onChange={e => { setTo(e.target.value); setPage(1); }} className="flex-1 min-w-0 px-2 py-1.5 rounded-md border border-border text-xs" aria-label="To" />
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">No activities match these filters.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border">
                    <th className="font-semibold uppercase text-[10px] tracking-wider py-2 pr-3">Date</th>
                    <th className="font-semibold uppercase text-[10px] tracking-wider py-2 pr-3">Member</th>
                    <th className="font-semibold uppercase text-[10px] tracking-wider py-2 pr-3">Category</th>
                    <th className="font-semibold uppercase text-[10px] tracking-wider py-2 pr-3">Activity</th>
                    <th className="font-semibold uppercase text-[10px] tracking-wider py-2 pr-3 text-right">Hours</th>
                    <th className="font-semibold uppercase text-[10px] tracking-wider py-2 pr-3 text-right">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map(a => {
                    const m = memberLabel(a.memberId, anonymise);
                    return (
                      <tr key={a.id} className="border-b border-border/60 align-top hover:bg-muted/20" data-testid={`row-activity-${a.id}`}>
                        <td className="py-2 pr-3 text-muted-foreground whitespace-nowrap">{new Date(a.occurredAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</td>
                        <td className="py-2 pr-3">
                          <p className="font-medium text-foreground">{m.name}</p>
                          {!anonymise && m.email && <p className="text-[10px] text-muted-foreground">{m.email}</p>}
                        </td>
                        <td className="py-2 pr-3"><span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-semibold">{a.category}</span></td>
                        <td className="py-2 pr-3 max-w-md">
                          <p className="font-medium text-foreground">{a.activity}</p>
                          <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{a.description}</p>
                        </td>
                        <td className="py-2 pr-3 text-right whitespace-nowrap">{a.hours}</td>
                        <td className="py-2 pr-3 text-right whitespace-nowrap">
                          <span className="font-semibold text-foreground">£{a.socialValueGBP}</span>
                          {a.verified && <BadgeCheck className="inline-block w-3 h-3 text-green-600 ml-1" aria-label="Verified" />}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 text-xs">
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

      <p className="text-xs text-muted-foreground">
        Need to share this with funders or your board? Head to{" "}
        <Link href="/org/export" className="text-primary underline">Export</Link>{" "}
        to download a polished PDF or CSV (with optional anonymisation).
      </p>
    </div>
    <Footer />
    </>
  );
}
