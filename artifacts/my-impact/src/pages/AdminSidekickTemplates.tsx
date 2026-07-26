import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import {
  SIDEKICK_TEMPLATES,
  SIDEKICK_CATEGORY_LABELS,
  SIDEKICK_PERSONA_LABELS,
  type SidekickPersona,
  type SidekickTemplate,
  type SidekickTemplateOverride,
} from "@/lib/sidekick-templates";

const ADMIN_EMAILS = [
  "hello@myimpact.uk",
  "maddie@socialvalueengine.com", "lorna@socialvalueengine.com",
  "ivan.annibal@roseregeneration.co.uk",
];

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const PERSONA_ORDER: SidekickPersona[] = [
  "default",
  "student",
  "veteran",
  "carer",
  "apprenticeship",
  "career_break",
  "org_manager",
];

interface DraftState {
  label: string;
  description: string;
  personaPrompts: Record<string, string>;
}

function draftFromTemplate(
  template: SidekickTemplate,
  override: SidekickTemplateOverride | undefined
): DraftState {
  const prompts: Record<string, string> = {};
  for (const persona of PERSONA_ORDER) {
    const defaultPrompt = template.personaPrompts[persona];
    if (defaultPrompt === undefined) continue;
    prompts[persona] = override?.personaPrompts?.[persona] ?? defaultPrompt;
  }
  return {
    label: override?.label ?? template.label,
    description: override?.description ?? template.description,
    personaPrompts: prompts,
  };
}

function TemplateEditor({
  template,
  override,
  onSaved,
  onReset,
}: {
  template: SidekickTemplate;
  override: SidekickTemplateOverride | undefined;
  onSaved: (override: SidekickTemplateOverride | null) => void;
  onReset: () => void;
}) {
  const [draft, setDraft] = useState<DraftState>(() => draftFromTemplate(template, override));
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  // Re-sync the form when the saved override changes (e.g. after reset).
  useEffect(() => {
    setDraft(draftFromTemplate(template, override));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [override]);

  const isCustomised = !!override;

  const dirty = useMemo(() => {
    const base = draftFromTemplate(template, override);
    if (draft.label !== base.label || draft.description !== base.description) return true;
    return Object.keys(draft.personaPrompts).some(
      (p) => draft.personaPrompts[p] !== base.personaPrompts[p]
    );
  }, [draft, template, override]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      // Only send fields that differ from the in-code default, so the
      // database keeps tracking "what has been customised".
      const personaPrompts: Record<string, string> = {};
      for (const persona of Object.keys(draft.personaPrompts)) {
        const defaultPrompt = template.personaPrompts[persona as SidekickPersona];
        const value = draft.personaPrompts[persona];
        if (value.trim().length > 0 && value !== defaultPrompt) {
          personaPrompts[persona] = value;
        }
      }
      const body = {
        label: draft.label.trim() !== "" && draft.label !== template.label ? draft.label : null,
        description:
          draft.description.trim() !== "" && draft.description !== template.description
            ? draft.description
            : null,
        personaPrompts: Object.keys(personaPrompts).length > 0 ? personaPrompts : null,
      };
      const r = await fetch(`${BASE}/api/admin/sidekick-templates/${template.id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok || data.error) throw new Error(data.error ?? "Failed to save");
      onSaved(data.override ?? null);
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    if (!confirm(`Reset "${template.label}" to the copy shipped in the codebase? Your edits will be lost.`)) return;
    setResetting(true);
    setError(null);
    try {
      const r = await fetch(`${BASE}/api/admin/sidekick-templates/${template.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await r.json();
      if (!r.ok || data.error) throw new Error(data.error ?? "Failed to reset");
      onReset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset");
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="border border-border rounded-xl p-5 bg-card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold text-lg">{template.label}</h2>
          <p className="text-sm text-muted-foreground">
            Category: {SIDEKICK_CATEGORY_LABELS[template.category]}
            <span className="text-xs text-muted-foreground/70"> · id: {template.id}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isCustomised && (
            <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold border bg-blue-100 text-blue-800 border-blue-200">
              Customised
            </span>
          )}
          {savedFlash && <span className="text-xs text-green-600 font-medium">Saved ✓</span>}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium">Label</span>
          <input
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={draft.label}
            onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Description</span>
          <input
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={draft.description}
            onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
          />
        </label>
      </div>

      <div className="space-y-3">
        {PERSONA_ORDER.filter((p) => draft.personaPrompts[p] !== undefined).map((persona) => {
          const isOverridden =
            draft.personaPrompts[persona] !== template.personaPrompts[persona];
          return (
            <label key={persona} className="block text-sm">
              <span className="font-medium">
                {SIDEKICK_PERSONA_LABELS[persona]} prompt
                {persona === "default" && (
                  <span className="text-muted-foreground font-normal"> (used when no persona variant exists)</span>
                )}
                {isOverridden && <span className="ml-2 text-xs text-blue-600">edited</span>}
              </span>
              <textarea
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono leading-relaxed"
                rows={4}
                value={draft.personaPrompts[persona]}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    personaPrompts: { ...d.personaPrompts, [persona]: e.target.value },
                  }))
                }
              />
            </label>
          );
        })}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving || !dirty}
          className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
        <button
          onClick={handleReset}
          disabled={resetting || !isCustomised}
          className="px-4 py-2 rounded-md border border-border text-sm font-medium disabled:opacity-50"
        >
          {resetting ? "Resetting…" : "Reset to default"}
        </button>
        {dirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
      </div>
    </div>
  );
}

