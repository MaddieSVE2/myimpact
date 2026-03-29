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

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function Admin() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
  }, [isLoading, user, isAdmin]);

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
    </div>
  );
}
