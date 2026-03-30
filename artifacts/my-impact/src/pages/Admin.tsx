import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";

const ADMIN_EMAILS = [
  "maddie@socialvalueengine.com",
  "ivan.annibal@roseregeneration.co.uk",
];

interface AdminUser {
  id: string;
  displayName: string | null;
  email: string;
  createdAt: string;
  pagesVisited: string[];
}

interface OrgRequest {
  id: string;
  orgName: string;
  type: string;
  contactName: string;
  contactEmail: string;
  size: string | null;
  purpose: string | null;
  status: string;
  inviteCode: string | null;
  createdAt: string;
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
    approved: "bg-green-100 text-green-800 border-green-200",
    rejected: "bg-red-100 text-red-700 border-red-200",
  };
  const style = styles[status] ?? "bg-secondary text-muted-foreground border-border";
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold border ${style} capitalize`}>
      {status}
    </span>
  );
}

export default function Admin() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [orgRequests, setOrgRequests] = useState<OrgRequest[]>([]);
  const [orgFetching, setOrgFetching] = useState(true);
  const [orgError, setOrgError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const isAdmin = user && ADMIN_EMAILS.includes(user.email.toLowerCase());

  useEffect(() => {
    if (isLoading) return;
    if (!user || !isAdmin) {
      setLocation("/", { replace: true });
      return;
    }

    fetch(`${BASE}/api/admin/users`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setUsers(data.users);
      })
      .catch((err) => setError(err.message ?? "Failed to load users"))
      .finally(() => setFetching(false));

    fetch(`${BASE}/api/admin/org-requests`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setOrgRequests(data.requests);
      })
      .catch((err) => setOrgError(err.message ?? "Failed to load org requests"))
      .finally(() => setOrgFetching(false));
  }, [isLoading, user, isAdmin]);

  async function handleApprove(id: string) {
    setActionLoading(id + "-approve");
    try {
      const r = await fetch(`${BASE}/api/admin/org-requests/${id}/approve`, {
        method: "POST",
        credentials: "include",
      });
      const data = await r.json();
      if (data.error) throw new Error(data.error);
      setOrgRequests((prev) =>
        prev.map((req) =>
          req.id === id ? { ...req, status: "approved", inviteCode: data.inviteCode } : req
        )
      );
      if (data.warning) {
        alert(data.warning);
      }
    } catch (err: unknown) {
      alert((err instanceof Error ? err.message : null) ?? "Failed to approve request");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleReject(id: string) {
    setActionLoading(id + "-reject");
    try {
      const r = await fetch(`${BASE}/api/admin/org-requests/${id}/reject`, {
        method: "POST",
        credentials: "include",
      });
      const data = await r.json();
      if (data.error) throw new Error(data.error);
      setOrgRequests((prev) =>
        prev.map((req) =>
          req.id === id ? { ...req, status: "rejected" } : req
        )
      );
    } catch (err: unknown) {
      alert((err instanceof Error ? err.message : null) ?? "Failed to reject request");
    } finally {
      setActionLoading(null);
    }
  }

  if (isLoading || (!isAdmin && !fetching)) return null;

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-display font-bold text-foreground mb-2">Admin Panel</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Registered users and the pages they have visited.
      </p>

      {error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 text-sm mb-6">
          {error}
        </div>
      )}

      {fetching && !error && (
        <p className="text-sm text-muted-foreground">Loading users...</p>
      )}

      {!fetching && !error && (
        <div className="overflow-x-auto rounded-xl border border-border shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                <th className="text-left px-4 py-3 font-semibold text-foreground">Name</th>
                <th className="text-left px-4 py-3 font-semibold text-foreground">Email</th>
                <th className="text-left px-4 py-3 font-semibold text-foreground">Joined</th>
                <th className="text-left px-4 py-3 font-semibold text-foreground">Pages Visited</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                    No users found.
                  </td>
                </tr>
              )}
              {users.map((u, idx) => (
                <tr
                  key={u.id}
                  className={idx % 2 === 0 ? "bg-background" : "bg-secondary/20"}
                >
                  <td className="px-4 py-3 text-foreground font-medium">
                    {u.displayName ?? <span className="text-muted-foreground italic">—</span>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                    {new Date(u.createdAt).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {u.pagesVisited.length > 0
                      ? u.pagesVisited.join(", ")
                      : <span className="italic">None</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-6 text-xs text-muted-foreground">
        {users.length} user{users.length !== 1 ? "s" : ""} total
      </p>

      <h2 className="text-xl font-display font-bold text-foreground mt-12 mb-2">Organisation Requests</h2>
      <p className="text-sm text-muted-foreground mb-6">
        Approve or reject incoming organisation registration requests.
      </p>

      {orgError && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 text-sm mb-6">
          {orgError}
        </div>
      )}

      {orgFetching && !orgError && (
        <p className="text-sm text-muted-foreground">Loading requests...</p>
      )}

      {!orgFetching && !orgError && orgRequests.length === 0 && (
        <p className="text-sm text-muted-foreground italic">No organisation requests yet.</p>
      )}

      {!orgFetching && !orgError && orgRequests.length > 0 && (
        <div className="flex flex-col gap-4">
          {orgRequests.map((req) => (
            <div
              key={req.id}
              className="rounded-xl border border-border shadow-sm bg-background overflow-hidden"
            >
              <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-border bg-secondary/30">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="min-w-0">
                    <span className="font-semibold text-foreground text-base truncate block">{req.orgName}</span>
                    <span className="text-xs text-muted-foreground">{req.type}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <StatusBadge status={req.status} />
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(req.createdAt).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>
              </div>
              <div className="px-5 py-4 grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                <div>
                  <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Contact</span>
                  <p className="text-foreground mt-0.5">{req.contactName}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Email</span>
                  <p className="text-foreground mt-0.5">
                    <a href={`mailto:${req.contactEmail}`} className="text-primary hover:underline">{req.contactEmail}</a>
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Approx size</span>
                  <p className="text-foreground mt-0.5">{req.size ?? <span className="italic text-muted-foreground">Not specified</span>}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Purpose</span>
                  <p className="text-foreground mt-0.5 line-clamp-2">{req.purpose ?? <span className="italic text-muted-foreground">Not provided</span>}</p>
                </div>
                {req.status === "approved" && req.inviteCode && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Invite code</span>
                    <p className="text-primary font-bold tracking-widest text-lg mt-0.5">{req.inviteCode}</p>
                  </div>
                )}
              </div>
              {req.status === "pending" && (
                <div className="px-5 py-3 border-t border-border flex gap-3">
                  <button
                    onClick={() => handleApprove(req.id)}
                    disabled={actionLoading !== null}
                    className="px-4 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {actionLoading === req.id + "-approve" ? "Approving…" : "Approve"}
                  </button>
                  <button
                    onClick={() => handleReject(req.id)}
                    disabled={actionLoading !== null}
                    className="px-4 py-1.5 rounded-lg bg-destructive/10 hover:bg-destructive/20 text-destructive text-sm font-medium transition-colors border border-destructive/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {actionLoading === req.id + "-reject" ? "Rejecting…" : "Reject"}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="mt-6 text-xs text-muted-foreground">
        {orgRequests.length} request{orgRequests.length !== 1 ? "s" : ""} total
      </p>
    </div>
  );
}
