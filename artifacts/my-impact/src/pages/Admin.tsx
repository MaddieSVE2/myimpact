import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import AdminFunnels from "@/components/AdminFunnels";
import AdminOrganisations from "@/components/AdminOrganisations";

const ADMIN_EMAILS = [
  "hello@myimpact.uk",
  "maddie@socialvalueengine.com",
  "ivan.annibal@roseregeneration.co.uk",
];

interface AdminUser {
  id: string;
  displayName: string | null;
  email: string;
  createdAt: string;
  distinctPagesVisited: number;
  totalPageViews: number;
  lastVisit: string | null;
}

const USERS_PER_PAGE = 50;

interface VoiceUsageUser {
  userId: string;
  email: string;
  displayName: string | null;
  yearMonth: string;
  transcribeSeconds: number;
  ttsCharacters: number;
  estimatedCostPence: number;
  updatedAt: string;
}

interface AiUsageRow {
  userKey: string;
  questionCount: number;
  toolCalls: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
}

interface AiUsageReport {
  monthStart: string;
  monthEnd: string;
  rows: AiUsageRow[];
  totals: {
    questionCount: number;
    toolCalls: number;
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
  };
  callerCount: number;
  signedInCallers: number;
  total: number;
  page: number;
  totalPages: number;
  budgetAlertUsd?: number;
}

type AiSortKey = "cost" | "questions" | "tokens";
type AiFilter = "all" | "user" | "anon";

