import { useState, useEffect } from "react";
import { Link } from "wouter";
import { User, Mail, Eye, LogOut, ChevronRight, CheckCircle, Building2, Smartphone, MailCheck, HardDrive, Sparkles, Repeat, Trash2, Pencil, Check, Mic, Bell, BellOff, Loader2, Pause, Languages, ShieldCheck, Download, AlertTriangle } from "lucide-react";
import { useLocation } from "wouter";
import {
  isPushSupported,
  currentPermission,
  enablePush,
  disablePush,
  fetchPreferences,
  updatePreferences,
  sendTestPush,
  type PushPreferencesResponse,
  type PushTriggerToggles,
} from "@/lib/push-client";
import { useAuth, type VoicePersona, type VoiceAccent } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/i18n";
import { LanguageToggle } from "@/components/LanguageToggle";
import PublicProfileSettings from "./PublicProfileSettings";
import CalendarSyncSection from "@/components/CalendarSyncSection";
import { StorageUsageBar } from "@/components/Attachments";
import { getRecapYear, clearRecapViewed } from "@/lib/recap-utils";
import {
  useListRecurringTemplates,
  useUpdateRecurringTemplate,
  useDeleteRecurringTemplate,
  getListRecurringTemplatesQueryKey,
  type RecurringTemplate,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { describeCadence } from "@/components/QuickLog";
import { CONTENT_CONTAINER } from "@/lib/layout";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function Settings() {
  const { user, updateProfile, logout } = useAuth();
  const { isHighContrast, toggleTheme } = useTheme();
  const { toast } = useToast();
  const t = useT();

  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [digestSaving, setDigestSaving] = useState(false);
  const digestOptIn = user?.emailDigestOptIn ?? true;

  const handleToggleDigest = async () => {
    if (digestSaving) return;
    setDigestSaving(true);
    const next = !digestOptIn;
    try {
      await updateProfile({ emailDigestOptIn: next });
      toast({
        title: next ? t("settings.monthlyRecapOnToast") : t("settings.monthlyRecapOffToast"),
        description: next ? t("settings.monthlyRecapOnDesc") : t("settings.monthlyRecapOffDesc"),
      });
    } catch {
      toast({
        title: t("settings.couldNotUpdate"),
        description: t("settings.pleaseTryAgain"),
        variant: "destructive",
      });
    } finally {
      setDigestSaving(false);
    }
  };

  const [gamificationSaving, setGamificationSaving] = useState(false);
  const gamificationEnabled = user?.gamificationEnabled ?? true;

  const handleToggleGamification = async () => {
    if (gamificationSaving) return;
    setGamificationSaving(true);
    const next = !gamificationEnabled;
    try {
      await updateProfile({ gamificationEnabled: next });
      toast({
        title: next ? t("settings.gamificationOnToast") : t("settings.gamificationOffToast"),
        description: next ? t("settings.gamificationOnDesc") : t("settings.gamificationOffDesc"),
      });
    } catch {
      toast({
        title: t("settings.couldNotUpdate"),
        description: t("settings.pleaseTryAgain"),
        variant: "destructive",
      });
    } finally {
      setGamificationSaving(false);
    }
  };

  const [emailOptIn, setEmailOptIn] = useState<boolean | null>(null);
  const [emailToggleSaving, setEmailToggleSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${BASE}/api/profile`, { credentials: "include" });
        const data = await res.json();
        if (!cancelled) {
          setEmailOptIn(data?.profile?.emailOptIn ?? true);
        }
      } catch {
        if (!cancelled) setEmailOptIn(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggleEmailOptIn = async () => {
    if (emailOptIn === null || emailToggleSaving) return;
    const next = !emailOptIn;
    setEmailToggleSaving(true);
    setEmailOptIn(next);
    try {
      const res = await fetch(`${BASE}/api/profile/email-opt-in`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailOptIn: next }),
      });
      if (!res.ok) throw new Error("Save failed");
      const data = await res.json();
      setEmailOptIn(data.emailOptIn);
      toast({
        title: next ? t("settings.emailsOnToast") : t("settings.emailsOffToast"),
        description: next ? t("settings.emailsOnDesc") : t("settings.emailsOffDesc"),
      });
    } catch {
      setEmailOptIn(!next);
      toast({ title: t("settings.couldNotSave"), description: t("settings.pleaseTryAgain"), variant: "destructive" });
    } finally {
      setEmailToggleSaving(false);
    }
  };

  const handleSaveName = async () => {
    if (saving) return;
    setSaving(true);
    setSaved(false);
    try {
      await updateProfile({ displayName: displayName.trim() || null });
      setSaved(true);
      toast({ title: t("settings.nameSavedToast"), description: t("settings.nameSavedDesc") });
      setTimeout(() => setSaved(false), 2500);
    } catch {
      toast({ title: t("settings.couldNotSave"), description: t("settings.pleaseTryAgain"), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const nameChanged = displayName.trim() !== (user?.displayName ?? "");

  return (
    <div className={`${CONTENT_CONTAINER} py-10`}>
      <div className="mb-8">
        <h1 className="text-2xl font-display font-bold text-foreground">{t("settings.title")}</h1>
        <p className="text-muted-foreground text-sm mt-1">{t("settings.subtitle")}</p>
      </div>

      {/* Profile section */}
      <section className="bg-white rounded-2xl border border-border shadow-sm mb-4 overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <User className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-foreground">{t("settings.profile")}</h2>
        </div>
        <div className="px-5 py-5 space-y-5">
          {/* Display name */}
          <div>
            <label htmlFor="display-name" className="block text-sm font-medium text-foreground mb-1.5">
              {t("settings.displayName")}
            </label>
            <p className="text-xs text-muted-foreground mb-2">
              {t("settings.displayNameHelp")}
            </p>
            <div className="flex gap-2">
              <input
                id="display-name"
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && nameChanged) handleSaveName(); }}
                placeholder={t("settings.displayNamePlaceholder")}
                maxLength={80}
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition"
              />
              <button
                onClick={handleSaveName}
                disabled={!nameChanged || saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-white hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {saved ? <CheckCircle className="w-4 h-4" aria-hidden="true" /> : null}
                {saving ? t("common.saving") : saved ? t("common.saved") : t("common.save")}
              </button>
            </div>
          </div>

          {/* Email, read-only */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              {t("settings.emailAddress")}
            </label>
            <div className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/30 px-3 py-2">
              <Mail className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
              <span className="text-sm text-foreground">{user?.email}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              {t("settings.emailHelp")}
            </p>
          </div>
        </div>
      </section>

      {/* Preferences section */}
      <section className="bg-white rounded-2xl border border-border shadow-sm mb-4 overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <Eye className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-foreground">{t("settings.preferences")}</h2>
        </div>
        <div className="py-1 divide-y divide-border">
          <button
            onClick={toggleTheme}
            aria-pressed={isHighContrast}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors text-left"
          >
            <div>
              <p className="text-sm font-medium text-foreground">{t("settings.highContrastLabel")}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t("settings.highContrastDesc")}</p>
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
          <button
            onClick={handleToggleGamification}
            aria-pressed={gamificationEnabled}
            disabled={gamificationSaving}
            data-testid="toggle-gamification"
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors text-left disabled:opacity-60"
          >
            <div className="pr-3">
              <p className="text-sm font-medium text-foreground">{t("settings.gamificationLabel")}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t("settings.gamificationDesc")}</p>
            </div>
            <div
              className="relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors"
              style={{ background: gamificationEnabled ? "#F06127" : "#d1d5db" }}
            >
              <span
                className="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform"
                style={{ transform: gamificationEnabled ? "translateX(16px)" : "translateX(0)" }}
              />
            </div>
          </button>
        </div>
      </section>

      {/* Language section */}
      <section className="bg-white rounded-2xl border border-border shadow-sm mb-4 overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <Languages className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-foreground">{t("settings.languageLabel")}</h2>
        </div>
        <div className="px-5 py-4 flex items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground pr-2">{t("settings.languageDesc")}</p>
          <LanguageToggle variant="inline" showToast />
        </div>
      </section>

      <SidekickVoiceSettings />

      {/* Email section */}
      <section className="bg-white rounded-2xl border border-border shadow-sm mb-4 overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <Mail className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-foreground">{t("settings.email")}</h2>
        </div>
        <div className="py-1 divide-y divide-border">
          <button
            onClick={handleToggleEmailOptIn}
            aria-pressed={emailOptIn === true}
            disabled={emailOptIn === null || emailToggleSaving}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors text-left disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <div className="pr-4">
              <p className="text-sm font-medium text-foreground">{t("settings.onboardingEmails")}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("settings.onboardingEmailsDesc")}
              </p>
            </div>
            <div
              className="relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors"
              style={{ background: emailOptIn ? "#F06127" : "#d1d5db" }}
            >
              <span
                className="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform"
                style={{ transform: emailOptIn ? "translateX(16px)" : "translateX(0)" }}
              />
            </div>
          </button>
          <button
            onClick={handleToggleDigest}
            aria-pressed={digestOptIn}
            disabled={digestSaving}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors text-left disabled:opacity-60"
          >
            <div className="pr-3">
              <p className="text-sm font-medium text-foreground">{t("settings.monthlyRecap")}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("settings.monthlyRecapDesc")}
              </p>
            </div>
            <div
              className="relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors"
              style={{ background: digestOptIn ? "#F06127" : "#d1d5db" }}
            >
              <span
                className="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform"
                style={{ transform: digestOptIn ? "translateX(16px)" : "translateX(0)" }}
              />
            </div>
          </button>
        </div>
      </section>

      {/* Organisation section */}
      <section className="bg-white rounded-2xl border border-border shadow-sm mb-4 overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <Building2 className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-foreground">{t("settings.organisation")}</h2>
        </div>
        <div className="py-1 divide-y divide-border">
          <Link
            href="/org"
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors"
          >
            <div>
              <p className="text-sm font-medium text-foreground">{t("settings.myOrganisation")}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t("settings.myOrganisationDesc")}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          </Link>
          <PulseOptOutRow />
        </div>
      </section>

      {/* Storage usage section */}
      <section className="bg-white rounded-2xl border border-border shadow-sm mb-4 overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-foreground">{t("settings.storage")}</h2>
        </div>
        <div className="px-5 py-5">
          <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
            {t("settings.storageDesc")}
          </p>
          <StorageUsageBar />
        </div>
      </section>

      {/* Reminders / push notifications section, feature-detected. */}
      <RemindersSettings />

      {/* Recurring templates section */}
      <TemplatesSettings />

      {/* Calendar sync section */}
      <CalendarSyncSection />

      {/* Public profile section */}
      <PublicProfileSettings />

      {/* Annual recap section */}
      <section className="bg-white rounded-2xl border border-border shadow-sm mb-4 overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-foreground">{t("settings.yearInImpact")}</h2>
        </div>
        <div className="py-1">
          <Link
            href={`/recap?year=${getRecapYear()}`}
            onClick={() => clearRecapViewed(getRecapYear())}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors"
          >
            <div>
              <p className="text-sm font-medium text-foreground">{t("settings.viewYearRecap", { year: getRecapYear() })}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t("settings.viewYearRecapDesc")}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          </Link>
        </div>
      </section>

      {/* GDPR / your data section */}
      <YourDataSection />

      {/* App section */}
      <section className="bg-white rounded-2xl border border-border shadow-sm mb-8 overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-foreground">{t("settings.app")}</h2>
        </div>
        <div className="py-1">
          <Link
            href="/about"
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors"
          >
            <div>
              <p className="text-sm font-medium text-foreground">{t("settings.aboutMyImpact")}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t("settings.aboutMyImpactDesc")}</p>
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
        {t("settings.signOut")}
      </button>
    </div>
  );
}

function YourDataSection() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [exporting, setExporting] = useState(false);
  const [wipingImpact, setWipingImpact] = useState(false);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDownload = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const res = await fetch(`${BASE}/api/profile/export`, { credentials: "include" });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `my-impact-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({
        title: "Export ready",
        description: "Your data has been downloaded as a JSON file.",
      });
    } catch {
      toast({
        title: "Couldn't export your data",
        description: "Please try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  };

  const handleWipeImpact = async () => {
    if (wipingImpact) return;
    setWipingImpact(true);
    try {
      const res = await fetch(`${BASE}/api/impact/all`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Delete failed");
      setConfirmWipe(false);
      toast({
        title: "Impact data deleted",
        description: "All your impact records and journal entries have been removed.",
      });
    } catch {
      toast({
        title: "Couldn't delete your impact data",
        description: "Please try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setWipingImpact(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleting) return;
    setDeleteError(null);
    setDeleting(true);
    try {
      const res = await fetch(`${BASE}/api/profile/delete-account`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmEmail: confirmEmail.trim().toLowerCase() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? "Could not delete your account.");
      }
      // Hard reload to reset all client state and head to the home page.
      window.location.href = `${BASE}/`;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Could not delete your account.";
      setDeleteError(message);
      setDeleting(false);
    }
  };

  const userEmail = user?.email ?? "";
  const confirmMatches =
    confirmEmail.trim().toLowerCase() === userEmail.trim().toLowerCase() && userEmail.length > 0;

  return (
    <section
      className="bg-white rounded-2xl border border-border shadow-sm mb-4 overflow-hidden"
      data-testid="section-your-data"
    >
      <div className="px-5 py-4 border-b border-border flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-foreground">Your data</h2>
      </div>
      <div className="px-5 py-5 space-y-4">
        <p className="text-xs text-muted-foreground leading-relaxed">
          You're in control of your data. Download a complete copy any time, wipe just your impact
          history, or permanently delete your account.
        </p>

        <button
          onClick={handleDownload}
          disabled={exporting}
          data-testid="button-export-data"
          className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-border hover:bg-muted/30 transition-colors text-left disabled:opacity-60"
        >
          <div className="flex items-center gap-3">
            <Download className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium text-foreground">Download my data</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Get a JSON file containing every record we hold for your account.
              </p>
            </div>
          </div>
          {exporting ? (
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" aria-hidden="true" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          )}
        </button>

        {!confirmWipe ? (
          <button
            onClick={() => setConfirmWipe(true)}
            data-testid="button-wipe-impact"
            className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-border hover:bg-muted/30 transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              <Trash2 className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium text-foreground">Delete all my impact data</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Removes every impact record, journal entry, attachment and recurring template.
                  Your account itself stays.
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          </button>
        ) : (
          <div
            className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3"
            data-testid="confirm-wipe-impact"
          >
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" aria-hidden="true" />
              <p className="text-sm text-amber-900">
                Are you sure? This permanently removes all your impact records, journal entries
                and attachments. It can't be undone.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmWipe(false)}
                disabled={wipingImpact}
                className="flex-1 px-3 py-2 rounded-lg border border-amber-300 bg-white text-sm font-semibold text-amber-900 hover:bg-amber-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleWipeImpact}
                disabled={wipingImpact}
                data-testid="button-wipe-impact-confirm"
                className="flex-1 px-3 py-2 rounded-lg bg-amber-600 text-sm font-semibold text-white hover:bg-amber-700 transition-colors disabled:opacity-60"
              >
                {wipingImpact ? "Deleting…" : "Yes, delete it all"}
              </button>
            </div>
          </div>
        )}

        <button
          onClick={() => {
            setConfirmEmail("");
            setDeleteError(null);
            setShowDeleteModal(true);
          }}
          data-testid="button-open-delete-account"
          className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 transition-colors text-left"
        >
          <div className="flex items-center gap-3">
            <Trash2 className="w-4 h-4 text-red-700" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-red-900">Delete my account</p>
              <p className="text-xs text-red-800/80 mt-0.5">
                Permanently erases your account, all data and attachments. We'll email you a
                confirmation.
              </p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-red-700" aria-hidden="true" />
        </button>
      </div>

      {showDeleteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-account-title"
          data-testid="modal-delete-account"
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 id="delete-account-title" className="text-lg font-bold text-foreground mb-2">
              Delete your account?
            </h3>
            <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
              This permanently erases your account, every impact record, every journal entry,
              every attachment and your preferences. We'll send a confirmation email when it's
              done. This <strong>cannot be undone</strong>.
            </p>
            <label htmlFor="confirm-email" className="block text-sm font-medium text-foreground mb-1.5">
              Type <strong>{userEmail}</strong> to confirm:
            </label>
            <input
              id="confirm-email"
              type="email"
              autoComplete="off"
              value={confirmEmail}
              onChange={(e) => { setConfirmEmail(e.target.value); setDeleteError(null); }}
              placeholder={userEmail}
              data-testid="input-confirm-delete-email"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/40"
            />
            {deleteError && (
              <p className="mt-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                {deleteError}
              </p>
            )}
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => { if (!deleting) setShowDeleteModal(false); }}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 rounded-lg border border-border text-sm font-semibold text-foreground hover:bg-muted/30 transition-colors disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={!confirmMatches || deleting}
                data-testid="button-confirm-delete-account"
                className="flex-1 px-4 py-2.5 rounded-lg bg-red-600 text-sm font-semibold text-white hover:bg-red-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {deleting ? "Deleting…" : "Permanently delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function PulseOptOutRow() {
  const { toast } = useToast();
  const [optedOut, setOptedOut] = useState<boolean | null>(null);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [available, setAvailable] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${BASE}/api/org/surveys/opt-out`, { credentials: "include" });
        if (res.status === 404) {
          if (!cancelled) setAvailable(false);
          return;
        }
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setAvailable(true);
          setOptedOut(!!data.optedOut);
          setOrgName(data.orgName ?? null);
        }
      } catch {
        // ignore
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleToggle = async () => {
    if (saving) return;
    const next = !optedOut;
    setSaving(true);
    setOptedOut(next);
    try {
      const res = await fetch(`${BASE}/api/org/surveys/opt-out`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optedOut: next }),
      });
      if (!res.ok) throw new Error();
      toast({
        title: next ? "Pulse surveys turned off" : "Pulse surveys turned on",
        description: next
          ? `You won't see pulse prompts from ${orgName ?? "your organisation"}.`
          : `You'll see new pulse prompts from ${orgName ?? "your organisation"} on your home page.`,
      });
    } catch {
      setOptedOut(!next);
      toast({ title: "Could not save", description: "Please try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!available || optedOut === null) return null;

  return (
    <button
      onClick={handleToggle}
      aria-pressed={!optedOut}
      disabled={saving}
      className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors text-left disabled:opacity-60"
      data-testid="toggle-pulse-opt-out"
    >
      <div className="pr-3">
        <p className="text-sm font-medium text-foreground">Pulse surveys</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          30-second prompts from {orgName ?? "your organisation"} on your home page. Anonymous by default.
        </p>
      </div>
      <div
        className="relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors"
        style={{ background: !optedOut ? "#F06127" : "#d1d5db" }}
      >
        <span
          className="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform"
          style={{ transform: !optedOut ? "translateX(16px)" : "translateX(0)" }}
        />
      </div>
    </button>
  );
}

const VOICE_PERSONA_OPTIONS: { value: VoicePersona; label: string; description: string }[] = [
  { value: "alloy", label: "Alloy", description: "Balanced and clear (default)" },
  { value: "nova", label: "Nova", description: "Warm and friendly" },
  { value: "shimmer", label: "Shimmer", description: "Bright and upbeat" },
  { value: "echo", label: "Echo", description: "Calm and steady" },
  { value: "fable", label: "Fable", description: "Expressive storyteller" },
  { value: "onyx", label: "Onyx", description: "Deep and grounded" },
];

const VOICE_ACCENT_OPTIONS: { value: VoiceAccent; label: string; description: string }[] = [
  { value: "neutral", label: "Standard", description: "The voice's natural accent" },
  { value: "british", label: "British", description: "A British English accent" },
];

const VOICE_PREVIEW_TEXT =
  "Hello! I'm Sidekick, your My Impact assistant. This is how I'll sound when I read replies aloud.";

function SidekickVoiceSettings() {
  const { user, updateProfile } = useAuth();
  const { toast } = useToast();
  const voiceEnabled = user?.voiceEnabled ?? false;
  const voicePersona = (user?.voicePersona ?? "alloy") as VoicePersona;
  const voiceAccent = (user?.voiceAccent ?? "neutral") as VoiceAccent;
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewAudio, setPreviewAudio] = useState<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      previewAudio?.pause();
    };
  }, [previewAudio]);

  const handlePreview = async () => {
    if (previewing) return;
    previewAudio?.pause();
    setPreviewing(true);
    try {
      const res = await fetch(`${BASE}/api/sidekick/speak`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: VOICE_PREVIEW_TEXT, voice: voicePersona }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Preview failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      setPreviewAudio(audio);
      await audio.play();
    } catch (err) {
      toast({
        title: "Couldn't play the sample",
        description: err instanceof Error ? err.message : "Please try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setPreviewing(false);
    }
  };

  const handleToggleVoice = async () => {
    if (saving) return;
    setSaving(true);
    const next = !voiceEnabled;
    try {
      await updateProfile({ voiceEnabled: next });
      toast({
        title: next ? "Voice replies on" : "Voice replies off",
        description: next
          ? "Sidekick will read its replies aloud by default."
          : "Sidekick will only show replies on screen.",
      });
    } catch {
      toast({
        title: "Could not update preference",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleChangePersona = async (next: VoicePersona) => {
    if (saving || next === voicePersona) return;
    setSaving(true);
    try {
      await updateProfile({ voicePersona: next });
      toast({ title: "Voice updated", description: `Sidekick will now sound like ${next}.` });
    } catch {
      toast({
        title: "Could not change voice",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleChangeAccent = async (next: VoiceAccent) => {
    if (saving || next === voiceAccent) return;
    setSaving(true);
    try {
      await updateProfile({ voiceAccent: next });
      toast({
        title: "Accent updated",
        description:
          next === "british"
            ? "Sidekick will speak with a British accent."
            : "Sidekick will use the voice's standard accent.",
      });
    } catch {
      toast({
        title: "Could not change accent",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="bg-white rounded-2xl border border-border shadow-sm mb-4 overflow-hidden" data-testid="sidekick-voice-settings">
      <div className="px-5 py-4 border-b border-border flex items-center gap-2">
        <Mic className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-foreground">Sidekick voice</h2>
      </div>
      <div className="py-1 divide-y divide-border">
        <button
          onClick={handleToggleVoice}
          aria-pressed={voiceEnabled}
          disabled={saving}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors text-left disabled:opacity-60"
          data-testid="voice-enabled-toggle"
        >
          <div className="pr-3">
            <p className="text-sm font-medium text-foreground">Read replies aloud</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              When on, Sidekick speaks its answers using a natural-sounding voice. You can still mute or unmute for a single chat using the speaker icon in the panel.
            </p>
          </div>
          <div
            className="relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors"
            style={{ background: voiceEnabled ? "#F06127" : "#d1d5db" }}
          >
            <span
              className="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform"
              style={{ transform: voiceEnabled ? "translateX(16px)" : "translateX(0)" }}
            />
          </div>
        </button>
        <div className="px-5 py-4">
          <label htmlFor="voice-persona" className="block text-sm font-medium text-foreground mb-1">
            Voice
          </label>
          <p className="text-xs text-muted-foreground mb-2">
            Pick the voice Sidekick uses when reading replies aloud.
          </p>
          <select
            id="voice-persona"
            value={voicePersona}
            disabled={saving}
            onChange={(e) => handleChangePersona(e.target.value as VoicePersona)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60"
            data-testid="voice-persona-select"
          >
            {VOICE_PERSONA_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}, {opt.description}
              </option>
            ))}
          </select>
          <label htmlFor="voice-accent" className="block text-sm font-medium text-foreground mb-1 mt-4">
            Accent
          </label>
          <p className="text-xs text-muted-foreground mb-2">
            Choose the accent Sidekick uses for spoken replies.
          </p>
          <select
            id="voice-accent"
            value={voiceAccent}
            disabled={saving}
            onChange={(e) => handleChangeAccent(e.target.value as VoiceAccent)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60"
            data-testid="voice-accent-select"
          >
            {VOICE_ACCENT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}, {opt.description}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handlePreview}
            disabled={previewing || saving}
            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-muted/30 disabled:opacity-60 transition-colors"
            data-testid="voice-preview-button"
          >
            {previewing ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Mic className="w-3.5 h-3.5" aria-hidden="true" />}
            {previewing ? "Preparing sample…" : "Hear a sample"}
          </button>
          <p className="text-[11px] text-muted-foreground mt-2">
            The sample uses a small amount of your monthly voice budget. Tap the microphone in the Sidekick panel to speak instead of typing. Voice features need a modern browser with microphone access.
          </p>
        </div>
        <VoiceUsageMeter />
      </div>
    </section>
  );
}

interface VoiceUsageData {
  yearMonth: string;
  transcribeSeconds: number;
  ttsCharacters: number;
  transcribeSecondsCap: number;
  ttsCharactersCap: number;
  transcribeSecondsRemaining: number;
  ttsCharactersRemaining: number;
  estimatedCostPence: number;
  capReached: boolean;
}

function formatMinutes(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = seconds / 60;
  return mins >= 10 ? `${Math.round(mins)} min` : `${mins.toFixed(1)} min`;
}

function formatCharCount(chars: number): string {
  if (chars >= 1000) return `${(chars / 1000).toFixed(1)}k`;
  return chars.toLocaleString("en-GB");
}

function VoiceUsageMeter() {
  const [usage, setUsage] = useState<VoiceUsageData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${BASE}/api/sidekick/voice-usage`, { credentials: "include" });
        if (!res.ok) throw new Error("Failed");
        const data = await res.json();
        if (!cancelled) setUsage(data.usage as VoiceUsageData);
      } catch {
        if (!cancelled) setUsage(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="px-5 py-4" data-testid="voice-usage-meter-loading">
        <p className="text-xs text-muted-foreground">Loading voice usage…</p>
      </div>
    );
  }
  if (!usage) return null;

  const transcribePct = Math.min(100, Math.round((usage.transcribeSeconds / Math.max(1, usage.transcribeSecondsCap)) * 100));
  const ttsPct = Math.min(100, Math.round((usage.ttsCharacters / Math.max(1, usage.ttsCharactersCap)) * 100));
  const eitherCapHit = usage.transcribeSecondsRemaining <= 0 || usage.ttsCharactersRemaining <= 0;

  return (
    <div className="px-5 py-4" data-testid="voice-usage-meter">
      <p className="text-sm font-medium text-foreground mb-1">This month's voice usage</p>
      <p className="text-[11px] text-muted-foreground mb-3">
        Voice replies and dictation use a paid speech service, so each account has a monthly budget. It resets on the 1st of every month.
      </p>
      <div className="space-y-3">
        <div>
          <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
            <span>Speaking to Sidekick</span>
            <span data-testid="voice-usage-transcribe">
              {formatMinutes(usage.transcribeSeconds)} of {formatMinutes(usage.transcribeSecondsCap)}
            </span>
          </div>
          <div className="h-1.5 w-full bg-muted/40 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${transcribePct}%`, background: transcribePct >= 100 ? "#dc2626" : "#F06127" }}
            />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
            <span>Sidekick reading aloud</span>
            <span data-testid="voice-usage-tts">
              {formatCharCount(usage.ttsCharacters)} of {formatCharCount(usage.ttsCharactersCap)} characters
            </span>
          </div>
          <div className="h-1.5 w-full bg-muted/40 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${ttsPct}%`, background: ttsPct >= 100 ? "#dc2626" : "#F06127" }}
            />
          </div>
        </div>
      </div>
      {eitherCapHit && (
        <p className="mt-3 text-[11px] text-destructive font-medium" data-testid="voice-usage-cap-warning">
          You've used your voice budget for this month, voice will be back next month, or upgrade your plan.
        </p>
      )}
    </div>
  );
}

const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const TRIGGER_LABELS: { key: keyof PushTriggerToggles; title: string; desc: string }[] = [
  {
    key: "streakAtRisk",
    title: "Daily streak at risk",
    desc: "An evening nudge if you're about to break your logging streak.",
  },
  {
    key: "recurringDue",
    title: "Regular activity due",
    desc: "A reminder when one of your recurring activities is scheduled.",
  },
  {
    key: "monthlyDigest",
    title: "Monthly recap ready",
    desc: "Tap-through to your personalised summary on the 1st of each month.",
  },
  {
    key: "challengeEnd",
    title: "Group or challenge end",
    desc: "When a cohort or challenge you're part of finishes, coming with team challenges.",
  },
];

const PAUSE_OPTIONS: { label: string; days: number }[] = [
  { label: "1 day", days: 1 },
  { label: "3 days", days: 3 },
  { label: "1 week", days: 7 },
  { label: "30 days", days: 30 },
];

function RemindersSettings() {
  const { toast } = useToast();
  const [supported, setSupported] = useState<boolean>(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [prefs, setPrefs] = useState<PushPreferencesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pauseOpen, setPauseOpen] = useState(false);

  useEffect(() => {
    const sup = isPushSupported();
    setSupported(sup);
    setPermission(currentPermission());
    if (!sup) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const p = await fetchPreferences();
        if (!cancelled) setPrefs(p);
      } catch {
        // best-effort, likely just no auth or push not configured.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const hasSubscription = !!prefs && prefs.subscriptions.length > 0;
  const isPaused = !!prefs?.pausedUntil && new Date(prefs.pausedUntil).getTime() > Date.now();

  const handleEnable = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await enablePush();
      const p = await fetchPreferences();
      setPrefs(p);
      setPermission(currentPermission());
      toast({
        title: "Reminders are on",
        description: "We'll only nudge you about things you've turned on below.",
      });
    } catch (err) {
      toast({
        title: "Couldn't turn on reminders",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await disablePush();
      const p = await fetchPreferences();
      setPrefs(p);
      toast({ title: "Reminders turned off" });
    } catch {
      toast({ title: "Couldn't turn off", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const handleToggleTrigger = async (key: keyof PushTriggerToggles) => {
    if (!prefs || busy) return;
    const next = !prefs.triggers[key];
    const optimistic: PushPreferencesResponse = {
      ...prefs,
      triggers: { ...prefs.triggers, [key]: next },
    };
    setPrefs(optimistic);
    try {
      const updated = await updatePreferences({ triggers: { [key]: next } });
      setPrefs((cur) => (cur ? { ...cur, triggers: updated.triggers } : cur));
    } catch {
      setPrefs(prefs);
      toast({ title: "Couldn't save preference", variant: "destructive" });
    }
  };

  const handlePause = async (days: number) => {
    if (busy) return;
    setBusy(true);
    setPauseOpen(false);
    try {
      const updated = await updatePreferences({ pauseDays: days });
      setPrefs((cur) => (cur ? { ...cur, pausedUntil: updated.pausedUntil } : cur));
      toast({
        title: `Paused for ${days} day${days === 1 ? "" : "s"}`,
        description: "We won't send any reminders until then.",
      });
    } catch {
      toast({ title: "Couldn't pause", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const handleResume = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const updated = await updatePreferences({ resumeNow: true });
      setPrefs((cur) => (cur ? { ...cur, pausedUntil: updated.pausedUntil } : cur));
      toast({ title: "Reminders resumed" });
    } catch {
      toast({ title: "Couldn't resume", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const handleTest = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await sendTestPush();
      toast({ title: "Test sent", description: "Check for the notification on this device." });
    } catch (err) {
      toast({
        title: "Couldn't send test",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="bg-white rounded-2xl border border-border shadow-sm mb-4 overflow-hidden" data-testid="reminders-settings-section">
      <div className="px-5 py-4 border-b border-border flex items-center gap-2">
        <Bell className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-foreground">Reminders</h2>
        <span className="ml-2 text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded">
          Mobile
        </span>
      </div>

      <div className="px-5 py-5 space-y-4">
        {!supported ? (
          <p className="text-xs text-muted-foreground leading-relaxed">
            This device or browser doesn't support push reminders. To use them, install the app
            to your home screen on a recent iPhone or Android, or open My Impact in Chrome,
            Edge, or Firefox.
          </p>
        ) : loading ? (
          <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
            Loading…
          </p>
        ) : permission === "denied" ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 leading-relaxed">
            Notifications are blocked in your browser settings. Open this site in your browser
            settings and allow notifications, then come back here to turn reminders on.
          </div>
        ) : !hasSubscription ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Get a friendly nudge for your daily streak, recurring activities, and your monthly
              recap. Pause or turn it off any time.
            </p>
            <button
              type="button"
              onClick={handleEnable}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 disabled:opacity-60"
              data-testid="enable-push-button"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bell className="w-3.5 h-3.5" />}
              Turn on reminders
            </button>
          </div>
        ) : (
          <>
            {/* Status row */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground inline-flex items-center gap-1.5">
                  <span
                    className="inline-block w-2 h-2 rounded-full"
                    style={{ background: isPaused ? "#f59e0b" : "#16a34a" }}
                    aria-hidden="true"
                  />
                  {isPaused ? "Paused" : "Reminders are on"}
                </p>
                {isPaused && prefs?.pausedUntil ? (
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Resumes on{" "}
                    {new Date(prefs.pausedUntil).toLocaleDateString("en-GB", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    })}
                  </p>
                ) : (
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {prefs?.subscriptions.length} device{prefs?.subscriptions.length === 1 ? "" : "s"} subscribed.
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {isPaused ? (
                  <button
                    type="button"
                    onClick={handleResume}
                    disabled={busy}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-border text-[11px] font-medium hover:bg-muted/30 disabled:opacity-60"
                  >
                    Resume now
                  </button>
                ) : (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setPauseOpen((v) => !v)}
                      disabled={busy}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-border text-[11px] font-medium hover:bg-muted/30 disabled:opacity-60"
                    >
                      <Pause className="w-3 h-3" aria-hidden="true" /> Pause
                    </button>
                    {pauseOpen && (
                      <div className="absolute right-0 mt-1 w-32 rounded-lg border border-border bg-white shadow-lg z-10">
                        {PAUSE_OPTIONS.map((opt) => (
                          <button
                            key={opt.days}
                            type="button"
                            onClick={() => handlePause(opt.days)}
                            className="w-full text-left px-3 py-2 text-xs text-foreground hover:bg-muted/30 first:rounded-t-lg last:rounded-b-lg"
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleDisable}
                  disabled={busy}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-border text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/30 disabled:opacity-60"
                  data-testid="disable-push-button"
                >
                  <BellOff className="w-3 h-3" aria-hidden="true" /> Turn off
                </button>
              </div>
            </div>

            {/* Per-trigger toggles */}
            <div className="border-t border-border -mx-5 mt-4 pt-1 divide-y divide-border">
              {TRIGGER_LABELS.map((t) => {
                const value = !!prefs?.triggers[t.key];
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => handleToggleTrigger(t.key)}
                    aria-pressed={value}
                    disabled={busy}
                    className="w-full flex items-center justify-between px-5 py-3 hover:bg-muted/20 transition-colors text-left disabled:opacity-60"
                    data-testid={`trigger-toggle-${t.key}`}
                  >
                    <div className="pr-3">
                      <p className="text-sm font-medium text-foreground">{t.title}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{t.desc}</p>
                    </div>
                    <div
                      className="relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors"
                      style={{ background: value ? "#F06127" : "#d1d5db" }}
                    >
                      <span
                        className="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform"
                        style={{ transform: value ? "translateX(16px)" : "translateX(0)" }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="pt-1">
              <button
                type="button"
                onClick={handleTest}
                disabled={busy || isPaused}
                className="text-[11px] font-medium text-muted-foreground hover:text-foreground underline-offset-2 hover:underline disabled:opacity-60"
              >
                Send a test reminder
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function TemplatesSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const templatesQuery = useListRecurringTemplates();
  const updateMutation = useUpdateRecurringTemplate();
  const deleteMutation = useDeleteRecurringTemplate();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editCadence, setEditCadence] = useState<RecurringTemplate["cadence"]>("weekly");
  const [editDay, setEditDay] = useState<number>(1);

  const templates = templatesQuery.data?.templates ?? [];

  const startEdit = (t: RecurringTemplate) => {
    setEditingId(t.id);
    setEditLabel(t.label);
    setEditCadence(t.cadence);
    setEditDay(t.dayOfPeriod);
  };

  const handleSaveEdit = async (id: string) => {
    if (!editLabel.trim()) return;
    const existing = templates.find((t) => t.id === id);
    if (!existing) return;
    try {
      await updateMutation.mutateAsync({
        id,
        data: {
          label: editLabel.trim(),
          cadence: editCadence,
          dayOfPeriod: editDay,
          defaultActivities: existing.defaultActivities,
          defaultDonationsGBP: existing.defaultDonationsGBP,
        },
      });
      queryClient.invalidateQueries({ queryKey: getListRecurringTemplatesQueryKey() });
      setEditingId(null);
      toast({ title: "Template updated" });
    } catch {
      toast({ title: "Could not update", variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMutation.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getListRecurringTemplatesQueryKey() });
      setConfirmingDeleteId(null);
      toast({ title: "Template removed" });
    } catch {
      toast({ title: "Could not remove", variant: "destructive" });
    }
  };

  return (
    <section
      className="bg-white rounded-2xl border border-border shadow-sm mb-4 overflow-hidden"
      data-testid="templates-settings-section"
    >
      <div className="px-5 py-4 border-b border-border flex items-center gap-2">
        <Repeat className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-foreground">Recurring activities</h2>
      </div>
      <div className="px-5 py-4">
        {templatesQuery.isLoading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : templates.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            After saving an impact record, you can mark it as a regular activity to get one-tap "quick log" reminders here and on your home page.
          </p>
        ) : (
          <ul className="divide-y divide-border -mx-5">
            {templates.map((t) => {
              const isEditing = editingId === t.id;
              const isConfirmingDelete = confirmingDeleteId === t.id;
              return (
                <li key={t.id} className="px-5 py-3" data-testid={`template-row-${t.id}`}>
                  {isEditing ? (
                    <div className="space-y-2">
                      <input
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-foreground/20"
                        placeholder="Label"
                      />
                      <div className="flex items-center gap-2">
                        <select
                          value={editCadence}
                          onChange={(e) => {
                            const c = e.target.value as RecurringTemplate["cadence"];
                            setEditCadence(c);
                            if (c === "monthly" && editDay > 28) setEditDay(1);
                            if ((c === "weekly" || c === "fortnightly") && editDay > 6) setEditDay(1);
                          }}
                          className="px-2 py-2 text-xs border border-border rounded-md"
                        >
                          <option value="weekly">Weekly</option>
                          <option value="fortnightly">Fortnightly</option>
                          <option value="monthly">Monthly</option>
                        </select>
                        {editCadence === "monthly" ? (
                          <select
                            value={editDay}
                            onChange={(e) => setEditDay(parseInt(e.target.value, 10))}
                            className="px-2 py-2 text-xs border border-border rounded-md"
                          >
                            {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                              <option key={d} value={d}>{`Day ${d}`}</option>
                            ))}
                          </select>
                        ) : (
                          <select
                            value={editDay}
                            onChange={(e) => setEditDay(parseInt(e.target.value, 10))}
                            className="px-2 py-2 text-xs border border-border rounded-md"
                          >
                            {DAYS_OF_WEEK.map((d, i) => (
                              <option key={d} value={i}>{d}</option>
                            ))}
                          </select>
                        )}
                      </div>
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => setEditingId(null)}
                          className="px-3 py-1.5 rounded-md border border-border text-xs font-medium hover:bg-muted/20"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleSaveEdit(t.id)}
                          disabled={updateMutation.isPending}
                          className="px-3 py-1.5 rounded-md bg-foreground text-white text-xs font-medium disabled:opacity-60"
                        >
                          {updateMutation.isPending ? "Saving…" : "Save"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{t.label}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{describeCadence(t)}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => startEdit(t)}
                          className="p-2 rounded-md hover:bg-muted/30 text-muted-foreground"
                          aria-label="Edit"
                        >
                          <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                        <button
                          onClick={() => setConfirmingDeleteId(isConfirmingDelete ? null : t.id)}
                          className="p-2 rounded-md hover:bg-destructive/10 text-destructive"
                          aria-label="Remove"
                          data-testid={`template-delete-${t.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  )}
                  {isConfirmingDelete && !isEditing && (
                    <div className="mt-3 flex items-center justify-between bg-destructive/5 border border-destructive/20 rounded-md px-3 py-2">
                      <p className="text-[11px] text-destructive font-medium">Remove this regular activity?</p>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setConfirmingDeleteId(null)}
                          className="px-2.5 py-1 rounded-md border border-border text-[11px] font-medium hover:bg-muted/20"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleDelete(t.id)}
                          disabled={deleteMutation.isPending}
                          className="px-2.5 py-1 rounded-md bg-destructive text-white text-[11px] font-medium disabled:opacity-60"
                          data-testid={`template-delete-confirm-${t.id}`}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
