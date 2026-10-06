import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { NoIndexMeta } from "@/components/PageMeta";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface EmailLogEntry {
  id: number;
  toAddresses: string[];
  subject: string;
  category: string;
  status: string;
  error: string | null;
  sentAt: string;
  lastEventAt: string | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  "sign-in": "Sign-in link",
  onboarding: "Onboarding",
  "monthly-digest": "Monthly recap",
  "activity-reminder": "Activity reminder",
  "approval-digest": "Approval reminder",
  organisation: "Organisation",
  account: "Account",
  challenge: "Challenge",
  internal: "Internal",
};

const STATUS_LABELS: Record<string, string> = {
  sent: "Sent",
  delayed: "Delayed",
  delivered: "Delivered",
  opened: "Opened",
  clicked: "Clicked",
  failed: "Failed",
  bounced: "Bounced",
  suppressed: "Suppressed",
  complained: "Marked as spam",
};

const PROBLEM_STATUSES = new Set(["failed", "bounced", "suppressed", "complained"]);

interface EmailReply {
  id: number;
  fromAddress: string;
  subject: string;
  textBody: string | null;
  forwardStatus: string | null;
  receivedAt: string;
  inReplyToSubject: string | null;
  inReplyToCategory: string | null;
  inReplyToSentAt: string | null;
}

const ukDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

