import { useState, useEffect, useMemo } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Users, Sparkles, ShieldCheck, Code2, Share2, Building2, Check, Trash2, Mail, RefreshCw, Copy, Plus, X, AlertCircle, Loader2, Upload, Palette } from "lucide-react";
import { OrgSsoConfigPanel } from "@/components/OrgSsoConfig";
import { DeveloperApiSection } from "@/components/DeveloperApiSection";
import { ShareLinkManager } from "@/components/ShareLinkManager";
import {
  DEMO_ORG_ID, DEMO_ORG_NAME, DEMO_ORG_TYPE, DEMO_INVITE_CODE,
  DEMO_ORG_CONTACT_EMAIL, DEMO_MEMBERS, DEMO_PENDING_REQUESTS,
  getOrgInviteCode, setOrgInviteCode, generateInviteCode,
  getRemovedMemberIds, setRemovedMemberIds,
  type DemoPendingRequest,
} from "@/lib/org-demo-mock";
import { NumberInput } from "@/components/ui/number-input";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface OrgBranding {
  logoUrl: string | null;
  logoKey: string | null;
  brandPrimary: string | null;
  brandAccent: string | null;
}
interface SroiCostBreakdown {
  recruitment: number | null;
  onboarding: number | null;
  support: number | null;
  admin: number | null;
}
interface MyOrgResponse { org: { id: string; name: string; type: string; role: string; membershipStatus?: string; aiSidekickEnabled: boolean; challengeLeaderboardEnabled: boolean; sroiCostPerVolunteer: number | null; sroiCostBreakdown?: SroiCostBreakdown; branding?: OrgBranding; allowedDomain?: string | null } | null }

const DEFAULT_SROI_COST_PER_VOLUNTEER = 475;

