import { useState } from "react";
import { Link } from "wouter";
import { User, Mail, Eye, LogOut, ChevronRight, CheckCircle, Building2, Smartphone } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import { useToast } from "@/hooks/use-toast";
import PublicProfileSettings from "./PublicProfileSettings";

export default function Settings() {
  const { user, updateProfile, logout } = useAuth();
  const { isHighContrast, toggleTheme } = useTheme();
  const { toast } = useToast();

  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSaveName = async () => {
    if (saving) return;
    setSaving(true);
    setSaved(false);
    try {
      await updateProfile({ displayName: displayName.trim() || null });
      setSaved(true);
      toast({ title: "Name saved", description: "Your display name has been updated." });
      setTimeout(() => setSaved(false), 2500);
    } catch {
      toast({ title: "Could not save", description: "Please try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const nameChanged = displayName.trim() !== (user?.displayName ?? "");

  return (
    <div className="max-w-lg mx-auto px-4 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-display font-bold text-foreground">Account settings</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage your profile and preferences.</p>
      </div>

      {/* Profile section */}
      <section className="bg-white rounded-2xl border border-border shadow-sm mb-4 overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <User className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-foreground">Profile</h2>
        </div>
        <div className="px-5 py-5 space-y-5">
          {/* Display name */}
          <div>
            <label htmlFor="display-name" className="block text-sm font-medium text-foreground mb-1.5">
              Display name
            </label>
            <p className="text-xs text-muted-foreground mb-2">
              This is how you appear in milestones and exports. Leave blank to use your email.
            </p>
            <div className="flex gap-2">
              <input
                id="display-name"
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && nameChanged) handleSaveName(); }}
                placeholder="e.g. Alex Smith"
                maxLength={80}
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition"
              />
              <button
                onClick={handleSaveName}
                disabled={!nameChanged || saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-white hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {saved ? <CheckCircle className="w-4 h-4" aria-hidden="true" /> : null}
                {saving ? "Saving…" : saved ? "Saved" : "Save"}
              </button>
            </div>
          </div>

          {/* Email — read-only */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Email address
            </label>
            <div className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/30 px-3 py-2">
              <Mail className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
              <span className="text-sm text-foreground">{user?.email}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              Your email is used for sign-in only and can't be changed here.
            </p>
          </div>
        </div>
      </section>

      {/* Preferences section */}
      <section className="bg-white rounded-2xl border border-border shadow-sm mb-4 overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <Eye className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-foreground">Preferences</h2>
        </div>
        <div className="py-1">
          <button
            onClick={toggleTheme}
            aria-pressed={isHighContrast}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors text-left"
          >
            <div>
              <p className="text-sm font-medium text-foreground">High contrast mode</p>
              <p className="text-xs text-muted-foreground mt-0.5">Increases colour contrast for better readability.</p>
            </div>
            <div
              className="relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors"
              style={{ background: isHighContrast ? "#F06127" : "#d1d5db" }}
            >
              <span
                className="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform"
                style={{ transform: isHighContrast ? "translateX(16px)" : "translateX(0)" }}
              />
            </div>
          </button>
        </div>
      </section>

      {/* Organisation section */}
      <section className="bg-white rounded-2xl border border-border shadow-sm mb-4 overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <Building2 className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-foreground">Organisation</h2>
        </div>
        <div className="py-1">
          <Link
            href="/org"
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors"
          >
            <div>
              <p className="text-sm font-medium text-foreground">My organisation</p>
              <p className="text-xs text-muted-foreground mt-0.5">View or join your organisation on My Impact.</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          </Link>
        </div>
      </section>

      {/* Public profile section */}
      <PublicProfileSettings />

      {/* App section */}
      <section className="bg-white rounded-2xl border border-border shadow-sm mb-8 overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-foreground">App</h2>
        </div>
        <div className="py-1">
          <Link
            href="/about"
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors"
          >
            <div>
              <p className="text-sm font-medium text-foreground">About My Impact</p>
              <p className="text-xs text-muted-foreground mt-0.5">How the platform works and what the numbers mean.</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          </Link>
        </div>
      </section>

      {/* Sign out */}
      <button
        onClick={() => logout()}
        className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-muted/30 hover:text-foreground transition-colors"
      >
        <LogOut className="w-4 h-4" aria-hidden="true" />
        Sign out
      </button>
    </div>
  );
}
