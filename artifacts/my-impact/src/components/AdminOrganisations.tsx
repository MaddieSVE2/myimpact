import { useEffect, useState } from "react";
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
  revokedAt: string | null;
  createdAt: string;
  memberCount: number;
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
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
