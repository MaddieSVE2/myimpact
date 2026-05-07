import { useState, useEffect, useMemo } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Users, Sparkles, ShieldCheck, Code2, Share2, Building2, ArrowLeft, Check, Trash2, Mail, RefreshCw, Copy, Plus, X, AlertCircle, Loader2 } from "lucide-react";
import { OrgSsoConfigPanel } from "@/components/OrgSsoConfig";
import { DeveloperApiSection } from "@/components/DeveloperApiSection";
import { ShareLinkManager } from "@/components/ShareLinkManager";
import {
  DEMO_ORG_ID, DEMO_ORG_NAME, DEMO_ORG_TYPE, DEMO_INVITE_CODE,
  DEMO_ORG_CONTACT_EMAIL, DEMO_MEMBERS,
  getOrgInviteCode, setOrgInviteCode, generateInviteCode,
  getRemovedMemberIds, setRemovedMemberIds,
} from "@/lib/org-demo-mock";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface MyOrgResponse { org: { id: string; name: string; type: string; role: string; aiSidekickEnabled: boolean } | null }

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

function MembersTab({ isDemoOrg, orgId }: { isDemoOrg: boolean; orgId: string }) {
  const [removed, setRemoved] = useState<string[]>(() => isDemoOrg ? getRemovedMemberIds(orgId) : []);
  const [inviteCode, setInviteCode] = useState<string>(() => isDemoOrg ? getOrgInviteCode(orgId, DEMO_INVITE_CODE) : DEMO_INVITE_CODE);
  const [invites, setInvites] = useState<PendingInvite[]>([
    { id: "inv-1", email: "rachel.green@example.com", sentAt: "2026-04-22", resentAt: null },
    { id: "inv-2", email: "noor.iqbal@example.com",   sentAt: "2026-05-01", resentAt: null },
  ]);
  const [newInviteEmail, setNewInviteEmail] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const inviteLink = `${window.location.origin}${BASE}/org?invite=${encodeURIComponent(inviteCode)}`;

  async function copyInviteLink() {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 1500);
    } catch { flash("Could not copy — copy it manually."); }
  }

  const flash = (msg: string) => { setToast(msg); window.setTimeout(() => setToast(null), 2200); };

  const visibleMembers = useMemo(
    () => DEMO_MEMBERS.filter(m => !removed.includes(m.id)),
    [removed],
  );

  function removeMember(id: string) {
    if (!isDemoOrg) return;
    const member = DEMO_MEMBERS.find(m => m.id === id);
    if (member?.role === "manager") { flash("You can't remove the organisation manager."); return; }
    if (!window.confirm(`Remove ${member?.name ?? "this member"} from the organisation?`)) return;
    const next = [...removed, id];
    setRemoved(next);
    setRemovedMemberIds(orgId, next);
    flash(`Removed ${member?.name ?? "member"}.`);
  }

  function restoreMember(id: string) {
    const next = removed.filter(x => x !== id);
    setRemoved(next);
    setRemovedMemberIds(orgId, next);
  }

  function regenerateInvite() {
    if (!window.confirm("Revoke and regenerate the invite code? Anyone with the old code won't be able to use it.")) return;
    const next = generateInviteCode();
    setInviteCode(next);
    setOrgInviteCode(orgId, next);
    flash("Invite code regenerated.");
  }

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch { flash("Could not copy — copy it manually."); }
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

  if (!isDemoOrg) {
    return (
      <div className="bg-white border border-border rounded-xl p-5">
        <h3 className="text-sm font-semibold mb-2">Members</h3>
        <p className="text-xs text-muted-foreground">Member management for live organisations is coming soon. Members currently join via the invite link from your dashboard.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-foreground text-white text-xs px-3 py-2 rounded-lg shadow" role="status">{toast}</div>
      )}

      {/* Invite link management */}
      <div className="bg-white border border-border rounded-xl p-5" data-testid="section-invite">
        <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold">Invite code & link</h3>
            <p className="text-xs text-muted-foreground">Share either the code or the full link with people you want to join your organisation.</p>
          </div>
          <button
            type="button"
            onClick={regenerateInvite}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-semibold hover:bg-muted/30 transition-colors"
            data-testid="button-regenerate-invite"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Revoke & regenerate
          </button>
        </div>
        <div className="space-y-2">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Code</p>
            <div className="flex items-center gap-2">
              <code className="px-3 py-2 rounded-md bg-muted/40 font-mono text-sm font-semibold text-foreground" data-testid="text-invite-code">{inviteCode}</code>
              <button
                type="button"
                onClick={copyInvite}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-xs font-semibold hover:bg-muted/30 transition-colors"
                data-testid="button-copy-invite"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />} {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Link</p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={inviteLink}
                onFocus={e => e.currentTarget.select()}
                className="flex-1 px-3 py-2 rounded-md bg-muted/40 font-mono text-xs text-foreground border border-border focus:outline-none focus:border-primary"
                data-testid="text-invite-link"
              />
              <button
                type="button"
                onClick={copyInviteLink}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-xs font-semibold hover:bg-muted/30 transition-colors"
                data-testid="button-copy-invite-link"
              >
                {linkCopied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />} {linkCopied ? "Copied" : "Copy link"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Members table */}
      <div className="bg-white border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <h3 className="text-sm font-semibold">Members</h3>
            <p className="text-xs text-muted-foreground">{visibleMembers.length} of {DEMO_MEMBERS.length} active. Demo data.</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted-foreground border-b border-border">
                <th className="py-2 pr-3 font-semibold uppercase text-[10px] tracking-wider">Name</th>
                <th className="py-2 pr-3 font-semibold uppercase text-[10px] tracking-wider">Email</th>
                <th className="py-2 pr-3 font-semibold uppercase text-[10px] tracking-wider">Role</th>
                <th className="py-2 pr-3 font-semibold uppercase text-[10px] tracking-wider">Region</th>
                <th className="py-2 pr-3 font-semibold uppercase text-[10px] tracking-wider">Joined</th>
                <th className="py-2 pr-3 font-semibold uppercase text-[10px] tracking-wider text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {visibleMembers.map(m => (
                <tr key={m.id} className="border-b border-border/60" data-testid={`row-member-${m.id}`}>
                  <td className="py-2 pr-3 font-medium text-foreground">{m.name}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{m.email}</td>
                  <td className="py-2 pr-3">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${m.role === "manager" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                      {m.role}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-muted-foreground">{m.region}</td>
                  <td className="py-2 pr-3 text-muted-foreground whitespace-nowrap">{new Date(m.joinedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</td>
                  <td className="py-2 pr-3 text-right">
                    {m.role === "manager" ? (
                      <span className="text-[10px] text-muted-foreground italic">manager</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => removeMember(m.id)}
                        className="inline-flex items-center gap-1 text-[11px] text-red-600 hover:text-red-700 font-semibold"
                        data-testid={`button-remove-${m.id}`}
                      >
                        <Trash2 className="w-3 h-3" /> Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {removed.length > 0 && (
          <div className="mt-4 pt-3 border-t border-border">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Recently removed</p>
            <ul className="space-y-1">
              {removed.map(id => {
                const m = DEMO_MEMBERS.find(x => x.id === id);
                if (!m) return null;
                return (
                  <li key={id} className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{m.name} <span className="text-[10px]">({m.email})</span></span>
                    <button onClick={() => restoreMember(id)} className="text-primary hover:underline text-[11px] font-semibold">Restore</button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {/* Pending invites */}
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
            className="flex-1 px-3 py-1.5 rounded-md border border-border text-xs focus:outline-none focus:border-primary"
            data-testid="input-new-invite"
          />
          <button type="submit" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors" data-testid="button-send-invite">
            <Plus className="w-3.5 h-3.5" /> Send invite
          </button>
        </form>
        {invites.length === 0 ? (
          <p className="text-xs text-muted-foreground">No pending invites.</p>
        ) : (
          <ul className="divide-y divide-border">
            {invites.map(inv => (
              <li key={inv.id} className="flex items-center justify-between gap-3 py-2 text-xs" data-testid={`row-invite-${inv.id}`}>
                <div>
                  <p className="font-medium text-foreground">{inv.email}</p>
                  <p className="text-[10px] text-muted-foreground">
                    Sent {new Date(inv.sentAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                    {inv.resentAt && ` · Resent ${new Date(inv.resentAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => resendInvite(inv.id)} className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border text-[11px] font-semibold hover:bg-muted/30" data-testid={`button-resend-${inv.id}`}>
                    <RefreshCw className="w-3 h-3" /> Resend
                  </button>
                  <button onClick={() => revokeInvite(inv.id)} className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border text-[11px] font-semibold text-red-600 hover:bg-red-50" data-testid={`button-revoke-${inv.id}`}>
                    <X className="w-3 h-3" /> Revoke
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function AiFeaturesTab({ initialEnabled }: { initialEnabled: boolean }) {
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState<boolean>(initialEnabled);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setEnabled(initialEnabled); }, [initialEnabled]);

  const mutation = useMutation<{ org: { aiSidekickEnabled: boolean } }, Error, boolean>({
    mutationFn: async (next) => {
      const res = await fetch(`${BASE}/api/org/my/settings`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aiSidekickEnabled: next }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? "Failed to save");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setEnabled(data.org.aiSidekickEnabled);
      setSavedAt(Date.now());
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["my-org"] });
    },
    onError: (err) => {
      setEnabled(initialEnabled);
      setError(err.message);
    },
  });

  function toggle(next: boolean) {
    setEnabled(next); // optimistic
    setError(null);
    mutation.mutate(next);
  }

  return (
    <div className="bg-white border border-border rounded-xl p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold mb-1">AI features</h3>
          <p className="text-xs text-muted-foreground max-w-prose">
            Controls whether your members see the in-app AI Sidekick — used for activity suggestions, summarising journal entries and answering questions about their impact. Turning it off hides the feature for everyone in your organisation.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          disabled={mutation.isPending}
          onClick={() => toggle(!enabled)}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${enabled ? "bg-primary" : "bg-muted"}`}
          data-testid="toggle-ai"
        >
          <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform ${enabled ? "translate-x-5" : "translate-x-0.5"}`} />
        </button>
      </div>
      <div className="mt-4 text-xs">
        <p className={enabled ? "text-green-700" : "text-muted-foreground"}>
          AI Sidekick is currently <strong>{enabled ? "enabled" : "disabled"}</strong> for everyone in this organisation.
        </p>
        {mutation.isPending && (
          <p className="text-[11px] text-muted-foreground mt-1 inline-flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" /> Saving…
          </p>
        )}
        {!mutation.isPending && savedAt && !error && (
          <p className="text-[11px] text-muted-foreground mt-1 inline-flex items-center gap-1">
            <Check className="w-3 h-3 text-green-600" /> Saved
          </p>
        )}
        {error && (
          <p className="text-[11px] text-red-600 mt-1">{error}</p>
        )}
      </div>
    </div>
  );
}

function ProfileTab({ org, isDemoOrg }: { org: { id: string; name: string; type: string }; isDemoOrg: boolean }) {
  return (
    <div className="bg-white border border-border rounded-xl p-5 space-y-3 text-sm">
      <h3 className="text-sm font-semibold mb-2">Organisation profile</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Display name</p>
          <p className="font-semibold text-foreground">{isDemoOrg ? DEMO_ORG_NAME : org.name}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Type</p>
          <p className="font-semibold text-foreground capitalize">{isDemoOrg ? DEMO_ORG_TYPE : org.type}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Manager contact</p>
          <p className="font-semibold text-foreground">{isDemoOrg ? DEMO_ORG_CONTACT_EMAIL : "—"}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Invite code</p>
          <p className="font-mono font-semibold text-foreground">{isDemoOrg ? getOrgInviteCode(org.id, DEMO_INVITE_CODE) : "—"}</p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground pt-2 border-t border-border">
        To change these details, contact us at <a className="text-primary underline" href="mailto:hello@myimpact.uk">hello@myimpact.uk</a>.
      </p>
    </div>
  );
}

export default function OrgSettings() {
  const { data: orgData, isLoading, isError } = useMyOrg();
  const [active, setActive] = useState<TabKey>("members");

  if (isLoading) {
    return <div className="max-w-5xl mx-auto px-4 py-16 flex justify-center">
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
    <div className="max-w-5xl mx-auto px-4 py-8">
      <Link href="/org/dashboard" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-3">
        <ArrowLeft className="w-3.5 h-3.5" /> Back to dashboard
      </Link>
      <div className="mb-6">
        <h1 className="text-2xl font-display font-semibold text-foreground">Organisation settings</h1>
        <p className="text-sm text-muted-foreground">{orgData.org.name}</p>
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
              className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${isActive ? "bg-primary text-white border-primary" : "border-border text-foreground hover:bg-muted/30"}`}
              data-testid={`tab-${t.key}`}
            >
              <Icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          );
        })}
      </div>

      <motion.div key={active} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
        {active === "members"   && <MembersTab isDemoOrg={isDemoOrg} orgId={orgData.org.id} />}
        {active === "ai"        && <AiFeaturesTab initialEnabled={orgData.org.aiSidekickEnabled ?? true} />}
        {active === "sso"       && <OrgSsoConfigPanel orgId={orgData.org.id} />}
        {active === "developer" && <DeveloperApiSection />}
        {active === "share"     && <ShareLinkManager />}
        {active === "profile"   && <ProfileTab org={orgData.org} isDemoOrg={isDemoOrg} />}
      </motion.div>
    </div>
  );
}