function useMyOrg() {
  return useQuery<MyOrgResponse>({
    queryKey: ["my-org"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/org/my`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });
}

type TabKey = "members" | "ai" | "sso" | "developer" | "share" | "profile";

const TABS: Array<{ key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { key: "members",   label: "Members",     icon: Users },
  { key: "ai",        label: "AI features", icon: Sparkles },
  { key: "sso",       label: "SSO",         icon: ShieldCheck },
  { key: "developer", label: "Developer",   icon: Code2 },
  { key: "share",     label: "Share links", icon: Share2 },
  { key: "profile",   label: "Org profile", icon: Building2 },
];

interface PendingInvite { id: string; email: string; sentAt: string; resentAt: string | null }

interface LiveMember {
  userId: string;
  name: string;
  email: string;
  role: string;
  status: string;
  joinedAt: string;
  postcode: string | null;
}

interface LiveMembersResponse {
  members: LiveMember[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

function AllowedDomainField({ initialDomain, isDemoOrg }: { initialDomain: string | null; isDemoOrg: boolean }) {
  const [domain, setDomain] = useState(initialDomain ?? "");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const qc = useQueryClient();

  const flash = (msg: string) => { setToast(msg); window.setTimeout(() => setToast(null), 2200); };

  async function save() {
    if (isDemoOrg) { flash("Saved (demo)."); return; }
    setSaving(true); setError(null);
    try {
      const res = await fetch(`${BASE}/api/org/my/settings`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowedDomain: domain.trim() || null }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? "Failed to save");
      }
      qc.invalidateQueries({ queryKey: ["my-org"] });
      flash("Domain restriction saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally { setSaving(false); }
  }

  async function clear() {
    if (isDemoOrg) { setDomain(""); flash("Cleared (demo)."); return; }
    setSaving(true); setError(null);
    try {
      const res = await fetch(`${BASE}/api/org/my/settings`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowedDomain: null }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? "Failed to save");
      }
      setDomain("");
      qc.invalidateQueries({ queryKey: ["my-org"] });
      flash("Domain restriction removed.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally { setSaving(false); }
  }

  return (
    <div className="mt-4 pt-4 border-t border-border">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Restrict to email domain (optional)</p>
      <p className="text-[11px] text-muted-foreground mb-2">
        If set, only users whose email ends with this domain can join via the invite link.
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center rounded-md border border-border overflow-hidden focus-within:border-primary">
          <span className="px-2 py-1.5 text-xs text-muted-foreground bg-muted/40">@</span>
          <input
            type="text"
            value={domain}
            onChange={e => setDomain(e.target.value.replace(/^@/, ""))}
            placeholder="organisation.org"
            className="px-2 py-1.5 text-xs focus:outline-none min-w-0 w-48"
            data-testid="input-allowed-domain"
          />
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-white text-xs font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors"
          data-testid="button-save-allowed-domain"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Save
        </button>
        {domain && (
          <button
            type="button"
            onClick={clear}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-semibold hover:bg-muted/30 disabled:opacity-60 transition-colors"
            data-testid="button-clear-allowed-domain"
          >
            <X className="w-3.5 h-3.5" /> Remove restriction
          </button>
        )}
      </div>
      {error && <p className="text-[11px] text-red-600 mt-1">{error}</p>}
      {toast && <p className="text-[11px] text-green-700 mt-1">{toast}</p>}
    </div>
  );
}

function MembersTab({ isDemoOrg, orgId, allowedDomain }: { isDemoOrg: boolean; orgId: string; allowedDomain: string | null }) {
  const [removed, setRemoved] = useState<string[]>(() => isDemoOrg ? getRemovedMemberIds(orgId) : []);
  const [inviteCode, setInviteCode] = useState<string>(() => isDemoOrg ? getOrgInviteCode(orgId, DEMO_INVITE_CODE) : "");
  const [inviteLoading, setInviteLoading] = useState(!isDemoOrg);
  const [regenBusy, setRegenBusy] = useState(false);
  const [invites, setInvites] = useState<PendingInvite[]>([
    { id: "inv-1", email: "rachel.green@example.com", sentAt: "2026-04-22", resentAt: null },
    { id: "inv-2", email: "noor.iqbal@example.com",   sentAt: "2026-05-01", resentAt: null },
  ]);
  const [newInviteEmail, setNewInviteEmail] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  // Pagination state (demo)
  const PAGE_SIZE = 20;
  const [page, setPage] = useState(1);

  // Demo pending requests state
  const [demoPending, setDemoPending] = useState<DemoPendingRequest[]>(isDemoOrg ? DEMO_PENDING_REQUESTS : []);

  // Live mode state
  const [liveMembers, setLiveMembers] = useState<LiveMember[]>([]);
  const [livePending, setLivePending] = useState<LiveMember[]>([]);
  const [liveTotal, setLiveTotal] = useState(0);
  const [liveTotalPages, setLiveTotalPages] = useState(1);
  const [liveLoading, setLiveLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  const inviteLink = `${window.location.origin}${BASE}/org?invite=${encodeURIComponent(inviteCode)}`;

  async function fetchLiveMembers(p: number) {
    setLiveLoading(true);
    try {
      const [activeRes, pendingRes] = await Promise.all([
        fetch(`${BASE}/api/org/my/members?page=${p}&status=active`, { credentials: "include" }),
        fetch(`${BASE}/api/org/my/members?status=pending`, { credentials: "include" }),
      ]);
      if (activeRes.ok) {
        const j: LiveMembersResponse = await activeRes.json();
        setLiveMembers(j.members);
        setLiveTotal(j.total);
        setLiveTotalPages(j.totalPages);
      }
      if (pendingRes.ok) {
        const j: LiveMembersResponse = await pendingRes.json();
        setLivePending(j.members);
      }
    } catch { /* ignore */ }
    finally { setLiveLoading(false); }
  }

  useEffect(() => {
    if (!isDemoOrg) { fetchLiveMembers(page); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDemoOrg, page]);

  useEffect(() => {
    if (isDemoOrg) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${BASE}/api/org/my-join-link`, { credentials: "include" });
        if (res.ok) {
          const j: { inviteCode?: string } = await res.json();
          if (!cancelled && j.inviteCode) setInviteCode(j.inviteCode);
        }
      } catch { /* ignore */ }
      finally { if (!cancelled) setInviteLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [isDemoOrg]);

  async function copyInviteLink() {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 1500);
    } catch { flash("Could not copy, copy it manually."); }
  }

  const flash = (msg: string) => { setToast(msg); window.setTimeout(() => setToast(null), 2200); };

  const visibleDemoMembers = useMemo(
    () => DEMO_MEMBERS.filter(m => !removed.includes(m.id)),
    [removed],
  );
  const pagedDemoMembers = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return visibleDemoMembers.slice(start, start + PAGE_SIZE);
  }, [visibleDemoMembers, page]);
  const demoTotalPages = Math.ceil(visibleDemoMembers.length / PAGE_SIZE);

  function removeDemoMember(id: string) {
    const member = DEMO_MEMBERS.find(m => m.id === id);
    if (member?.role === "manager") { flash("You can't remove the organisation manager."); return; }
    if (!window.confirm(`Remove ${member?.name ?? "this member"} from the organisation?`)) return;
    const next = [...removed, id];
    setRemoved(next);
    setRemovedMemberIds(orgId, next);
    flash(`Removed ${member?.name ?? "member"}.`);
  }

  function restoreDemoMember(id: string) {
    const next = removed.filter(x => x !== id);
    setRemoved(next);
    setRemovedMemberIds(orgId, next);
  }

  function approveDemoPending(id: string) {
    const req = demoPending.find(r => r.id === id);
    setDemoPending(prev => prev.filter(r => r.id !== id));
    flash(`Approved ${req?.name ?? "request"}.`);
  }

  function rejectDemoPending(id: string) {
    const req = demoPending.find(r => r.id === id);
    setDemoPending(prev => prev.filter(r => r.id !== id));
    flash(`Rejected ${req?.name ?? "request"}.`);
  }

  async function approveLiveMember(userId: string) {
    setActionBusy(userId);
    try {
      const res = await fetch(`${BASE}/api/org/my/members/${userId}/approve`, { method: "POST", credentials: "include" });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error((j as { error?: string }).error ?? "Failed"); }
      flash("Approved.");
      await fetchLiveMembers(page);
    } catch (e) { flash(e instanceof Error ? e.message : "Failed to approve."); }
    finally { setActionBusy(null); }
  }

  async function rejectLiveMember(userId: string) {
    setActionBusy(userId);
    try {
      const res = await fetch(`${BASE}/api/org/my/members/${userId}/reject`, { method: "POST", credentials: "include" });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error((j as { error?: string }).error ?? "Failed"); }
      flash("Rejected.");
      await fetchLiveMembers(page);
    } catch (e) { flash(e instanceof Error ? e.message : "Failed to reject."); }
    finally { setActionBusy(null); }
  }

  async function regenerateInvite() {
    if (!window.confirm("Revoke and regenerate the invite code? Anyone with the old code won't be able to use it.")) return;
    if (isDemoOrg) {
      const next = generateInviteCode();
      setInviteCode(next);
      setOrgInviteCode(orgId, next);
      flash("Invite code regenerated.");
      return;
    }
    setRegenBusy(true);
    try {
      const res = await fetch(`${BASE}/api/org/my-join-link/regenerate`, { method: "POST", credentials: "include" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? "Failed to regenerate the invite code.");
      }
      const j: { inviteCode: string } = await res.json();
      setInviteCode(j.inviteCode);
      flash("Invite code regenerated.");
    } catch (e) { flash(e instanceof Error ? e.message : "Failed to regenerate the invite code."); }
    finally { setRegenBusy(false); }
  }

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch { flash("Could not copy, copy it manually."); }
  }

  function sendInvite() {
    const email = newInviteEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { flash("Please enter a valid email."); return; }
    if (invites.some(i => i.email === email)) { flash("That invite is already pending."); return; }
    setInvites(prev => [...prev, { id: `inv-${Date.now()}`, email, sentAt: new Date().toISOString().slice(0, 10), resentAt: null }]);
    setNewInviteEmail("");
    flash(`Invite sent to ${email}.`);
  }

  function resendInvite(id: string) {
    setInvites(prev => prev.map(i => i.id === id ? { ...i, resentAt: new Date().toISOString().slice(0, 10) } : i));
    flash("Invite resent.");
  }

  function revokeInvite(id: string) {
    setInvites(prev => prev.filter(i => i.id !== id));
    flash("Invite revoked.");
  }

  const pendingCount = isDemoOrg ? demoPending.length : livePending.length;
  const pendingRequests = isDemoOrg
    ? demoPending.map(r => ({ userId: r.id, name: r.name, email: r.email, joinedAt: r.requestedAt }))
    : livePending.map(r => ({ userId: r.userId, name: r.name, email: r.email, joinedAt: r.joinedAt }));

  const totalMembers = isDemoOrg ? visibleDemoMembers.length : liveTotal;
  const totalPages = isDemoOrg ? demoTotalPages : liveTotalPages;
  const showFrom = totalMembers === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const showTo = isDemoOrg ? Math.min(page * PAGE_SIZE, visibleDemoMembers.length) : Math.min(page * PAGE_SIZE, liveTotal);

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-foreground text-white text-[13px] px-3 py-2 rounded-lg shadow" role="status">{toast}</div>
      )}

      {/* Join requests (pending approvals) */}
      {pendingCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5" data-testid="section-join-requests">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="w-4 h-4 text-amber-600" />
            <h3 className="text-sm font-semibold text-amber-900">Join requests ({pendingCount})</h3>
          </div>
          <ul className="divide-y divide-amber-200">
            {pendingRequests.map(r => (
              <li key={r.userId} className="flex items-center justify-between gap-3 py-2.5 text-xs" data-testid={`row-request-${r.userId}`}>
                <div>
                  <p className="font-semibold text-foreground">{r.name}</p>
                  <p className="text-muted-foreground">{r.email}</p>
                  <p className="text-[10px] text-muted-foreground">
                    Requested {new Date(r.joinedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={actionBusy === r.userId}
                    onClick={() => isDemoOrg ? approveDemoPending(r.userId) : approveLiveMember(r.userId)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-green-600 text-white text-[11px] font-semibold hover:bg-green-700 disabled:opacity-60"
                    data-testid={`button-approve-${r.userId}`}
                  >
                    {actionBusy === r.userId ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Approve
                  </button>
                  <button
                    type="button"
                    disabled={actionBusy === r.userId}
                    onClick={() => isDemoOrg ? rejectDemoPending(r.userId) : rejectLiveMember(r.userId)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-border text-[11px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
                    data-testid={`button-reject-${r.userId}`}
                  >
                    <X className="w-3 h-3" /> Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Invite link management */}
      <div className="bg-white border border-border rounded-xl p-5" data-testid="section-invite">
        <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold">Invite code & link</h3>
            <p className="text-[13px] text-muted-foreground">Share either the code or the full link with people you want to join your organisation.</p>
          </div>
          <button
            type="button"
            onClick={regenerateInvite}
            disabled={regenBusy || inviteLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-[13px] font-semibold hover:bg-muted/30 transition-colors disabled:opacity-60"
            data-testid="button-regenerate-invite"
          >
            {regenBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Revoke & regenerate
          </button>
        </div>
        <div className="space-y-2">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Code</p>
            <div className="flex items-center gap-2">
              <code className="px-3 py-2 rounded-md bg-muted/40 font-mono text-sm font-semibold text-foreground" data-testid="text-invite-code">{inviteLoading ? "Loading…" : inviteCode}</code>
              <button
                type="button"
                onClick={copyInvite}
                disabled={inviteLoading}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-[13px] font-semibold hover:bg-muted/30 transition-colors disabled:opacity-60"
                data-testid="button-copy-invite"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />} {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Link</p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={inviteLoading ? "Loading…" : inviteLink}
                onFocus={e => e.currentTarget.select()}
                className="flex-1 px-3 py-2 rounded-md bg-muted/40 font-mono text-[13px] text-foreground border border-border focus:outline-none focus:border-primary"
                data-testid="text-invite-link"
              />
              <button
                type="button"
                onClick={copyInviteLink}
                disabled={inviteLoading}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-[13px] font-semibold hover:bg-muted/30 transition-colors disabled:opacity-60"
                data-testid="button-copy-invite-link"
              >
                {linkCopied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />} {linkCopied ? "Copied" : "Copy link"}
              </button>
            </div>
          </div>
        </div>
        <AllowedDomainField initialDomain={allowedDomain} isDemoOrg={isDemoOrg} />
      </div>

      {/* Members table */}
      <div className="bg-white border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <h3 className="text-sm font-semibold">Members</h3>
            {totalMembers > 0 && (
              <p className="text-xs text-muted-foreground">
                Showing {showFrom}–{showTo} of {totalMembers}{isDemoOrg ? " (demo data)" : ""}
              </p>
            )}
          </div>
        </div>
        {liveLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        ) : (
        <>
          {/* Mobile cards — visible on screens narrower than 640px */}
          <ul className="sm:hidden divide-y divide-border/60">
            {(isDemoOrg ? pagedDemoMembers : liveMembers).length === 0 && (
              <li className="py-6 text-center text-xs text-muted-foreground">No members yet.</li>
            )}
            {isDemoOrg
              ? pagedDemoMembers.map(m => (
                  <li key={m.id} className="py-3 flex items-start justify-between gap-3" data-testid={`row-member-${m.id}`}>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-foreground truncate">{m.name}</p>
                      <p className="text-[12px] text-muted-foreground truncate">{m.email}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${m.role === "manager" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                          {m.role}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          Joined {new Date(m.joinedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0">
                      {m.role === "manager" ? (
                        <span className="text-[11px] text-muted-foreground italic">manager</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => removeDemoMember(m.id)}
                          className="inline-flex items-center gap-1 text-[12px] text-red-600 hover:text-red-700 font-semibold"
                          data-testid={`button-remove-${m.id}`}
                        >
                          <Trash2 className="w-3 h-3" /> Remove
                        </button>
                      )}
                    </div>
                  </li>
                ))
              : liveMembers.map(m => (
                  <li key={m.userId} className="py-3 flex items-start justify-between gap-3" data-testid={`row-member-${m.userId}`}>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-foreground truncate">{m.name}</p>
                      <p className="text-[12px] text-muted-foreground truncate">{m.email}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${m.role === "manager" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                          {m.role}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          Joined {new Date(m.joinedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0 text-[11px] text-muted-foreground italic">{m.role}</div>
                  </li>
                ))
            }
          </ul>

          {/* Desktop/tablet table — hidden on phones */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full table-fixed text-[13px]">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="py-2 pr-3 font-semibold uppercase text-[11px] tracking-wider w-[140px]">Name</th>
                  <th className="py-2 pr-3 font-semibold uppercase text-[11px] tracking-wider w-[180px]">Email</th>
                  <th className="py-2 pr-3 font-semibold uppercase text-[11px] tracking-wider min-w-[70px]">Role</th>
                  <th className="py-2 pr-3 font-semibold uppercase text-[11px] tracking-wider min-w-[90px]">Postcode</th>
                  <th className="py-2 pr-3 font-semibold uppercase text-[11px] tracking-wider min-w-[90px] whitespace-nowrap">Joined</th>
                  <th className="py-2 pr-3 font-semibold uppercase text-[11px] tracking-wider min-w-[80px] text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {isDemoOrg
                  ? pagedDemoMembers.map(m => (
                      <tr key={m.id} className="border-b border-border/60" data-testid={`row-member-${m.id}-desktop`}>
                        <td className="py-2 pr-3 font-medium text-foreground truncate">{m.name}</td>
                        <td className="py-2 pr-3 text-muted-foreground truncate">{m.email}</td>
                        <td className="py-2 pr-3">
                          <span className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${m.role === "manager" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                            {m.role}
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-muted-foreground">{m.postcode}</td>
                        <td className="py-2 pr-3 text-muted-foreground whitespace-nowrap">{new Date(m.joinedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</td>
                        <td className="py-2 pr-3 text-right">
                          {m.role === "manager" ? (
                            <span className="text-[11px] text-muted-foreground italic">manager</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => removeDemoMember(m.id)}
                              className="inline-flex items-center gap-1 text-[12px] text-red-600 hover:text-red-700 font-semibold"
                              data-testid={`button-remove-${m.id}-desktop`}
                            >
                              <Trash2 className="w-3 h-3" /> Remove
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  : liveMembers.map(m => (
                      <tr key={m.userId} className="border-b border-border/60" data-testid={`row-member-${m.userId}-desktop`}>
                        <td className="py-2 pr-3 font-medium text-foreground truncate">{m.name}</td>
                        <td className="py-2 pr-3 text-muted-foreground truncate">{m.email}</td>
                        <td className="py-2 pr-3">
                          <span className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${m.role === "manager" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                            {m.role}
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-muted-foreground">{m.postcode ?? "—"}</td>
                        <td className="py-2 pr-3 text-muted-foreground whitespace-nowrap">{new Date(m.joinedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</td>
                        <td className="py-2 pr-3 text-right">
                          <span className="text-[11px] text-muted-foreground italic">{m.role}</span>
                        </td>
                      </tr>
                    ))
                }
                {(isDemoOrg ? pagedDemoMembers : liveMembers).length === 0 && (
                  <tr><td colSpan={6} className="py-6 text-center text-xs text-muted-foreground">No members yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
            <p className="text-xs text-muted-foreground">
              Showing {showFrom}–{showTo} of {totalMembers} members
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 rounded-md border border-border text-xs font-semibold hover:bg-muted/30 disabled:opacity-40 transition-colors"
                data-testid="button-prev-page"
              >
                ← Previous
              </button>
              <span className="text-xs text-muted-foreground">Page {page} of {totalPages}</span>
              <button
                type="button"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1.5 rounded-md border border-border text-xs font-semibold hover:bg-muted/30 disabled:opacity-40 transition-colors"
                data-testid="button-next-page"
              >
                Next →
              </button>
            </div>
          </div>
        )}

        {isDemoOrg && removed.length > 0 && (
          <div className="mt-4 pt-3 border-t border-border">
            <p className="text-[12px] uppercase tracking-wider text-muted-foreground mb-2">Recently removed</p>
            <ul className="space-y-1">
              {removed.map(id => {
                const m = DEMO_MEMBERS.find(x => x.id === id);
                if (!m) return null;
                return (
                  <li key={id} className="flex items-center justify-between text-[13px] text-muted-foreground">
                    <span>{m.name} <span className="text-[11px]">({m.email})</span></span>
                    <button onClick={() => restoreDemoMember(id)} className="text-primary hover:underline text-[12px] font-semibold">Restore</button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {/* Pending invites (demo only) */}
      {isDemoOrg && (
      <div className="bg-white border border-border rounded-xl p-5" data-testid="section-pending-invites">
        <div className="flex items-center gap-2 mb-3">
          <Mail className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Pending invites</h3>
        </div>
        <form
          onSubmit={e => { e.preventDefault(); sendInvite(); }}
          className="flex items-center gap-2 mb-4"
        >
          <input
            type="email"
            value={newInviteEmail}
            onChange={e => setNewInviteEmail(e.target.value)}
            placeholder="person@example.com"
            className="flex-1 px-3 py-1.5 rounded-md border border-border text-[13px] focus:outline-none focus:border-primary"
            data-testid="input-new-invite"
          />
          <button type="submit" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-white text-[13px] font-semibold hover:bg-primary/90 transition-colors" data-testid="button-send-invite">
            <Plus className="w-3.5 h-3.5" /> Send invite
          </button>
        </form>
        {invites.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">No pending invites.</p>
        ) : (
          <ul className="divide-y divide-border">
            {invites.map(inv => (
              <li key={inv.id} className="flex items-center justify-between gap-3 py-2 text-[13px]" data-testid={`row-invite-${inv.id}`}>
                <div>
                  <p className="font-medium text-foreground">{inv.email}</p>
                  <p className="text-[11px] text-muted-foreground">
                    Sent {new Date(inv.sentAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                    {inv.resentAt && ` · Resent ${new Date(inv.resentAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => resendInvite(inv.id)} className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border text-[12px] font-semibold hover:bg-muted/30" data-testid={`button-resend-${inv.id}`}>
                    <RefreshCw className="w-3 h-3" /> Resend
                  </button>
                  <button onClick={() => revokeInvite(inv.id)} className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border text-[12px] font-semibold text-red-600 hover:bg-red-50" data-testid={`button-revoke-${inv.id}`}>
                    <X className="w-3 h-3" /> Revoke
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      )}
    </div>
  );
}

function SettingToggleRow({
  label,
  description,
  enabled,
  onToggle,
  isPending,
  testId,
}: {
  label: string;
  description: string;
  enabled: boolean;
  onToggle: (next: boolean) => void;
  isPending: boolean;
  testId: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-semibold mb-0.5">{label}</p>
        <p className="text-[13px] text-muted-foreground max-w-prose">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        disabled={isPending}
        onClick={() => onToggle(!enabled)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${enabled ? "bg-primary" : "bg-muted"}`}
        data-testid={testId}
      >
        <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform ${enabled ? "translate-x-5" : "translate-x-0.5"}`} />
      </button>
    </div>
  );
}

function AiFeaturesTab({ initialEnabled, initialLeaderboardEnabled }: { initialEnabled: boolean; initialLeaderboardEnabled: boolean }) {
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState<boolean>(initialEnabled);
  const [leaderboardEnabled, setLeaderboardEnabled] = useState<boolean>(initialLeaderboardEnabled);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setEnabled(initialEnabled); }, [initialEnabled]);
  useEffect(() => { setLeaderboardEnabled(initialLeaderboardEnabled); }, [initialLeaderboardEnabled]);

  const mutation = useMutation<{ org: { aiSidekickEnabled: boolean; challengeLeaderboardEnabled: boolean } }, Error, Record<string, boolean>>({
    mutationFn: async (patch) => {
      const res = await fetch(`${BASE}/api/org/my/settings`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? "Failed to save");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setEnabled(data.org.aiSidekickEnabled);
      setLeaderboardEnabled(data.org.challengeLeaderboardEnabled);
      setSavedAt(Date.now());
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["my-org"] });
    },
    onError: (err) => {
      setEnabled(initialEnabled);
      setLeaderboardEnabled(initialLeaderboardEnabled);
      setError(err.message);
    },
  });

  function toggleAi(next: boolean) {
    setEnabled(next);
    setError(null);
    mutation.mutate({ aiSidekickEnabled: next });
  }

  function toggleLeaderboard(next: boolean) {
    setLeaderboardEnabled(next);
    setError(null);
    mutation.mutate({ challengeLeaderboardEnabled: next });
  }

  return (
    <div className="bg-white border border-border rounded-xl p-5 space-y-5">
      <h3 className="text-sm font-semibold">AI features &amp; challenge settings</h3>

      <SettingToggleRow
        label="AI Sidekick"
        description="Controls whether your members see the in-app AI Sidekick, used for activity suggestions, summarising journal entries and answering questions about their impact. Turning it off hides the feature for everyone in your organisation."
        enabled={enabled}
        onToggle={toggleAi}
        isPending={mutation.isPending}
        testId="toggle-ai"
      />

      <div className="border-t border-border" />

      <SettingToggleRow
        label="Show challenge leaderboards"
        description="Controls whether the leaderboard is visible on all challenges belonging to your organisation. Turning it off hides the ranking table for all members. You can re-enable it at any time."
        enabled={leaderboardEnabled}
        onToggle={toggleLeaderboard}
        isPending={mutation.isPending}
        testId="toggle-leaderboard"
      />

      <div className="text-[13px] space-y-0.5">
        <p className={enabled ? "text-green-700" : "text-muted-foreground"}>
          AI Sidekick is <strong>{enabled ? "enabled" : "disabled"}</strong> for this organisation.
        </p>
        <p className={leaderboardEnabled ? "text-green-700" : "text-muted-foreground"}>
          Challenge leaderboards are <strong>{leaderboardEnabled ? "visible" : "hidden"}</strong> for this organisation.
        </p>
        {mutation.isPending && (
          <p className="text-[12px] text-muted-foreground pt-1 inline-flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" /> Saving…
          </p>
        )}
        {!mutation.isPending && savedAt && !error && (
          <p className="text-[12px] text-muted-foreground pt-1 inline-flex items-center gap-1">
            <Check className="w-3 h-3 text-green-600" /> Saved
          </p>
        )}
        {error && (
          <p className="text-[12px] text-red-600 pt-1">{error}</p>
        )}
      </div>
    </div>
  );
}

function ProfileTab({ org, isDemoOrg }: { org: { id: string; name: string; type: string; sroiCostPerVolunteer: number | null; sroiCostBreakdown?: SroiCostBreakdown; branding?: OrgBranding }; isDemoOrg: boolean }) {
  return (
    <div className="space-y-4">
      <BrandingSection branding={org.branding ?? null} />
      <SroiAssumptionsSection initialCost={org.sroiCostPerVolunteer} initialBreakdown={org.sroiCostBreakdown ?? null} />

      <div className="bg-white border border-border rounded-xl p-5 space-y-3 text-sm">
      <h3 className="text-sm font-semibold mb-2">Organisation profile</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <p className="text-[12px] uppercase tracking-wider text-muted-foreground">Display name</p>
          <p className="font-semibold text-foreground">{isDemoOrg ? DEMO_ORG_NAME : org.name}</p>
        </div>
        <div>
          <p className="text-[12px] uppercase tracking-wider text-muted-foreground">Type</p>
          <p className="font-semibold text-foreground capitalize">{isDemoOrg ? DEMO_ORG_TYPE : org.type}</p>
        </div>
        <div>
          <p className="text-[12px] uppercase tracking-wider text-muted-foreground">Manager contact</p>
          <p className="font-semibold text-foreground">{isDemoOrg ? DEMO_ORG_CONTACT_EMAIL : "Not set"}</p>
        </div>
        <div>
          <p className="text-[12px] uppercase tracking-wider text-muted-foreground">Invite code</p>
          <p className="font-mono font-semibold text-foreground">{isDemoOrg ? getOrgInviteCode(org.id, DEMO_INVITE_CODE) : "Not set"}</p>
        </div>
      </div>
      <p className="text-[13px] text-muted-foreground pt-2 border-t border-border">
        To change these details, contact us at <a className="text-primary underline" href="mailto:hello@myimpact.uk">hello@myimpact.uk</a>.
      </p>
      </div>
    </div>
  );
}

// ── Branding section ────────────────────────────────────────────────────────
const DEFAULT_PRIMARY = "#E8633A";
const DEFAULT_ACCENT  = "#B5BE2E";
const ALLOWED_LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

// Compute relative luminance (per WCAG) from an "#RRGGBB" hex string.
function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(c => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
// Contrast ratio between two hex colours; values above 4.5 are WCAG AA for body text.
function contrastRatio(a: string, b: string): number {
  const la = luminance(a), lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

function BrandingSection({ branding }: { branding: OrgBranding | null }) {
  const qc = useQueryClient();
  const [primary, setPrimary] = useState<string>(branding?.brandPrimary || DEFAULT_PRIMARY);
  const [accent,  setAccent]  = useState<string>(branding?.brandAccent  || DEFAULT_ACCENT);
  const [logoUrl, setLogoUrl] = useState<string | null>(branding?.logoUrl ?? null);
  const [logoKey, setLogoKey] = useState<string | null>(branding?.logoKey ?? null);
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [toast, setToast]     = useState<string | null>(null);

  // White-text contrast warning, managers picking very pale brand colours
  // would render unreadable buttons in the org dashboard.
  const primaryContrast = useMemo(() => contrastRatio(primary, "#FFFFFF"), [primary]);
  const showContrastWarning = primaryContrast < 4.5;

  function flash(msg: string) { setToast(msg); window.setTimeout(() => setToast(null), 2200); }

  async function patchBranding(payload: Partial<{ logoKey: string | null; brandPrimary: string | null; brandAccent: string | null }>) {
    const res = await fetch(`${BASE}/api/org/my/branding`, {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error((j as { error?: string }).error || "Could not save branding");
    }
    const j = await res.json() as { branding: OrgBranding };
    setLogoUrl(j.branding.logoUrl);
    setLogoKey(j.branding.logoKey);
    setPrimary(j.branding.brandPrimary || DEFAULT_PRIMARY);
    setAccent(j.branding.brandAccent  || DEFAULT_ACCENT);
    qc.invalidateQueries({ queryKey: ["my-org"] });
    qc.invalidateQueries({ queryKey: ["org-dashboard"] });
  }

  async function handleLogoFile(file: File) {
    setError(null);
    if (!ALLOWED_LOGO_TYPES.includes(file.type)) { setError("Please upload a PNG, JPG, WebP or SVG image."); return; }
    if (file.size > MAX_LOGO_BYTES) { setError("Logo must be 2 MB or smaller."); return; }
    setBusy(true);
    try {
      const signRes = await fetch(`${BASE}/api/org/my/branding/logo-upload-url`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mimeType: file.type, byteSize: file.size }),
      });
      if (!signRes.ok) {
        const j = await signRes.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error || "Could not start upload");
      }
      const { uploadUrl, logoKey: newKey } = await signRes.json() as { uploadUrl: string; logoKey: string };
      const putRes = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!putRes.ok) throw new Error("Upload failed. Please try again.");
      await patchBranding({ logoKey: newKey });
      flash("Logo uploaded.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not upload logo.");
    } finally { setBusy(false); }
  }

  async function removeLogo() {
    if (!logoKey) return;
    setBusy(true); setError(null);
    try { await patchBranding({ logoKey: null }); flash("Logo removed."); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not remove logo."); }
    finally { setBusy(false); }
  }

  async function saveColours() {
    setBusy(true); setError(null);
    try { await patchBranding({ brandPrimary: primary, brandAccent: accent }); flash("Colours saved."); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not save colours."); }
    finally { setBusy(false); }
  }

  async function resetAll() {
    if (!window.confirm("Reset your organisation's branding to the My Impact defaults?")) return;
    setBusy(true); setError(null);
    try {
      await patchBranding({ logoKey: null, brandPrimary: null, brandAccent: null });
      setPrimary(DEFAULT_PRIMARY); setAccent(DEFAULT_ACCENT);
      flash("Branding reset.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not reset branding."); }
    finally { setBusy(false); }
  }

  return (
    <div className="bg-white border border-border rounded-xl p-5 text-sm">
      <div className="flex items-center gap-2 mb-1">
        <Palette className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Branding</h3>
      </div>
      <p className="text-[13px] text-muted-foreground mb-4">
        Your logo and colours appear on the org dashboard, header and exported PDF report.
      </p>

      {/* Live preview tile, shows what the dashboard header will look like
          with the manager's currently-edited (unsaved) logo + colours. */}
      <BrandingPreview logoUrl={logoUrl} primary={primary} accent={accent} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-4">
        {/* Logo */}
        <div>
          <p className="text-[12px] uppercase tracking-wider text-muted-foreground mb-2">Logo</p>
          <div className="flex items-center gap-3">
            <div className="w-24 h-24 rounded-lg border border-border bg-muted/20 flex items-center justify-center overflow-hidden">
              {logoUrl
                ? <img src={logoUrl} alt="Org logo" className="max-w-full max-h-full object-contain" />
                : <Building2 className="w-8 h-8 text-muted-foreground" />}
            </div>
            <div className="flex flex-col gap-2">
              <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-semibold border border-border hover:bg-muted/30 cursor-pointer">
                <Upload className="w-3.5 h-3.5" /> {logoUrl ? "Replace logo" : "Upload logo"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="hidden"
                  disabled={busy}
                  onChange={e => { const f = e.target.files?.[0]; if (f) void handleLogoFile(f); e.target.value = ""; }}
                  data-testid="input-logo-file"
                />
              </label>
              {logoUrl && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-semibold border border-border text-muted-foreground hover:bg-muted/30"
                  onClick={removeLogo}
                  disabled={busy}
                  data-testid="button-remove-logo"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Remove
                </button>
              )}
              <p className="text-[12px] text-muted-foreground">PNG, JPG, WebP or SVG · max 2 MB</p>
            </div>
          </div>
        </div>

        {/* Colours */}
        <div>
          <p className="text-[12px] uppercase tracking-wider text-muted-foreground mb-2">Brand colours</p>
          <div className="space-y-3">
            <ColourField label="Primary" value={primary} onChange={setPrimary} testId="primary" />
            <ColourField label="Accent"  value={accent}  onChange={setAccent}  testId="accent" />
            {showContrastWarning && (
              <div className="flex items-start gap-2 text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>Your primary colour has low contrast against white text. Buttons and badges may be hard to read.</span>
              </div>
            )}
            <button
              type="button"
              onClick={saveColours}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-semibold bg-primary text-white hover:opacity-90 disabled:opacity-50"
              data-testid="button-save-colours"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Save colours
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 pt-4 mt-4 border-t border-border">
        <p className="text-[12px] text-muted-foreground">
          Reset returns your organisation to the default My Impact branding.
        </p>
        <button
          type="button"
          onClick={resetAll}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-semibold border border-border text-muted-foreground hover:bg-muted/30 disabled:opacity-50"
          data-testid="button-reset-branding"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Reset to defaults
        </button>
      </div>

      {error && <p className="text-[13px] text-red-600 mt-3" data-testid="branding-error">{error}</p>}
      {toast && <p className="text-[13px] text-emerald-700 mt-3" data-testid="branding-toast">{toast}</p>}
    </div>
  );
}

function BrandingPreview({ logoUrl, primary, accent }: { logoUrl: string | null; primary: string; accent: string }) {
  const valid = (h: string) => /^#[0-9A-Fa-f]{6}$/.test(h);
  const p = valid(primary) ? primary : DEFAULT_PRIMARY;
  const a = valid(accent)  ? accent  : DEFAULT_ACCENT;
  return (
    <div className="rounded-xl border border-border bg-muted/20 p-3" data-testid="branding-preview">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Live preview</p>
      <div className="rounded-lg border border-border bg-white p-4">
        <div className="flex items-center gap-3 mb-3 pb-3 border-b" style={{ borderColor: p }}>
          {logoUrl ? (
            <img src={logoUrl} alt="" className="w-10 h-10 rounded object-contain bg-white border border-border p-0.5" />
          ) : (
            <div className="w-10 h-10 rounded flex items-center justify-center" style={{ backgroundColor: p, color: "#fff" }}>
              <Building2 className="w-5 h-5" />
            </div>
          )}
          <div>
            <p className="text-sm font-display font-semibold text-foreground">Your organisation</p>
            <p className="text-[12px] text-muted-foreground">Header preview</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="px-3 py-1.5 rounded-md text-[13px] font-semibold text-white" style={{ backgroundColor: p }}>
            Primary action
          </button>
          <span className="px-2.5 py-1 rounded-md text-[12px] font-semibold border" style={{ color: a, borderColor: a }}>
            Accent badge
          </span>
        </div>
      </div>
    </div>
  );
}

type SroiLineKey = "recruitment" | "onboarding" | "support" | "admin";

const SROI_LINES: Array<{ key: SroiLineKey; label: string; help: string }> = [
  { key: "recruitment", label: "Recruitment", help: "Adverts, listings, outreach" },
  { key: "onboarding",  label: "Onboarding",  help: "DBS, induction, training" },
  { key: "support",     label: "Support",     help: "Coordinator time, supervision" },
  { key: "admin",       label: "Admin",       help: "Expenses, systems, overheads" },
];

function toEditValue(n: number | null): string { return n == null ? "" : String(n); }

function SroiAssumptionsSection({
  initialCost,
  initialBreakdown,
}: {
  initialCost: number | null;
  initialBreakdown: SroiCostBreakdown | null;
}) {
  const qc = useQueryClient();
  const [values, setValues] = useState<Record<SroiLineKey, string>>(() => ({
    recruitment: toEditValue(initialBreakdown?.recruitment ?? null),
    onboarding:  toEditValue(initialBreakdown?.onboarding  ?? null),
    support:     toEditValue(initialBreakdown?.support     ?? null),
    admin:       toEditValue(initialBreakdown?.admin       ?? null),
  }));
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setValues({
      recruitment: toEditValue(initialBreakdown?.recruitment ?? null),
      onboarding:  toEditValue(initialBreakdown?.onboarding  ?? null),
      support:     toEditValue(initialBreakdown?.support     ?? null),
      admin:       toEditValue(initialBreakdown?.admin       ?? null),
    });
  }, [initialBreakdown?.recruitment, initialBreakdown?.onboarding, initialBreakdown?.support, initialBreakdown?.admin]);

  // Parse the four edit values into numbers (or null) once per render so the
  // derived total and the Save handler see the same shape.
  const parsed: Record<SroiLineKey, number | null | "invalid"> = {
    recruitment: parseLine(values.recruitment),
    onboarding:  parseLine(values.onboarding),
    support:     parseLine(values.support),
    admin:       parseLine(values.admin),
  };
  const anyInvalid = Object.values(parsed).some(v => v === "invalid");
  const filled = Object.values(parsed).filter((v): v is number => typeof v === "number");
  const derivedTotal = filled.length > 0 ? filled.reduce((acc, n) => acc + n, 0) : null;
  const hasAnyBreakdown = filled.length > 0;
  const effectiveCost = derivedTotal ?? initialCost ?? DEFAULT_SROI_COST_PER_VOLUNTEER;
  const usingDefault = derivedTotal == null && initialCost == null;

  const mutation = useMutation<
    { org: { sroiCostPerVolunteer: number | null; sroiCostBreakdown: SroiCostBreakdown } },
    Error,
    SroiCostBreakdown | null
  >({
    mutationFn: async (next) => {
      const res = await fetch(`${BASE}/api/org/my/settings`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sroiCostBreakdown: next }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? "Failed to save");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setSavedAt(Date.now());
      setError(null);
      const b = data.org.sroiCostBreakdown;
      setValues({
        recruitment: toEditValue(b.recruitment),
        onboarding:  toEditValue(b.onboarding),
        support:     toEditValue(b.support),
        admin:       toEditValue(b.admin),
      });
      qc.invalidateQueries({ queryKey: ["my-org"] });
      qc.invalidateQueries({ queryKey: ["org-dashboard"] });
    },
    onError: (err) => setError(err.message),
  });

  function save() {
    setError(null);
    if (anyInvalid) {
      setError("Each amount must be a whole number between 0 and 1,000,000, or left blank.");
      return;
    }
    if (derivedTotal != null && derivedTotal > 1_000_000) {
      setError("The total of the four sub-amounts must not exceed £1,000,000.");
      return;
    }
    const payload: SroiCostBreakdown = {
      recruitment: parsed.recruitment as number | null,
      onboarding:  parsed.onboarding  as number | null,
      support:     parsed.support     as number | null,
      admin:       parsed.admin       as number | null,
    };
    mutation.mutate(payload);
  }

  function reset() {
    if (!window.confirm("Clear the per-line breakdown and use the My Impact default?")) return;
    setError(null);
    setValues({ recruitment: "", onboarding: "", support: "", admin: "" });
    mutation.mutate(null);
  }

  return (
    <div className="bg-white border border-border rounded-xl p-5 space-y-4" data-testid="section-sroi-assumptions">
      <div>
        <h3 className="text-sm font-semibold mb-1">SROI assumptions</h3>
        <p className="text-[13px] text-muted-foreground max-w-prose">
          Break the per-volunteer investment into recruitment, onboarding, support and admin so the total is auditable for funders. The dashboard SROI explainer uses the sum. Leave every line blank to fall back to the My Impact default of £{DEFAULT_SROI_COST_PER_VOLUNTEER}.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="sroi-breakdown-grid">
        {SROI_LINES.map(line => {
          const v = values[line.key];
          const p = parsed[line.key];
          const invalid = p === "invalid";
          return (
            <label key={line.key} className="block text-[13px] space-y-1">
              <span className="font-semibold text-foreground">{line.label}</span>
              <span className="block text-[11px] text-muted-foreground">{line.help}</span>
              <span className={`inline-flex items-center rounded-md border overflow-hidden focus-within:border-primary ${invalid ? "border-red-500" : "border-border"}`}>
                <span className="px-2 py-1.5 text-[13px] text-muted-foreground bg-muted/40">£</span>
                <NumberInput
                  min={0}
                  max={1_000_000}
                  step={1}
                  inputMode="numeric"
                  value={v}
                  onChange={e => setValues(prev => ({ ...prev, [line.key]: e.target.value }))}
                  placeholder="0"
                  className="w-28 px-2 py-1.5 text-[13px] focus:outline-none"
                  data-testid={`input-sroi-${line.key}`}
                  aria-invalid={invalid || undefined}
                />
              </span>
            </label>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border">
        <p className="text-[13px] text-muted-foreground">
          Total per volunteer: <strong className="text-foreground" data-testid="text-sroi-derived-total">£{effectiveCost.toLocaleString("en-GB")}</strong>
          {hasAnyBreakdown
            ? <span className="text-[11px] ml-1">(sum of {filled.length} line{filled.length === 1 ? "" : "s"})</span>
            : usingDefault
              ? <span className="text-[11px] ml-1">(default)</span>
              : <span className="text-[11px] ml-1">(saved total)</span>}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={save}
            disabled={mutation.isPending || anyInvalid}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-white text-[13px] font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors"
            data-testid="button-save-sroi-cost"
          >
            {mutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Save breakdown
          </button>
          {(initialBreakdown && Object.values(initialBreakdown).some(v => v != null)) || initialCost != null ? (
            <button
              type="button"
              onClick={reset}
              disabled={mutation.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-[13px] font-semibold hover:bg-muted/30 disabled:opacity-60 transition-colors"
              data-testid="button-reset-sroi-cost"
            >
              <RefreshCw className="w-3 h-3" /> Use default
            </button>
          ) : null}
        </div>
      </div>

      {error && <p className="text-[12px] text-red-600" data-testid="sroi-error">{error}</p>}
      {!error && !mutation.isPending && savedAt && (
        <p className="text-[12px] text-muted-foreground inline-flex items-center gap-1">
          <Check className="w-3 h-3 text-green-600" /> Saved
        </p>
      )}
    </div>
  );
}

function parseLine(raw: string): number | null | "invalid" {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > 1_000_000) return "invalid";
  return n;
}

function ColourField({ label, value, onChange, testId }: { label: string; value: string; onChange: (v: string) => void; testId: string }) {
  function setHex(v: string) {
    const h = v.startsWith("#") ? v : `#${v}`;
    onChange(h.toUpperCase());
  }
  const isValid = /^#[0-9A-Fa-f]{6}$/.test(value);
  return (
    <div className="flex items-center gap-2">
      <span className="text-[13px] text-muted-foreground w-16">{label}</span>
      <input
        type="color"
        value={isValid ? value : "#000000"}
        onChange={e => setHex(e.target.value)}
        className="w-10 h-9 rounded border border-border cursor-pointer"
        data-testid={`color-${testId}`}
      />
      <input
        type="text"
        value={value}
        onChange={e => setHex(e.target.value)}
        maxLength={7}
        className="font-mono text-[13px] px-2 py-1.5 rounded border border-border w-24 uppercase"
        data-testid={`hex-${testId}`}
      />
      {!isValid && <span className="text-[11px] text-red-600">Invalid hex</span>}
    </div>
  );
}

export default function OrgSettings() {
  const { data: orgData, isLoading, isError } = useMyOrg();
  const [active, setActive] = useState<TabKey>("members");

  if (isLoading) {
    return <div className="max-w-6xl mx-auto px-4 py-16 flex justify-center">
      <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>;
  }

  if (isError) {
    return <div className="max-w-2xl mx-auto px-4 py-16 text-center">
      <AlertCircle className="w-6 h-6 text-red-500 mx-auto mb-2" />
      <p className="text-base font-semibold mb-1">Could not load your organisation</p>
      <p className="text-sm text-muted-foreground">Please refresh the page or try again in a moment.</p>
    </div>;
  }

  if (!orgData?.org) {
    return <div className="max-w-2xl mx-auto px-4 py-20 text-center">
      <p className="text-base font-semibold mb-2">You're not in an organisation yet.</p>
      <Link href="/org" className="text-primary underline">Go to the organisation portal</Link>
    </div>;
  }

  if (orgData.org.role !== "manager") {
    return <div className="max-w-2xl mx-auto px-4 py-20 text-center">
      <p className="text-base font-semibold mb-2">Manager access required</p>
      <p className="text-sm text-muted-foreground">Organisation settings are only available to your organisation manager.</p>
    </div>;
  }

  const isDemoOrg = orgData.org.id === DEMO_ORG_ID;

  return (
    <>
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-display font-semibold text-foreground">Organisation settings</h1>
        <p className="text-sm text-muted-foreground">{orgData.org.name}</p>
        <p className="text-xs text-muted-foreground mt-1" data-testid="text-data-sharing-mode">
          Data-sharing type:{" "}
          {(orgData.org as { dataSharingMode?: string }).dataSharingMode === "consented_logging" ? (
            <Link href="/org/types/consented-logging" className="text-primary hover:underline font-medium">Consented logging</Link>
          ) : (
            <Link href="/org/types/explicit-submission" className="text-primary hover:underline font-medium">Explicit submission</Link>
          )}{" "}
          (fixed at creation)
        </p>
      </div>

      <div className="flex gap-2 mb-6 overflow-x-auto pb-1" role="tablist">
        {TABS.map(t => {
          const Icon = t.icon;
          const isActive = active === t.key;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(t.key)}
              className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-semibold border transition-colors ${isActive ? "bg-primary text-white border-primary" : "border-border text-foreground hover:bg-muted/30"}`}
              data-testid={`tab-${t.key}`}
            >
              <Icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          );
        })}
      </div>

      <motion.div key={active} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
        {active === "members"   && <MembersTab isDemoOrg={isDemoOrg} orgId={orgData.org.id} allowedDomain={orgData.org.allowedDomain ?? null} />}
        {active === "ai"        && <AiFeaturesTab initialEnabled={orgData.org.aiSidekickEnabled ?? true} initialLeaderboardEnabled={orgData.org.challengeLeaderboardEnabled ?? true} />}
        {active === "sso"       && <OrgSsoConfigPanel orgId={orgData.org.id} isDemoOrg={isDemoOrg} />}
        {active === "developer" && <DeveloperApiSection isDemoOrg={isDemoOrg} />}
        {active === "share"     && <ShareLinkManager isDemoOrg={isDemoOrg} />}
        {active === "profile"   && <ProfileTab org={{ ...orgData.org, sroiCostPerVolunteer: orgData.org.sroiCostPerVolunteer ?? null, sroiCostBreakdown: orgData.org.sroiCostBreakdown }} isDemoOrg={isDemoOrg} />}
      </motion.div>
    </div>
    </>
  );
}
