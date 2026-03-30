import { useState, useEffect, useCallback, useRef } from "react";
import { Globe, Lock, CheckCircle, AlertCircle, Loader2, Copy, Check, ExternalLink, Info } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface PublicProfileData {
  userId: string;
  slug: string;
  isEnabled: boolean;
  customMessage: string | null;
  showHours: boolean;
  showSroi: boolean;
  showCategories: boolean;
  showJournalHighlights: boolean;
  slugCustomised: boolean;
  createdAt: string;
  updatedAt: string;
}

function Toggle({ enabled, onToggle, disabled }: { enabled: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={onToggle}
      disabled={disabled}
      className="relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      style={{ background: enabled ? "#F06127" : "#d1d5db" }}
    >
      <span
        className="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform"
        style={{ transform: enabled ? "translateX(16px)" : "translateX(0)" }}
      />
    </button>
  );
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;

export default function PublicProfileSettings() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [profile, setProfile] = useState<PublicProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [enabling, setEnabling] = useState(false);
  const [saving, setSaving] = useState(false);

  const [customMessage, setCustomMessage] = useState("");
  const [showHours, setShowHours] = useState(true);
  const [showSroi, setShowSroi] = useState(true);
  const [showCategories, setShowCategories] = useState(true);
  const [showJournalHighlights, setShowJournalHighlights] = useState(false);
  const [slugInput, setSlugInput] = useState("");
  const [slugStatus, setSlugStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle");
  const [slugError, setSlugError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [gdprDismissed, setGdprDismissed] = useState(false);
  const [gdprAcknowledged, setGdprAcknowledged] = useState(false);

  const slugCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchProfile = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/api/public-profile/me`, { credentials: "include" });
      const data = await res.json();
      const p: PublicProfileData | null = data.profile ?? null;
      setProfile(p);
      if (p) {
        setCustomMessage(p.customMessage ?? "");
        setShowHours(p.showHours);
        setShowSroi(p.showSroi);
        setShowCategories(p.showCategories);
        setShowJournalHighlights(p.showJournalHighlights);
        setSlugInput(p.slug);
      }
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleEnable = async () => {
    if (!gdprAcknowledged) {
      setGdprDismissed(false);
      return;
    }
    setEnabling(true);
    try {
      const res = await fetch(`${BASE}/api/public-profile/enable`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to enable public profile");
      const p: PublicProfileData = data.profile;
      setProfile(p);
      setCustomMessage(p.customMessage ?? "");
      setShowHours(p.showHours);
      setShowSroi(p.showSroi);
      setShowCategories(p.showCategories);
      setShowJournalHighlights(p.showJournalHighlights);
      setSlugInput(p.slug);
      toast({ title: "Public profile enabled", description: `Your profile is live at /profile/${p.slug}` });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Something went wrong";
      toast({ title: "Could not enable", description: msg, variant: "destructive" });
    } finally {
      setEnabling(false);
    }
  };

  const handleDisable = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      const res = await fetch(`${BASE}/api/public-profile`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isEnabled: false }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to disable");
      setProfile(data.profile);
      toast({ title: "Public profile disabled", description: "Your profile page is no longer publicly accessible." });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Something went wrong";
      toast({ title: "Could not disable", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleReEnable = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      const res = await fetch(`${BASE}/api/public-profile`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isEnabled: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to enable");
      setProfile(data.profile);
      toast({ title: "Public profile enabled", description: `Your profile is live again at /profile/${data.profile.slug}` });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Something went wrong";
      toast({ title: "Could not enable", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const checkSlug = useCallback(async (slug: string) => {
    if (!slug || slug.length < 3) { setSlugStatus("invalid"); setSlugError("Slug must be at least 3 characters."); return; }
    if (slug.length > 30) { setSlugStatus("invalid"); setSlugError("Slug must be at most 30 characters."); return; }
    if (!SLUG_RE.test(slug)) {
      setSlugStatus("invalid");
      setSlugError("Only lowercase letters, numbers, and hyphens. Must not start or end with a hyphen.");
      return;
    }
    setSlugStatus("checking");
    setSlugError(null);
    try {
      const res = await fetch(`${BASE}/api/public-profile/check-slug/${encodeURIComponent(slug)}`, { credentials: "include" });
      const data = await res.json();
      if (data.available) {
        setSlugStatus("available");
        setSlugError(null);
      } else {
        setSlugStatus("taken");
        setSlugError(data.error ?? "Slug is not available.");
      }
    } catch {
      setSlugStatus("idle");
    }
  }, []);

  const handleSlugChange = (val: string) => {
    const clean = val.toLowerCase().replace(/[^a-z0-9-]/g, "");
    setSlugInput(clean);
    setSlugStatus("idle");
    setSlugError(null);
    if (slugCheckTimer.current) clearTimeout(slugCheckTimer.current);
    if (clean !== profile?.slug) {
      slugCheckTimer.current = setTimeout(() => checkSlug(clean), 500);
    } else {
      setSlugStatus("idle");
    }
  };

  const handleSaveSettings = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        customMessage: customMessage.trim() || null,
        showHours,
        showSroi,
        showCategories,
        showJournalHighlights,
      };

      const slugChanged = slugInput !== profile.slug;
      if (slugChanged) {
        if (slugStatus === "taken" || slugStatus === "invalid") {
          toast({ title: "Invalid slug", description: slugError ?? "Please fix the slug before saving.", variant: "destructive" });
          setSaving(false);
          return;
        }
        if (profile.slugCustomised) {
          toast({ title: "Slug already set", description: "You can only customise your slug once.", variant: "destructive" });
          setSaving(false);
          return;
        }
        body.slug = slugInput;
      }

      const res = await fetch(`${BASE}/api/public-profile`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setProfile(data.profile);
      setSlugInput(data.profile.slug);
      toast({ title: "Settings saved", description: "Your public profile settings have been updated." });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Something went wrong";
      toast({ title: "Could not save", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const publicUrl = profile ? `${window.location.origin}${BASE}/profile/${profile.slug}` : "";

  const handleCopy = () => {
    if (!publicUrl) return;
    navigator.clipboard.writeText(publicUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // If no profile yet, or profile is disabled and user wants to enable
  if (!profile || !profile.isEnabled) {
    return (
      <section className="bg-white rounded-2xl border border-border shadow-sm mb-4 overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <Globe className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-foreground">Public profile</h2>
        </div>
        <div className="px-5 py-5 space-y-4">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Share your social impact with employers, universities, charities, or anyone you choose. Your public profile shows only the information you select.
          </p>

          {profile && !profile.isEnabled && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
              <Info className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" aria-hidden="true" />
              <p className="text-xs text-amber-800">
                Your public profile is currently disabled. Your previous URL (<code className="font-mono">/profile/{profile.slug}</code>) is inaccessible. Re-enable to restore it.
              </p>
            </div>
          )}

          {!gdprDismissed && (
            <div className="p-4 rounded-xl border border-blue-200 bg-blue-50 space-y-3">
              <div className="flex items-start gap-2">
                <Lock className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" aria-hidden="true" />
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-blue-800">Before you publish — please read</p>
                  <ul className="text-xs text-blue-700 space-y-1 list-disc list-inside">
                    <li>Your public page will be visible to anyone with the link — no login required.</li>
                    <li>Only the sections you choose to share will appear. Nothing else is exposed.</li>
                    <li>You can turn off or update your public profile at any time.</li>
                    <li>Deleting your account removes your public profile immediately.</li>
                    <li>Your email address is never shown on your public page.</li>
                  </ul>
                </div>
              </div>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={gdprAcknowledged}
                  onChange={e => setGdprAcknowledged(e.target.checked)}
                  className="mt-0.5 rounded border-border"
                />
                <span className="text-xs text-blue-800">I understand what publishing my profile means.</span>
              </label>
            </div>
          )}

          {profile && !profile.isEnabled ? (
            <button
              onClick={handleReEnable}
              disabled={saving || (!gdprAcknowledged && !gdprDismissed)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-primary text-white hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
              Re-enable public profile
            </button>
          ) : (
            <button
              onClick={() => {
                if (!gdprAcknowledged) {
                  setGdprDismissed(false);
                  return;
                }
                handleEnable();
              }}
              disabled={enabling || !gdprAcknowledged}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-primary text-white hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {enabling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
              Enable public profile
            </button>
          )}
        </div>
      </section>
    );
  }

  // Profile is enabled — show settings
  const slugChanged = slugInput !== profile.slug;
  const slugStatusIcon = slugStatus === "checking" ? (
    <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
  ) : slugStatus === "available" ? (
    <CheckCircle className="w-3.5 h-3.5 text-green-600" />
  ) : slugStatus === "taken" || slugStatus === "invalid" ? (
    <AlertCircle className="w-3.5 h-3.5 text-destructive" />
  ) : null;

  return (
    <section className="bg-white rounded-2xl border border-border shadow-sm mb-4 overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-foreground">Public profile</h2>
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
            Live
          </span>
        </div>
        <button
          onClick={handleDisable}
          disabled={saving}
          className="text-xs text-muted-foreground hover:text-destructive transition-colors"
        >
          Disable
        </button>
      </div>

      <div className="px-5 py-5 space-y-5">
        {/* Public URL */}
        <div>
          <label className="block text-xs font-medium text-foreground mb-1.5">Your public URL</label>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
            <span className="text-sm text-foreground truncate flex-1 font-mono text-xs">{publicUrl}</span>
            <button
              onClick={handleCopy}
              className="shrink-0 p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Copy URL"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
            <a
              href={`${BASE}/profile/${profile.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Open profile in new tab"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        {/* Slug */}
        <div>
          <label htmlFor="profile-slug" className="block text-xs font-medium text-foreground mb-1">
            Custom URL slug {profile.slugCustomised && <span className="text-muted-foreground font-normal">(already set — cannot be changed again)</span>}
          </label>
          {!profile.slugCustomised && (
            <p className="text-xs text-muted-foreground mb-2">You can customise your slug once. Choose carefully — this cannot be changed again.</p>
          )}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground shrink-0">/profile/</span>
            <div className="relative flex-1">
              <input
                id="profile-slug"
                type="text"
                value={slugInput}
                onChange={e => handleSlugChange(e.target.value)}
                disabled={profile.slugCustomised}
                maxLength={30}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition disabled:opacity-50 disabled:cursor-not-allowed pr-8"
                placeholder="your-slug"
              />
              {slugChanged && (
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2">{slugStatusIcon}</span>
              )}
            </div>
          </div>
          {slugChanged && slugError && (
            <p className="mt-1.5 text-xs text-destructive">{slugError}</p>
          )}
          {slugChanged && slugStatus === "available" && (
            <p className="mt-1.5 text-xs text-green-600">This slug is available.</p>
          )}
          {slugChanged && !profile.slugCustomised && (
            <p className="mt-1.5 text-xs text-amber-600 flex items-center gap-1">
              <Info className="w-3 h-3" />
              Preview: {window.location.origin}{BASE}/profile/{slugInput || "…"}
            </p>
          )}
        </div>

        {/* What to show */}
        <div>
          <p className="text-xs font-medium text-foreground mb-2">What to show on your public page</p>
          <div className="space-y-2">
            {[
              { key: "showHours" as const, label: "Total volunteering hours", value: showHours, set: setShowHours },
              { key: "showSroi" as const, label: "Total SROI (social value)", value: showSroi, set: setShowSroi },
              { key: "showCategories" as const, label: "Activity categories", value: showCategories, set: setShowCategories },
              { key: "showJournalHighlights" as const, label: "Journal highlights (recent entries)", value: showJournalHighlights, set: setShowJournalHighlights },
            ].map(({ key, label, value, set }) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-sm text-foreground">{label}</span>
                <Toggle enabled={value} onToggle={() => set(!value)} />
              </div>
            ))}
          </div>
        </div>

        {/* Custom message */}
        <div>
          <label htmlFor="custom-message" className="block text-xs font-medium text-foreground mb-1">
            Personal message <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <p className="text-xs text-muted-foreground mb-2">
            A short note shown at the top of your public page — a personal statement, call for support, or motivational message.
          </p>
          <textarea
            id="custom-message"
            value={customMessage}
            onChange={e => setCustomMessage(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="e.g. I'm passionate about community volunteering and looking for opportunities to make a difference…"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition resize-none"
          />
          <p className="text-xs text-muted-foreground text-right mt-0.5">{customMessage.length}/500</p>
        </div>

        {/* Save */}
        <button
          onClick={handleSaveSettings}
          disabled={saving || (slugChanged && (slugStatus === "taken" || slugStatus === "invalid" || slugStatus === "checking"))}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-primary text-white hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
          Save settings
        </button>
      </div>
    </section>
  );
}
