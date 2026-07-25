import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const SECTION_LABELS: Record<string, string> = {
  locationMap: "Location map",
  categories: "Category breakdown",
  sroi: "SROI",
  valuePerMember: "Value per member",
  topActivities: "Top activities",
  pulseSummary: "Pulse summary",
};
const SECTION_KEYS = Object.keys(SECTION_LABELS);

interface AdminOrg {
  id: string;
  name: string;
  type: string;
  dataSharingMode: "explicit_submission" | "consented_logging";
  contactName: string | null;
  contactEmail: string | null;
  inviteCode: string;
  dashboardSections: Record<string, boolean>;
  fullTierEnabled: boolean;
  revokedAt: string | null;
  createdAt: string;
  memberCount: number;
  totalMembershipCount: number;
  managerCount: number;
  hasManager: boolean;
}

function ModeBadge({ mode }: { mode: AdminOrg["dataSharingMode"] }) {
  const consented = mode === "consented_logging";
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold border ${consented ? "bg-blue-100 text-blue-800 border-blue-200" : "bg-secondary text-muted-foreground border-border"}`}>
      {consented ? "Consented logging" : "Explicit submission"}
    </span>
  );
}

export default function AdminOrganisations() {
  const [orgs, setOrgs] = useState<AdminOrg[]>([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    name: "",
    type: "charity",
    contactName: "",
    contactEmail: "",
    dataSharingMode: "explicit_submission" as AdminOrg["dataSharingMode"],
  });
  const [formSections, setFormSections] = useState<Record<string, boolean>>(
    () => Object.fromEntries(SECTION_KEYS.map(k => [k, true])),
  );
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${BASE}/api/admin/orgs`, { credentials: "include" })
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setOrgs(data.orgs);
      })
      .catch(err => setError(err.message ?? "Failed to load organisations"))
      .finally(() => setFetching(false));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setBusy("create");
    try {
      const r = await fetch(`${BASE}/api/admin/orgs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...form, dashboardSections: formSections }),
      });
      const data = await r.json();
      if (!r.ok || data.error) throw new Error(data.error ?? "Failed to create organisation");
      setOrgs(prev => [data.org, ...prev]);
      setShowCreate(false);
      setForm({ name: "", type: "charity", contactName: "", contactEmail: "", dataSharingMode: "explicit_submission" });
      setFormSections(Object.fromEntries(SECTION_KEYS.map(k => [k, true])));
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : "Failed to create organisation");
    } finally {
      setBusy(null);
    }
  }

  async function toggleSection(org: AdminOrg, key: string) {
    const next = { ...org.dashboardSections, [key]: !org.dashboardSections[key] };
    setBusy(org.id + "-sections");
    try {
      const r = await fetch(`${BASE}/api/admin/orgs/${org.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ dashboardSections: next }),
      });
      const data = await r.json();
      if (!r.ok || data.error) throw new Error(data.error ?? "Failed to update sections");
      setOrgs(prev => prev.map(o => (o.id === org.id ? data.org : o)));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to update sections");
    } finally {
      setBusy(null);
    }
  }

  async function toggleFullTier(org: AdminOrg) {
    setBusy(org.id + "-fulltier");
    try {
      const r = await fetch(`${BASE}/api/admin/orgs/${org.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ fullTierEnabled: !org.fullTierEnabled }),
      });
      const data = await r.json();
      if (!r.ok || data.error) throw new Error(data.error ?? "Failed to update tier");
      setOrgs(prev => prev.map(o => (o.id === org.id ? data.org : o)));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to update tier");
    } finally {
      setBusy(null);
    }
  }

  const [importPreview, setImportPreview] = useState<{
    orgId: string;
    file: unknown;
    preview: {
      sourceOrg: { id: string; name: string; type: string; dataSharingMode: string; exportedAt: string };
      willCreate: { migratedActivities: number; settingsApplied: string[]; surveyAggregatesPreserved: number };
      membersInSource: number;
      membersNote: string;
    };
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importTargetRef = useRef<string | null>(null);

  function downloadBlob(content: string, filename: string, type: string) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
  }

  async function handleExport(org: AdminOrg) {
    setBusy(org.id + "-export");
    try {
      const r = await fetch(`${BASE}/api/admin/orgs/${org.id}/export`, { credentials: "include" });
      const data = await r.json();
      if (!r.ok || data.error) throw new Error(data.error ?? "Failed to export organisation data");
      const slug = org.name.replace(/\s+/g, "-").toLowerCase();
      downloadBlob(JSON.stringify(data, null, 2), `my-impact-export-${slug}.json`, "application/json");
      if (typeof data.humanReadableSummary === "string") {
        downloadBlob(data.humanReadableSummary, `my-impact-export-${slug}-summary.txt`, "text/plain;charset=utf-8");
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to export organisation data");
    } finally {
      setBusy(null);
    }
  }

  function startImport(org: AdminOrg) {
    importTargetRef.current = org.id;
    fileInputRef.current?.click();
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    const orgId = importTargetRef.current;
    if (!file || !orgId) return;
    setBusy(orgId + "-import");
    try {
      const text = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error("That file isn't valid JSON. Choose a My Impact organisation export file.");
      }
      const r = await fetch(`${BASE}/api/admin/orgs/${orgId}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ dryRun: true, export: parsed }),
      });
      const data = await r.json();
      if (!r.ok || data.error) throw new Error(data.error ?? "Import validation failed");
      setImportPreview({ orgId, file: parsed, preview: data.preview });
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Import validation failed");
    } finally {
      setBusy(null);
    }
  }

  async function confirmImport() {
    if (!importPreview) return;
    const { orgId, file } = importPreview;
    setBusy(orgId + "-import-commit");
    try {
      const r = await fetch(`${BASE}/api/admin/orgs/${orgId}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ dryRun: false, export: file }),
      });
      const data = await r.json();
      if (!r.ok || data.error) throw new Error(data.error ?? "Import failed");
      setImportPreview(null);
      alert(`Import complete: ${data.imported.migratedActivities} activity record(s) restored and marked as migrated, and ${data.imported.settingsApplied.length} setting(s) applied. Members re-join through the normal join flow.`);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleResendActivation(org: AdminOrg) {
    setBusy(org.id + "-resend");
    try {
      const r = await fetch(`${BASE}/api/admin/orgs/${org.id}/resend-activation`, {
        method: "POST",
        credentials: "include",
      });
      const data = await r.json();
      if (!r.ok || data.error) throw new Error(data.error ?? "Failed to re-send the activation email");
      alert(`Activation email re-sent to ${data.sentTo}.`);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to re-send the activation email");
    } finally {
      setBusy(null);
    }
  }

  async function handleRevoke(org: AdminOrg) {
    const confirmed = window.confirm(
      `Revoke access for "${org.name}"?\n\nManagers will immediately lose access to the organisation dashboard and API. The organisation's data is retained for 180 days, and the contact (${org.contactEmail ?? "no email on file"}) will be notified by email.`
    );
    if (!confirmed) return;
    setBusy(org.id + "-revoke");
    try {
      const r = await fetch(`${BASE}/api/admin/orgs/${org.id}/revoke`, {
        method: "POST",
        credentials: "include",
      });
      const data = await r.json();
      if (!r.ok || data.error) throw new Error(data.error ?? "Failed to revoke organisation");
      if (data.org) setOrgs(prev => prev.map(o => (o.id === org.id ? data.org : o)));
      if (data.warning) alert(data.warning);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to revoke organisation");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div data-testid="admin-organisations">
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={handleImportFile}
        data-testid="input-import-file"
      />
      {importPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-xl bg-background border border-border shadow-xl p-6" data-testid="import-preview-dialog">
            <h3 className="text-lg font-display font-bold text-foreground mb-1">Confirm import</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Import data from <strong className="text-foreground">{importPreview.preview.sourceOrg.name}</strong> (exported {new Date(importPreview.preview.sourceOrg.exportedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}) into this fresh organisation. Nothing has been imported yet.
            </p>
            <ul className="text-sm text-foreground space-y-1.5 mb-4">
              <li>• <strong>{importPreview.preview.willCreate.migratedActivities}</strong> historical activity record(s) will be restored, marked as migrated.</li>
              <li>• <strong>{importPreview.preview.willCreate.settingsApplied.length}</strong> organisation setting(s) will be applied (branding, SROI assumptions, reporting year, toggles).</li>
              <li>• Survey aggregates from <strong>{importPreview.preview.willCreate.surveyAggregatesPreserved}</strong> survey(s) will be preserved for reference.</li>
              <li>• <strong>{importPreview.preview.membersInSource}</strong> member(s) existed in the source organisation. {importPreview.preview.membersNote}</li>
            </ul>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setImportPreview(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium border border-border text-foreground hover:bg-secondary transition-colors"
                data-testid="button-import-cancel"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmImport}
                disabled={busy === importPreview.orgId + "-import-commit"}
                className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
                data-testid="button-import-confirm"
              >
                {busy === importPreview.orgId + "-import-commit" ? "Importing…" : "Import data"}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between mt-12 mb-2">
        <h2 className="text-xl font-display font-bold text-foreground">Organisations</h2>
        <button
          onClick={() => setShowCreate(v => !v)}
          className="px-4 py-1.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
          data-testid="button-new-org"
        >
          {showCreate ? "Cancel" : "New organisation"}
        </button>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        Manage live organisations: create with a data-sharing type, control dashboard sections and revoke access.{" "}
        <Link href="/org/types/explicit-submission" className="text-primary hover:underline">Explicit submission</Link>{" · "}
        <Link href="/org/types/consented-logging" className="text-primary hover:underline">Consented logging</Link>
      </p>

      {showCreate && (
        <form onSubmit={handleCreate} className="rounded-xl border border-border bg-background p-5 mb-6 grid grid-cols-1 sm:grid-cols-2 gap-4" data-testid="form-create-org">
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">Organisation name</label>
            <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:border-primary" data-testid="input-org-name" />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">Type</label>
            <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-border text-sm bg-background" data-testid="select-org-type">
              <option value="charity">Charity</option>
              <option value="company">Company</option>
              <option value="university">University</option>
              <option value="school">School</option>
              <option value="community">Community group</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">Contact name</label>
            <input required value={form.contactName} onChange={e => setForm(f => ({ ...f, contactName: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:border-primary" data-testid="input-contact-name" />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">Contact email</label>
            <input required type="email" value={form.contactEmail} onChange={e => setForm(f => ({ ...f, contactEmail: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:border-primary" data-testid="input-contact-email" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-foreground mb-1.5">
              Data-sharing type <span className="text-muted-foreground font-normal">(cannot be changed after creation — <Link href="/org/types/explicit-submission" className="text-primary hover:underline">learn more</Link>)</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {([
                { value: "explicit_submission", title: "Explicit submission", desc: "Members choose which activities to submit to the organisation. Default and most private." },
                { value: "consented_logging", title: "Consented logging", desc: "Activities are shared automatically for members who consent at join time. Never journals or pulse answers." },
              ] as const).map(opt => (
                <label key={opt.value} className={`flex items-start gap-2.5 rounded-lg border p-3 cursor-pointer text-sm transition-colors ${form.dataSharingMode === opt.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}>
                  <input type="radio" name="dataSharingMode" className="mt-0.5" checked={form.dataSharingMode === opt.value}
                    onChange={() => setForm(f => ({ ...f, dataSharingMode: opt.value }))} data-testid={`radio-mode-${opt.value}`} />
                  <span>
                    <span className="font-semibold text-foreground block">{opt.title}</span>
                    <span className="text-xs text-muted-foreground">{opt.desc}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-foreground mb-1.5">Dashboard sections</label>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {SECTION_KEYS.map(key => (
                <label key={key} className="flex items-center gap-1.5 text-sm text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formSections[key] !== false}
                    onChange={() => setFormSections(s => ({ ...s, [key]: !(s[key] !== false) }))}
                    data-testid={`checkbox-create-section-${key}`}
                  />
                  {SECTION_LABELS[key]}
                </label>
              ))}
            </div>
          </div>
          {createError && <p className="text-xs text-red-600 sm:col-span-2">{createError}</p>}
          <div className="sm:col-span-2">
            <button type="submit" disabled={busy === "create"}
              className="px-5 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50" data-testid="button-create-org">
              {busy === "create" ? "Creating…" : "Create organisation"}
            </button>
          </div>
        </form>
      )}

      {error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 text-sm mb-6">{error}</div>
      )}
      {fetching && !error && <p className="text-sm text-muted-foreground">Loading organisations…</p>}
      {!fetching && !error && orgs.length === 0 && (
        <p className="text-sm text-muted-foreground italic">No organisations yet.</p>
      )}

      {!fetching && !error && orgs.length > 0 && (
        <div className="flex flex-col gap-3">
          {orgs.map(org => (
            <div key={org.id} className={`rounded-xl border shadow-sm overflow-hidden ${org.revokedAt ? "border-destructive/30 bg-destructive/5" : "border-border bg-background"}`} data-testid={`admin-org-${org.id}`}>
              <button
                type="button"
                onClick={() => setExpandedId(id => (id === org.id ? null : org.id))}
                className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left"
              >
                <div className="min-w-0">
                  <span className="font-semibold text-foreground truncate block">{org.name}</span>
                  <span className="text-xs text-muted-foreground capitalize">{org.type} · {org.memberCount} member{org.memberCount !== 1 ? "s" : ""}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {!org.revokedAt && !org.hasManager && (
                    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold border bg-amber-100 text-amber-800 border-amber-200" data-testid={`badge-no-manager-${org.id}`}>No manager yet</span>
                  )}
                  {org.revokedAt && (
                    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold border bg-red-100 text-red-700 border-red-200">Revoked</span>
                  )}
                  <ModeBadge mode={org.dataSharingMode} />
                </div>
              </button>
              {expandedId === org.id && (
                <div className="px-5 pb-4 border-t border-border pt-4">
                  <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm mb-4">
                    <div>
                      <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Contact</span>
                      <p className="text-foreground mt-0.5">{org.contactName ?? <span className="italic text-muted-foreground">Not set</span>}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Email</span>
                      <p className="text-foreground mt-0.5">{org.contactEmail ?? <span className="italic text-muted-foreground">Not set</span>}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Invite code</span>
                      <p className="text-primary font-bold tracking-widest mt-0.5">{org.inviteCode}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Created</span>
                      <p className="text-foreground mt-0.5">{new Date(org.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</p>
                    </div>
                    {org.revokedAt && (
                      <div className="col-span-2">
                        <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Revoked</span>
                        <p className="text-destructive mt-0.5">
                          {new Date(org.revokedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} — data retained until{" "}
                          {new Date(new Date(org.revokedAt).getTime() + 180 * 24 * 60 * 60 * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="mb-4">
                    <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Organisation tier</span>
                    <div className="flex items-center gap-3 mt-2">
                      <button
                        type="button"
                        disabled={busy === org.id + "-fulltier" || !!org.revokedAt}
                        onClick={() => toggleFullTier(org)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-50 ${org.fullTierEnabled ? "bg-green-100 text-green-800 border-green-200" : "bg-secondary text-muted-foreground border-border"}`}
                        data-testid={`toggle-full-tier-${org.id}`}
                      >
                        {busy === org.id + "-fulltier" ? "Saving…" : org.fullTierEnabled ? "Full tier: ON" : "Full tier: OFF"}
                      </button>
                      <p className="text-xs text-muted-foreground">
                        {org.fullTierEnabled
                          ? "Managers see the full Organisation-tier dashboard (analytics, challenges, pulse, export, settings)."
                          : "Managers see the lite portal with the upgrade prompt."}
                      </p>
                    </div>
                  </div>

                  <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Dashboard sections</span>
                  <div className="flex flex-wrap gap-2 mt-2 mb-4">
                    {SECTION_KEYS.map(key => {
                      const on = org.dashboardSections[key] !== false;
                      return (
                        <button
                          key={key}
                          type="button"
                          disabled={busy === org.id + "-sections" || !!org.revokedAt}
                          onClick={() => toggleSection(org, key)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-50 ${on ? "bg-green-100 text-green-800 border-green-200" : "bg-secondary text-muted-foreground border-border line-through"}`}
                          data-testid={`toggle-section-${key}`}
                        >
                          {SECTION_LABELS[key]}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleExport(org)}
                      disabled={busy === org.id + "-export"}
                      className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors border disabled:opacity-50 ${org.revokedAt ? "bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-200" : "bg-secondary hover:bg-secondary/70 text-foreground border-border"}`}
                      data-testid={`button-export-${org.id}`}
                    >
                      {busy === org.id + "-export" ? "Exporting…" : org.revokedAt ? "Export data (data request)" : "Export data"}
                    </button>
                    {!org.revokedAt && org.totalMembershipCount === 0 && (
                      <button
                        type="button"
                        onClick={() => startImport(org)}
                        disabled={busy === org.id + "-import"}
                        className="px-4 py-1.5 rounded-lg bg-secondary hover:bg-secondary/70 text-foreground text-sm font-medium transition-colors border border-border disabled:opacity-50"
                        data-testid={`button-import-${org.id}`}
                      >
                        {busy === org.id + "-import" ? "Validating…" : "Import data…"}
                      </button>
                    )}
                    {!org.revokedAt && !org.hasManager && (
                      <button
                        type="button"
                        onClick={() => handleResendActivation(org)}
                        disabled={busy === org.id + "-resend" || !org.contactEmail}
                        className="px-4 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 text-sm font-medium transition-colors border border-amber-200 disabled:opacity-50"
                        data-testid={`button-resend-activation-${org.id}`}
                      >
                        {busy === org.id + "-resend" ? "Sending…" : "Re-send activation email"}
                      </button>
                    )}
                    {!org.revokedAt && (
                      <button
                        type="button"
                        onClick={() => handleRevoke(org)}
                        disabled={busy === org.id + "-revoke"}
                        className="px-4 py-1.5 rounded-lg bg-destructive/10 hover:bg-destructive/20 text-destructive text-sm font-medium transition-colors border border-destructive/20 disabled:opacity-50"
                        data-testid={`button-revoke-${org.id}`}
                      >
                        {busy === org.id + "-revoke" ? "Revoking…" : "Revoke access"}
                      </button>
                    )}
                  </div>
                  {org.revokedAt && (
                    <p className="text-xs text-muted-foreground mt-2">Export remains available during the 180-day retention window for data requests.</p>
                  )}
                  {!org.revokedAt && !org.hasManager && (
                    <p className="text-xs text-muted-foreground mt-2">
                      {org.contactEmail
                        ? `No one has claimed the manager seat yet. Re-sending emails the invite code to ${org.contactEmail}.`
                        : "No one has claimed the manager seat yet, and no contact email is on file — add one via the contact details to re-send the activation email."}
                    </p>
                  )}
                  {!org.revokedAt && org.totalMembershipCount === 0 && (
                    <p className="text-xs text-muted-foreground mt-2">Import restores an exported organisation's settings and historical activity data into this fresh organisation, marked as migrated. Members re-join through the normal join flow.</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
