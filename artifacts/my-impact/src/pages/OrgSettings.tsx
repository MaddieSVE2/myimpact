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
  DEMO_ORG_CONTACT_EMAIL, DEMO_MEMBERS,
  getOrgInviteCode, setOrgInviteCode, generateInviteCode,
  getRemovedMemberIds, setRemovedMemberIds,
} from "@/lib/org-demo-mock";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface OrgBranding {
  logoUrl: string | null;
  logoKey: string | null;
  brandPrimary: string | null;
  brandAccent: string | null;
}
interface MyOrgResponse { org: { id: string; name: string; type: string; role: string; aiSidekickEnabled: boolean; branding?: OrgBranding } | null }

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
    } catch { flash("Could not copy, copy it manually."); }
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
            Controls whether your members see the in-app AI Sidekick, used for activity suggestions, summarising journal entries and answering questions about their impact. Turning it off hides the feature for everyone in your organisation.
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

function ProfileTab({ org, isDemoOrg }: { org: { id: string; name: string; type: string; branding?: OrgBranding }; isDemoOrg: boolean }) {
  return (
    <div className="space-y-4">
      <BrandingSection branding={org.branding ?? null} />

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
          <p className="font-semibold text-foreground">{isDemoOrg ? DEMO_ORG_CONTACT_EMAIL : "Not set"}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Invite code</p>
          <p className="font-mono font-semibold text-foreground">{isDemoOrg ? getOrgInviteCode(org.id, DEMO_INVITE_CODE) : "Not set"}</p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground pt-2 border-t border-border">
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
      <p className="text-xs text-muted-foreground mb-4">
        Your logo and colours appear on the org dashboard, header and exported PDF report.
      </p>

      {/* Live preview tile, shows what the dashboard header will look like
          with the manager's currently-edited (unsaved) logo + colours. */}
      <BrandingPreview logoUrl={logoUrl} primary={primary} accent={accent} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-4">
        {/* Logo */}
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Logo</p>
          <div className="flex items-center gap-3">
            <div className="w-24 h-24 rounded-lg border border-border bg-muted/20 flex items-center justify-center overflow-hidden">
              {logoUrl
                ? <img src={logoUrl} alt="Org logo" className="max-w-full max-h-full object-contain" />
                : <Building2 className="w-8 h-8 text-muted-foreground" />}
            </div>
            <div className="flex flex-col gap-2">
              <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-border hover:bg-muted/30 cursor-pointer">
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
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-border text-muted-foreground hover:bg-muted/30"
                  onClick={removeLogo}
                  disabled={busy}
                  data-testid="button-remove-logo"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Remove
                </button>
              )}
              <p className="text-[11px] text-muted-foreground">PNG, JPG, WebP or SVG · max 2 MB</p>
            </div>
          </div>
        </div>

        {/* Colours */}
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Brand colours</p>
          <div className="space-y-3">
            <ColourField label="Primary" value={primary} onChange={setPrimary} testId="primary" />
            <ColourField label="Accent"  value={accent}  onChange={setAccent}  testId="accent" />
            {showContrastWarning && (
              <div className="flex items-start gap-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>Your primary colour has low contrast against white text. Buttons and badges may be hard to read.</span>
              </div>
            )}
            <button
              type="button"
              onClick={saveColours}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-primary text-white hover:opacity-90 disabled:opacity-50"
              data-testid="button-save-colours"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Save colours
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 pt-4 mt-4 border-t border-border">
        <p className="text-[11px] text-muted-foreground">
          Reset returns your organisation to the default My Impact branding.
        </p>
        <button
          type="button"
          onClick={resetAll}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-border text-muted-foreground hover:bg-muted/30 disabled:opacity-50"
          data-testid="button-reset-branding"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Reset to defaults
        </button>
      </div>

      {error && <p className="text-xs text-red-600 mt-3" data-testid="branding-error">{error}</p>}
      {toast && <p className="text-xs text-emerald-700 mt-3" data-testid="branding-toast">{toast}</p>}
    </div>
  );
}

function BrandingPreview({ logoUrl, primary, accent }: { logoUrl: string | null; primary: string; accent: string }) {
  const valid = (h: string) => /^#[0-9A-Fa-f]{6}$/.test(h);
  const p = valid(primary) ? primary : DEFAULT_PRIMARY;
  const a = valid(accent)  ? accent  : DEFAULT_ACCENT;
  return (
    <div className="rounded-xl border border-border bg-muted/20 p-3" data-testid="branding-preview">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Live preview</p>
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
            <p className="text-[11px] text-muted-foreground">Header preview</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="px-3 py-1.5 rounded-md text-xs font-semibold text-white" style={{ backgroundColor: p }}>
            Primary action
          </button>
          <span className="px-2.5 py-1 rounded-md text-[11px] font-semibold border" style={{ color: a, borderColor: a }}>
            Accent badge
          </span>
        </div>
      </div>
    </div>
  );
}

function ColourField({ label, value, onChange, testId }: { label: string; value: string; onChange: (v: string) => void; testId: string }) {
  function setHex(v: string) {
    const h = v.startsWith("#") ? v : `#${v}`;
    onChange(h.toUpperCase());
  }
  const isValid = /^#[0-9A-Fa-f]{6}$/.test(value);
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground w-16">{label}</span>
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
        className="font-mono text-xs px-2 py-1.5 rounded border border-border w-24 uppercase"
        data-testid={`hex-${testId}`}
      />
      {!isValid && <span className="text-[10px] text-red-600">Invalid hex</span>}
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
        {active === "sso"       && <OrgSsoConfigPanel orgId={orgData.org.id} isDemoOrg={isDemoOrg} />}
        {active === "developer" && <DeveloperApiSection isDemoOrg={isDemoOrg} />}
        {active === "share"     && <ShareLinkManager isDemoOrg={isDemoOrg} />}
        {active === "profile"   && <ProfileTab org={orgData.org} isDemoOrg={isDemoOrg} />}
      </motion.div>
    </div>
  );
}