interface OrgRequest {
  id: string;
  orgName: string;
  type: string;
  contactName: string;
  contactEmail: string;
  size: string | null;
  purpose: string | null;
  status: string;
  inviteCode: string | null;
  createdAt: string;
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
    approved: "bg-green-100 text-green-800 border-green-200",
    rejected: "bg-red-100 text-red-700 border-red-200",
  };
  const style = styles[status] ?? "bg-secondary text-muted-foreground border-border";
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold border ${style} capitalize`}>
      {status}
    </span>
  );
}

export default function Admin() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userPage, setUserPage] = useState(1);
  const [userTotal, setUserTotal] = useState(0);
  const [userTotalPages, setUserTotalPages] = useState(1);

  const [orgRequests, setOrgRequests] = useState<OrgRequest[]>([]);
  const [orgFetching, setOrgFetching] = useState(true);
  const [orgError, setOrgError] = useState<string | null>(null);
  const [orgPage, setOrgPage] = useState(1);
  const [orgTotal, setOrgTotal] = useState(0);
  const [orgTotalPages, setOrgTotalPages] = useState(1);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [voiceUsers, setVoiceUsers] = useState<VoiceUsageUser[]>([]);
  const [voiceCaps, setVoiceCaps] = useState<{ transcribeSecondsCap: number; ttsCharactersCap: number; yearMonth: string } | null>(null);
  const [voiceFetching, setVoiceFetching] = useState(true);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voicePage, setVoicePage] = useState(1);
  const [voiceTotal, setVoiceTotal] = useState(0);
  const [voiceTotalPages, setVoiceTotalPages] = useState(1);

  const [aiReport, setAiReport] = useState<AiUsageReport | null>(null);
  const [aiFetching, setAiFetching] = useState(true);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiSort, setAiSort] = useState<AiSortKey>("cost");
  const [aiFilter, setAiFilter] = useState<AiFilter>("all");
  const [aiPage, setAiPage] = useState(1);

  const isAdmin = user && ADMIN_EMAILS.includes(user.email.toLowerCase());

  useEffect(() => {
    if (isLoading) return;
    if (!user || !isAdmin) {
      setLocation("/", { replace: true });
    }
  }, [isLoading, user, isAdmin, setLocation]);

  useEffect(() => {
    if (isLoading || !user || !isAdmin) return;
    setOrgFetching(true);
    fetch(`${BASE}/api/admin/org-requests?page=${orgPage}&limit=20`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setOrgRequests(data.requests);
        setOrgTotal(data.total ?? data.requests.length);
        setOrgTotalPages(data.totalPages ?? 1);
      })
      .catch((err) => setOrgError(err.message ?? "Failed to load org requests"))
      .finally(() => setOrgFetching(false));
  }, [isLoading, user, isAdmin, orgPage]);

  useEffect(() => {
    if (isLoading || !user || !isAdmin) return;
    setAiFetching(true);
    fetch(`${BASE}/api/admin/ai-usage?page=${aiPage}&limit=50&sort=${aiSort}&filter=${aiFilter}`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setAiReport(data);
      })
      .catch((err) => setAiError(err.message ?? "Failed to load AI usage"))
      .finally(() => setAiFetching(false));
  }, [isLoading, user, isAdmin, aiPage, aiSort, aiFilter]);

  useEffect(() => {
    if (isLoading || !user || !isAdmin) return;
    setVoiceFetching(true);
    fetch(`${BASE}/api/admin/voice-usage?page=${voicePage}&limit=50`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setVoiceUsers(data.users);
        setVoiceTotal(data.total ?? data.users.length);
        setVoiceTotalPages(data.totalPages ?? 1);
        setVoiceCaps({
          yearMonth: data.yearMonth,
          transcribeSecondsCap: data.transcribeSecondsCap,
          ttsCharactersCap: data.ttsCharactersCap,
        });
      })
      .catch((err) => setVoiceError(err.message ?? "Failed to load voice usage"))
      .finally(() => setVoiceFetching(false));
  }, [isLoading, user, isAdmin, voicePage]);

  useEffect(() => {
    if (isLoading || !user || !isAdmin) return;
    setFetching(true);
    fetch(`${BASE}/api/admin/users?page=${userPage}&limit=${USERS_PER_PAGE}`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setUsers(data.users);
        setUserTotal(data.total ?? data.users.length);
        setUserTotalPages(data.totalPages ?? 1);
      })
      .catch((err) => setError(err.message ?? "Failed to load users"))
      .finally(() => setFetching(false));
  }, [isLoading, user, isAdmin, userPage]);

  async function handleApprove(id: string) {
    setActionLoading(id + "-approve");
    try {
      const r = await fetch(`${BASE}/api/admin/org-requests/${id}/approve`, {
        method: "POST",
        credentials: "include",
      });
      const data = await r.json();
      if (data.error) throw new Error(data.error);
      setOrgRequests((prev) =>
        prev.map((req) =>
          req.id === id ? { ...req, status: "approved", inviteCode: data.inviteCode } : req
        )
      );
      if (data.warning) {
        alert(data.warning);
      }
    } catch (err: unknown) {
      alert((err instanceof Error ? err.message : null) ?? "Failed to approve request");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleReject(id: string) {
    setActionLoading(id + "-reject");
    try {
      const r = await fetch(`${BASE}/api/admin/org-requests/${id}/reject`, {
        method: "POST",
        credentials: "include",
      });
      const data = await r.json();
      if (data.error) throw new Error(data.error);
      setOrgRequests((prev) =>
        prev.map((req) =>
          req.id === id ? { ...req, status: "rejected" } : req
        )
      );
    } catch (err: unknown) {
      alert((err instanceof Error ? err.message : null) ?? "Failed to reject request");
    } finally {
      setActionLoading(null);
    }
  }

  if (isLoading || (!isAdmin && !fetching)) return null;

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-display font-bold text-foreground mb-2">Admin Panel</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Registered users and the pages they have visited.
      </p>

      {error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 text-sm mb-6">
          {error}
        </div>
      )}

      {fetching && !error && (
        <p className="text-sm text-muted-foreground">Loading users...</p>
      )}

      {!fetching && !error && (
        <div className="overflow-x-auto rounded-xl border border-border shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                <th className="text-left px-4 py-3 font-semibold text-foreground">Name</th>
                <th className="text-left px-4 py-3 font-semibold text-foreground">Email</th>
                <th className="text-left px-4 py-3 font-semibold text-foreground">Joined</th>
                <th className="text-left px-4 py-3 font-semibold text-foreground">Pages Visited (last 90 days)</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                    No users found.
                  </td>
                </tr>
              )}
              {users.map((u, idx) => (
                <tr
                  key={u.id}
                  className={idx % 2 === 0 ? "bg-background" : "bg-secondary/20"}
                >
                  <td className="px-4 py-3 text-foreground font-medium">
                    {u.displayName ?? <span className="text-muted-foreground italic">Not set</span>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                    {new Date(u.createdAt).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {u.distinctPagesVisited > 0 ? (
                      <span>
                        {u.distinctPagesVisited} page{u.distinctPagesVisited !== 1 ? "s" : ""}{" "}
                        <span className="text-xs">
                          ({u.totalPageViews} visit{u.totalPageViews !== 1 ? "s" : ""}
                          {u.lastVisit
                            ? `, last ${new Date(u.lastVisit).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
                            : ""})
                        </span>
                      </span>
                    ) : (
                      <span className="italic">None</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between flex-wrap gap-3">
        <p className="text-xs text-muted-foreground">
          {userTotal} user{userTotal !== 1 ? "s" : ""} total
          {userTotalPages > 1 ? ` · page ${userPage} of ${userTotalPages}` : ""}
        </p>
        {userTotalPages > 1 && (
          <div className="flex items-center gap-2" data-testid="admin-users-pagination">
            <button
              onClick={() => setUserPage((p) => Math.max(1, p - 1))}
              disabled={userPage <= 1 || fetching}
              className="px-3 py-1 rounded-md border border-border text-xs text-foreground disabled:opacity-40 hover:border-primary/40"
            >
              Previous
            </button>
            <button
              onClick={() => setUserPage((p) => Math.min(userTotalPages, p + 1))}
              disabled={userPage >= userTotalPages || fetching}
              className="px-3 py-1 rounded-md border border-border text-xs text-foreground disabled:opacity-40 hover:border-primary/40"
            >
              Next
            </button>
          </div>
        )}
      </div>

      <h2 className="text-xl font-display font-bold text-foreground mt-12 mb-2">Sidekick AI usage</h2>
      <p className="text-sm text-muted-foreground mb-6">
        Monthly Sidekick spend, questions and tokens by caller for{" "}
        {aiReport ? new Date(aiReport.monthStart).toLocaleDateString("en-GB", { month: "long", year: "numeric" }) : "this month"}.
        Estimated cost is a rough approximation based on configured per-1K token prices.
      </p>

      {aiError && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 text-sm mb-6">
          {aiError}
        </div>
      )}

      {aiFetching && !aiError && (
        <p className="text-sm text-muted-foreground">Loading AI usage…</p>
      )}

      {!aiFetching && !aiError && aiReport && (() => {
        const totalCost = aiReport.totals.estimatedCostUsd;
        const budget = aiReport.budgetAlertUsd ?? 0;
        const budgetPct = budget > 0 ? Math.min(100, Math.round((totalCost / budget) * 100)) : 0;
        const overBudget = budget > 0 && totalCost >= budget;
        const sorted = aiReport.rows;
        const aiTotal = aiReport.total ?? sorted.length;
        const aiTotalPages = aiReport.totalPages ?? 1;
        return (
          <div data-testid="admin-ai-usage">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4">
              <div className="rounded-xl border border-border bg-background p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Cost to date</p>
                <p className="text-2xl font-bold text-foreground tabular-nums mt-1">${totalCost.toFixed(2)}</p>
                {budget > 0 && (
                  <p className="text-xs text-muted-foreground mt-0.5">of ${budget.toFixed(2)} alert threshold</p>
                )}
              </div>
              <div className="rounded-xl border border-border bg-background p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Questions</p>
                <p className="text-2xl font-bold text-foreground tabular-nums mt-1">{aiReport.totals.questionCount.toLocaleString("en-GB")}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{aiReport.totals.toolCalls.toLocaleString("en-GB")} tool calls</p>
              </div>
              <div className="rounded-xl border border-border bg-background p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Tokens</p>
                <p className="text-2xl font-bold text-foreground tabular-nums mt-1">
                  {(aiReport.totals.inputTokens + aiReport.totals.outputTokens).toLocaleString("en-GB")}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {aiReport.totals.inputTokens.toLocaleString("en-GB")} in / {aiReport.totals.outputTokens.toLocaleString("en-GB")} out
                </p>
              </div>
              <div className="rounded-xl border border-border bg-background p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Callers</p>
                <p className="text-2xl font-bold text-foreground tabular-nums mt-1">{(aiReport.callerCount ?? aiReport.rows.length).toLocaleString("en-GB")}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {aiReport.signedInCallers ?? 0} signed-in
                </p>
              </div>
            </div>

            {budget > 0 && (
              <div className="mb-6" data-testid="admin-ai-budget-bar">
                <div className="flex items-center justify-between mb-1.5 text-xs text-muted-foreground">
                  <span>Budget alert threshold</span>
                  <span className={overBudget ? "font-semibold text-destructive" : "font-medium text-foreground"}>
                    {budgetPct}% used
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
                  <div
                    className={`h-full rounded-full ${overBudget ? "bg-destructive" : budgetPct >= 75 ? "bg-yellow-500" : "bg-green-600"}`}
                    style={{ width: `${budgetPct}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 mb-3">
              <div className="flex items-center gap-1.5 text-xs">
                <label className="text-muted-foreground font-medium">Show:</label>
                <select
                  value={aiFilter}
                  onChange={(e) => { setAiFilter(e.target.value as AiFilter); setAiPage(1); }}
                  className="rounded-md border border-border bg-background px-2 py-1 text-sm"
                  data-testid="admin-ai-filter"
                >
                  <option value="all">All callers</option>
                  <option value="user">Signed-in only</option>
                  <option value="anon">Anonymous only</option>
                </select>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <label className="text-muted-foreground font-medium">Sort by:</label>
                <select
                  value={aiSort}
                  onChange={(e) => { setAiSort(e.target.value as AiSortKey); setAiPage(1); }}
                  className="rounded-md border border-border bg-background px-2 py-1 text-sm"
                  data-testid="admin-ai-sort"
                >
                  <option value="cost">Cost</option>
                  <option value="questions">Questions</option>
                  <option value="tokens">Tokens</option>
                </select>
              </div>
              <span className="text-xs text-muted-foreground ml-auto">
                {aiTotal} caller{aiTotal !== 1 ? "s" : ""} match{aiTotal === 1 ? "es" : ""} this filter
              </span>
            </div>

            {sorted.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No callers match this filter.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border shadow-sm" data-testid="admin-ai-usage-table">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-secondary/50">
                      <th className="text-left px-4 py-3 font-semibold text-foreground">Caller</th>
                      <th className="text-left px-4 py-3 font-semibold text-foreground">Type</th>
                      <th className="text-right px-4 py-3 font-semibold text-foreground">Questions</th>
                      <th className="text-right px-4 py-3 font-semibold text-foreground">Tool calls</th>
                      <th className="text-right px-4 py-3 font-semibold text-foreground">Tokens (in / out)</th>
                      <th className="text-right px-4 py-3 font-semibold text-foreground">Est. cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((row, idx) => {
                      const isUser = row.userKey.startsWith("user:");
                      return (
                        <tr key={row.userKey} className={idx % 2 === 0 ? "bg-background" : "bg-secondary/20"}>
                          <td className="px-4 py-3 text-foreground font-mono text-xs break-all">{row.userKey}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold border ${isUser ? "bg-green-100 text-green-800 border-green-200" : "bg-secondary text-muted-foreground border-border"}`}>
                              {isUser ? "Signed-in" : "Anonymous"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-foreground tabular-nums">{row.questionCount.toLocaleString("en-GB")}</td>
                          <td className="px-4 py-3 text-right text-muted-foreground tabular-nums">{row.toolCalls.toLocaleString("en-GB")}</td>
                          <td className="px-4 py-3 text-right text-muted-foreground tabular-nums text-xs">
                            {row.inputTokens.toLocaleString("en-GB")} / {row.outputTokens.toLocaleString("en-GB")}
                          </td>
                          <td className="px-4 py-3 text-right text-foreground tabular-nums font-medium">${row.estimatedCostUsd.toFixed(4)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-4 flex items-center justify-between flex-wrap gap-3">
              <p className="text-xs text-muted-foreground">
                {aiTotal} caller{aiTotal !== 1 ? "s" : ""}
                {aiTotalPages > 1 ? ` · page ${aiPage} of ${aiTotalPages}` : ""}
              </p>
              {aiTotalPages > 1 && (
                <div className="flex items-center gap-2" data-testid="admin-ai-usage-pagination">
                  <button
                    onClick={() => setAiPage((p) => Math.max(1, p - 1))}
                    disabled={aiPage <= 1 || aiFetching}
                    className="px-3 py-1 rounded-md border border-border text-xs text-foreground disabled:opacity-40 hover:border-primary/40"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setAiPage((p) => Math.min(aiTotalPages, p + 1))}
                    disabled={aiPage >= aiTotalPages || aiFetching}
                    className="px-3 py-1 rounded-md border border-border text-xs text-foreground disabled:opacity-40 hover:border-primary/40"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      <h2 className="text-xl font-display font-bold text-foreground mt-12 mb-2">Organisation Requests</h2>
      <p className="text-sm text-muted-foreground mb-6">
        Approve or reject incoming organisation registration requests.
      </p>

      {orgError && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 text-sm mb-6">
          {orgError}
        </div>
      )}

      {orgFetching && !orgError && (
        <p className="text-sm text-muted-foreground">Loading requests...</p>
      )}

      {!orgFetching && !orgError && orgRequests.length === 0 && (
        <p className="text-sm text-muted-foreground italic">No organisation requests yet.</p>
      )}

      {!orgFetching && !orgError && orgRequests.length > 0 && (
        <div className="flex flex-col gap-4">
          {orgRequests.map((req) => (
            <div
              key={req.id}
              className="rounded-xl border border-border shadow-sm bg-background overflow-hidden"
            >
              <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-border bg-secondary/30">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="min-w-0">
                    <span className="font-semibold text-foreground text-base truncate block">{req.orgName}</span>
                    <span className="text-xs text-muted-foreground">{req.type}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <StatusBadge status={req.status} />
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(req.createdAt).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>
              </div>
              <div className="px-5 py-4 grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                <div>
                  <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Contact</span>
                  <p className="text-foreground mt-0.5">{req.contactName}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Email</span>
                  <p className="text-foreground mt-0.5">
                    <a href={`mailto:${req.contactEmail}`} className="text-primary hover:underline">{req.contactEmail}</a>
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Approx size</span>
                  <p className="text-foreground mt-0.5">{req.size ?? <span className="italic text-muted-foreground">Not specified</span>}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Purpose</span>
                  <p className="text-foreground mt-0.5 line-clamp-2">{req.purpose ?? <span className="italic text-muted-foreground">Not provided</span>}</p>
                </div>
                {req.status === "approved" && req.inviteCode && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Invite code</span>
                    <p className="text-primary font-bold tracking-widest text-lg mt-0.5">{req.inviteCode}</p>
                  </div>
                )}
              </div>
              {req.status === "pending" && (
                <div className="px-5 py-3 border-t border-border flex gap-3">
                  <button
                    onClick={() => handleApprove(req.id)}
                    disabled={actionLoading !== null}
                    className="px-4 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {actionLoading === req.id + "-approve" ? "Approving…" : "Approve"}
                  </button>
                  <button
                    onClick={() => handleReject(req.id)}
                    disabled={actionLoading !== null}
                    className="px-4 py-1.5 rounded-lg bg-destructive/10 hover:bg-destructive/20 text-destructive text-sm font-medium transition-colors border border-destructive/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {actionLoading === req.id + "-reject" ? "Rejecting…" : "Reject"}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 flex items-center justify-between flex-wrap gap-3">
        <p className="text-xs text-muted-foreground">
          {orgTotal} request{orgTotal !== 1 ? "s" : ""} total
          {orgTotalPages > 1 ? ` · page ${orgPage} of ${orgTotalPages}` : ""}
        </p>
        {orgTotalPages > 1 && (
          <div className="flex items-center gap-2" data-testid="admin-org-requests-pagination">
            <button
              onClick={() => setOrgPage((p) => Math.max(1, p - 1))}
              disabled={orgPage <= 1 || orgFetching}
              className="px-3 py-1 rounded-md border border-border text-xs text-foreground disabled:opacity-40 hover:border-primary/40"
            >
              Previous
            </button>
            <button
              onClick={() => setOrgPage((p) => Math.min(orgTotalPages, p + 1))}
              disabled={orgPage >= orgTotalPages || orgFetching}
              className="px-3 py-1 rounded-md border border-border text-xs text-foreground disabled:opacity-40 hover:border-primary/40"
            >
              Next
            </button>
          </div>
        )}
      </div>

      <AdminOrganisations />

      <h2 className="text-xl font-display font-bold text-foreground mt-12 mb-2">Top voice users</h2>
      <p className="text-sm text-muted-foreground mb-6">
        Sidekick voice (transcription + read-aloud) for {voiceCaps?.yearMonth ?? "this month"}. Estimated cost is a rough approximation, not a billed figure.
      </p>

      {voiceError && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 text-sm mb-6">
          {voiceError}
        </div>
      )}

      {voiceFetching && !voiceError && (
        <p className="text-sm text-muted-foreground">Loading voice usage…</p>
      )}

      {!voiceFetching && !voiceError && voiceUsers.length === 0 && (
        <p className="text-sm text-muted-foreground italic">No voice usage recorded yet this month.</p>
      )}

      {!voiceFetching && !voiceError && voiceUsers.length > 0 && voiceCaps && (
        <div className="overflow-x-auto rounded-xl border border-border shadow-sm" data-testid="admin-voice-usage-table">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                <th className="text-left px-4 py-3 font-semibold text-foreground">User</th>
                <th className="text-right px-4 py-3 font-semibold text-foreground">Spoken (sec)</th>
                <th className="text-right px-4 py-3 font-semibold text-foreground">Read aloud (chars)</th>
                <th className="text-right px-4 py-3 font-semibold text-foreground">Est. cost</th>
                <th className="text-left px-4 py-3 font-semibold text-foreground">Cap status</th>
              </tr>
            </thead>
            <tbody>
              {voiceUsers.map((vu, idx) => {
                const transcribePct = Math.min(100, Math.round((vu.transcribeSeconds / Math.max(1, voiceCaps.transcribeSecondsCap)) * 100));
                const ttsPct = Math.min(100, Math.round((vu.ttsCharacters / Math.max(1, voiceCaps.ttsCharactersCap)) * 100));
                const capHit = transcribePct >= 100 || ttsPct >= 100;
                return (
                  <tr
                    key={vu.userId}
                    className={idx % 2 === 0 ? "bg-background" : "bg-secondary/20"}
                  >
                    <td className="px-4 py-3">
                      <p className="text-foreground font-medium">{vu.displayName ?? vu.email}</p>
                      {vu.displayName && (
                        <p className="text-xs text-muted-foreground">{vu.email}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground tabular-nums">
                      {vu.transcribeSeconds.toLocaleString("en-GB")}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground tabular-nums">
                      {vu.ttsCharacters.toLocaleString("en-GB")}
                    </td>
                    <td className="px-4 py-3 text-right text-foreground tabular-nums">
                      £{(vu.estimatedCostPence / 100).toFixed(3)}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <span className="text-muted-foreground">{transcribePct}% / {ttsPct}%</span>
                      {capHit && (
                        <span className="ml-2 inline-block px-1.5 py-0.5 rounded bg-destructive/10 text-destructive text-[10px] font-semibold uppercase">
                          Cap hit
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between flex-wrap gap-3">
        <p className="text-xs text-muted-foreground">
          {voiceTotal} voice user{voiceTotal !== 1 ? "s" : ""} this month
          {voiceTotalPages > 1 ? ` · page ${voicePage} of ${voiceTotalPages}` : ""}
        </p>
        {voiceTotalPages > 1 && (
          <div className="flex items-center gap-2" data-testid="admin-voice-usage-pagination">
            <button
              onClick={() => setVoicePage((p) => Math.max(1, p - 1))}
              disabled={voicePage <= 1 || voiceFetching}
              className="px-3 py-1 rounded-md border border-border text-xs text-foreground disabled:opacity-40 hover:border-primary/40"
            >
              Previous
            </button>
            <button
              onClick={() => setVoicePage((p) => Math.min(voiceTotalPages, p + 1))}
              disabled={voicePage >= voiceTotalPages || voiceFetching}
              className="px-3 py-1 rounded-md border border-border text-xs text-foreground disabled:opacity-40 hover:border-primary/40"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {voiceCaps && (
        <p className="mt-3 text-xs text-muted-foreground">
          Cap per user: {Math.round(voiceCaps.transcribeSecondsCap / 60)} min spoken &middot; {voiceCaps.ttsCharactersCap.toLocaleString("en-GB")} chars read aloud per month.
        </p>
      )}

      <AdminFunnels />
    </div>
  );
}