export default function AdminSidekickTemplates() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [overrides, setOverrides] = useState<Record<string, SidekickTemplateOverride>>({});
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = user && ADMIN_EMAILS.includes(user.email.toLowerCase());

  useEffect(() => {
    if (isLoading) return;
    if (!user || !isAdmin) {
      setLocation("/", { replace: true });
    }
  }, [isLoading, user, isAdmin, setLocation]);

  useEffect(() => {
    if (isLoading || !user || !isAdmin) return;
    setFetching(true);
    fetch(`${BASE}/api/admin/sidekick-templates`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        const map: Record<string, SidekickTemplateOverride> = {};
        for (const o of data.overrides ?? []) map[o.templateId] = o;
        setOverrides(map);
      })
      .catch((err) => setError(err.message ?? "Failed to load template overrides"))
      .finally(() => setFetching(false));
  }, [isLoading, user, isAdmin]);

  if (isLoading || !user || !isAdmin) return null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div>
        <Link href="/admin" className="text-sm text-muted-foreground hover:underline">
          ← Back to admin
        </Link>
        <h1 className="text-2xl font-bold mt-2">Sidekick template copy</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Edit the labels, descriptions and per-persona prompts behind Sidekick's one-tap
          templates. Changes save to the database and apply for everyone straight away — no
          code change needed. Use <code className="bg-secondary px-1 rounded">{"{activity}"}</code>,{" "}
          <code className="bg-secondary px-1 rounded">{"{numbers}"}</code> and{" "}
          <code className="bg-secondary px-1 rounded">{"{recent}"}</code> as placeholders for the
          user's top activity, score sentence and recent-activities sentence.
        </p>
      </div>

      {fetching ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : (
        <div className="space-y-6">
          {SIDEKICK_TEMPLATES.map((template) => (
            <TemplateEditor
              key={template.id}
              template={template}
              override={overrides[template.id]}
              onSaved={(o) =>
                setOverrides((prev) => {
                  const next = { ...prev };
                  if (o) next[template.id] = o;
                  else delete next[template.id];
                  return next;
                })
              }
              onReset={() =>
                setOverrides((prev) => {
                  const next = { ...prev };
                  delete next[template.id];
                  return next;
                })
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