function RepliesList() {
  const [, setLocation] = useLocation();
  const [replies, setReplies] = useState<EmailReply[]>([]);
  const [nextBefore, setNextBefore] = useState<number | null>(null);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(before: number | null) {
    setFetching(true);
    try {
      const params = before ? `?before=${before}` : "";
      const r = await fetch(`${BASE}/api/admin/email-replies${params}`, { credentials: "include" });
      if (r.status === 403) {
        setLocation("/", { replace: true });
        return;
      }
      if (!r.ok) throw new Error("Could not load replies");
      const data: { replies: EmailReply[]; nextBefore: number | null } = await r.json();
      setReplies((prev) => (before ? [...prev, ...data.replies] : data.replies));
      setNextBefore(data.nextBefore);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load replies");
    } finally {
      setFetching(false);
    }
  }

  useEffect(() => {
    void load(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  return (
    <div className="space-y-3">
      {replies.length === 0 && !fetching && <p className="text-sm text-muted-foreground">No replies yet.</p>}
      {replies.map((reply) => (
        <article key={reply.id} className="border rounded p-3 space-y-1">
          <div className="flex flex-wrap justify-between gap-2 text-sm">
            <span className="font-medium break-all">{reply.fromAddress}</span>
            <span className="text-muted-foreground">{ukDateTime(reply.receivedAt)}</span>
          </div>
          <p className="text-sm">{reply.subject || "(no subject)"}</p>
          <p className="text-xs text-muted-foreground">
            {reply.inReplyToSubject
              ? `In reply to "${reply.inReplyToSubject}" (${CATEGORY_LABELS[reply.inReplyToCategory ?? ""] ?? reply.inReplyToCategory}), sent ${ukDateTime(reply.inReplyToSentAt!)}`
              : "Not matched to an email we sent"}
            {reply.forwardStatus ? ` · ${reply.forwardStatus}` : ""}
          </p>
          <details>
            <summary className="text-sm text-primary cursor-pointer">Show message</summary>
            <pre className="mt-2 whitespace-pre-wrap break-words text-sm font-sans">
              {reply.textBody ?? "The message text could not be fetched. It is in Resend's received emails."}
            </pre>
          </details>
        </article>
      ))}
      {fetching && <p className="text-sm text-muted-foreground">Loading…</p>}
      {nextBefore && !fetching && (
        <button type="button" onClick={() => void load(nextBefore)} className="px-3 py-1.5 rounded border text-sm">
          Load older replies
        </button>
      )}
    </div>
  );
}

export default function AdminEmailLog() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [view, setView] = useState<"sent" | "replies">("sent");

  const [entries, setEntries] = useState<EmailLogEntry[]>([]);
  const [nextBefore, setNextBefore] = useState<number | null>(null);
  const [retentionDays, setRetentionDays] = useState<number | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !user) setLocation("/", { replace: true });
  }, [isLoading, user, setLocation]);

  async function load(before: number | null) {
    setFetching(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (category) params.set("category", category);
    if (status) params.set("status", status);
    if (before) params.set("before", String(before));
    try {
      const r = await fetch(`${BASE}/api/admin/email-log?${params}`, { credentials: "include" });
      if (r.status === 403) {
        setLocation("/", { replace: true });
        return;
      }
      if (!r.ok) throw new Error("Could not load the email log");
      const data: { entries: EmailLogEntry[]; nextBefore: number | null; retentionDays: number } = await r.json();
      setEntries((prev) => (before ? [...prev, ...data.entries] : data.entries));
      setNextBefore(data.nextBefore);
      setRetentionDays(data.retentionDays);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the email log");
    } finally {
      setFetching(false);
    }
  }

  useEffect(() => {
    if (isLoading || !user) return;
    void load(null);
    // load() reads the current filters; re-run whenever they change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, user, search, category, status]);

  if (isLoading || !user) return null;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <NoIndexMeta />
      <div>
        <Link href="/admin" className="text-sm text-muted-foreground hover:underline">
          ← Back to admin
        </Link>
        <h1 className="text-2xl font-bold mt-2">Email log</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Every email My Impact has sent, newest first, with what Resend reported back, and the
          replies people sent. Sent message content is not stored.
          {retentionDays ? ` Everything here is deleted after ${Math.round(retentionDays / 30)} months.` : ""}
        </p>
      </div>

      <div className="flex gap-2" role="group" aria-label="Show">
        {(["sent", "replies"] as const).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={view === v}
            onClick={() => setView(v)}
            className={`px-3 py-1.5 rounded border text-sm ${view === v ? "bg-primary text-primary-foreground" : "bg-background"}`}
          >
            {v === "sent" ? "Sent" : "Replies"}
          </button>
        ))}
      </div>

      {view === "replies" ? <RepliesList /> : (<>

      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(searchInput.trim());
        }}
      >
        <label className="sr-only" htmlFor="email-log-search">
          Search by recipient or subject
        </label>
        <input
          id="email-log-search"
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Recipient or subject"
          className="border rounded px-3 py-1.5 text-sm bg-background flex-1 min-w-48"
        />
        <label className="sr-only" htmlFor="email-log-category">
          Type
        </label>
        <select
          id="email-log-category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="border rounded px-2 py-1.5 text-sm bg-background"
        >
          <option value="">All types</option>
          {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="email-log-status">
          Status
        </label>
        <select
          id="email-log-status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="border rounded px-2 py-1.5 text-sm bg-background"
        >
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button type="submit" className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-sm">
          Search
        </button>
      </form>

      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : entries.length === 0 && !fetching ? (
        <p className="text-sm text-muted-foreground">No emails match.</p>
      ) : (
        <div className="overflow-x-auto border rounded">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Sent</th>
                <th scope="col" className="px-3 py-2 font-medium">To</th>
                <th scope="col" className="px-3 py-2 font-medium">Subject</th>
                <th scope="col" className="px-3 py-2 font-medium">Type</th>
                <th scope="col" className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-t align-top">
                  <td className="px-3 py-2 whitespace-nowrap">{ukDateTime(e.sentAt)}</td>
                  <td className="px-3 py-2 break-all">{e.toAddresses.join(", ")}</td>
                  <td className="px-3 py-2">{e.subject}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{CATEGORY_LABELS[e.category] ?? e.category}</td>
                  <td className="px-3 py-2">
                    <span className={PROBLEM_STATUSES.has(e.status) ? "font-medium text-red-700" : undefined}>
                      {STATUS_LABELS[e.status] ?? e.status}
                    </span>
                    {e.lastEventAt && (
                      <span className="block text-xs text-muted-foreground">{ukDateTime(e.lastEventAt)}</span>
                    )}
                    {e.error && <span className="block text-xs text-red-700 break-words">{e.error}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {fetching && <p className="text-sm text-muted-foreground">Loading…</p>}
      {nextBefore && !fetching && (
        <button
          type="button"
          onClick={() => void load(nextBefore)}
          className="px-3 py-1.5 rounded border text-sm"
        >
          Load older emails
        </button>
      )}
      </>)}
    </div>
  );
}
