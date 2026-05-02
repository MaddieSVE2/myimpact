import { useState, useEffect } from "react";
import { Link } from "wouter";
import { User, Mail, Eye, LogOut, ChevronRight, CheckCircle, Building2, Smartphone, MailCheck, HardDrive, Sparkles, Repeat, Trash2, Pencil, Check } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import { useToast } from "@/hooks/use-toast";
import PublicProfileSettings from "./PublicProfileSettings";
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

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function Settings() {
  const { user, updateProfile, logout } = useAuth();
  const { isHighContrast, toggleTheme } = useTheme();
  const { toast } = useToast();

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
        title: next ? "Monthly recap on" : "Monthly recap off",
        description: next
          ? "We'll send a personalised summary on the 1st of each month."
          : "You won't receive monthly recap emails.",
      });
    } catch {
      toast({
        title: "Could not update preference",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setDigestSaving(false);
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
        title: next ? "Emails turned on" : "Emails turned off",
        description: next
          ? "You'll get the onboarding sequence and the monthly digest."
          : "We won't send you onboarding or monthly digest emails.",
      });
    } catch {
      setEmailOptIn(!next);
      toast({ title: "Could not save", description: "Please try again.", variant: "destructive" });
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

      {/* Email section */}
      <section className="bg-white rounded-2xl border border-border shadow-sm mb-4 overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <Mail className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-foreground">Email</h2>
        </div>
        <div className="py-1 divide-y divide-border">
          <button
            onClick={handleToggleEmailOptIn}
            aria-pressed={emailOptIn === true}
            disabled={emailOptIn === null || emailToggleSaving}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors text-left disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <div className="pr-4">
              <p className="text-sm font-medium text-foreground">Onboarding emails</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Welcome and getting-started tips in your first month after signing up.
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
              <p className="text-sm font-medium text-foreground">Monthly impact recap</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                A short personalised summary on the 1st of each month — hours, social value, milestones, and one journal highlight. Unsubscribe in one click from the email or here.
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

      {/* Storage usage section */}
      <section className="bg-white rounded-2xl border border-border shadow-sm mb-4 overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-foreground">Storage</h2>
        </div>
        <div className="px-5 py-5">
          <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
            Photos and donation receipts you attach to your records and journal entries are stored privately, just for you.
          </p>
          <StorageUsageBar />
        </div>
      </section>

      {/* Recurring templates section */}
      <TemplatesSettings />

      {/* Public profile section */}
      <PublicProfileSettings />

      {/* Annual recap section */}
      <section className="bg-white rounded-2xl border border-border shadow-sm mb-4 overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-foreground">Year in impact</h2>
        </div>
        <div className="py-1">
          <Link
            href={`/recap?year=${getRecapYear()}`}
            onClick={() => clearRecapViewed(getRecapYear())}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors"
          >
            <div>
              <p className="text-sm font-medium text-foreground">View my {getRecapYear()} recap</p>
              <p className="text-xs text-muted-foreground mt-0.5">A Spotify-style story of your year, with a shareable card.</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          </Link>
        </div>
      </section>

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

const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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
