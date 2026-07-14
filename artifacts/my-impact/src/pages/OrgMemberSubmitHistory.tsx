import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { History, ArrowLeft, Loader2, AlertCircle, Plus } from "lucide-react";
import { useMyOrg } from "@/lib/org-export";
import { useAuth } from "@/lib/auth-context";

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

interface MySubmission {
  recordId: number;
  name: string;
  period: string | null;
  totalHours: number;
  totalValue: number;
  submittedAt: string;
  activityCount: number;
}

function formatGBP(n: number): string {
  return `£${Math.round(n).toLocaleString("en-GB")}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function OrgMemberSubmitHistory() {
  const { user, isLoading: authLoading } = useAuth();
  const { data: orgData, isLoading: orgLoading } = useMyOrg();

  const [subs, setSubs] = useState<MySubmission[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/api/org/my-submissions`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load your submissions");
      const data = await res.json();
      setSubs(Array.isArray(data?.submissions) ? data.submissions : []);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    if (!user || !orgData?.org) return;
    load();
  }, [user, orgData?.org, load]);

  if (authLoading || orgLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 flex justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-base font-semibold mb-2">Please log in to see your submissions.</p>
        <Link href="/login" className="text-primary underline">Log in</Link>
      </div>
    );
  }

  if (!orgData?.org) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-base font-semibold mb-2">You're not connected to an organisation yet.</p>
        <p className="text-sm text-muted-foreground mb-4">Join your organisation first to submit activities to it.</p>
        <Link href="/org" className="text-primary underline">Go to the organisation portal</Link>
      </div>
    );
  }

  const orgName = orgData.org.name;
  const totalHours = (subs ?? []).reduce((s, x) => s + x.totalHours, 0);
  const totalValue = (subs ?? []).reduce((s, x) => s + x.totalValue, 0);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8" data-testid="org-submit-history-root">
      <Link
        href="/org/submit"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground mb-4"
        data-testid="submit-history-back"
      >
        <ArrowLeft className="w-4 h-4" /> Back to submit
      </Link>

      <div className="flex items-start gap-3 mb-6">
        <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
          <History className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-display font-semibold text-foreground">My submissions to {orgName}</h1>
          <p className="text-sm text-muted-foreground">
            Everything you've sent to {orgName} through the submission flow, and how it counted toward their totals.
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4 text-sm text-red-700 flex items-start gap-2" data-testid="submit-history-error">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>Couldn't load your submissions. {error}</span>
        </div>
      )}

      {!error && subs === null && (
        <div className="py-12 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      )}

      {subs !== null && subs.length === 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white border border-border rounded-xl p-10 text-center" data-testid="submit-history-empty">
          <p className="text-sm font-semibold text-foreground mb-1">Nothing submitted yet</p>
          <p className="text-sm text-muted-foreground mb-5">
            When you submit activities to {orgName}, they'll show up here so you always have a record.
          </p>
          <Link
            href="/org/submit"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors"
            data-testid="submit-history-empty-cta"
          >
            <Plus className="w-4 h-4" /> Submit activities
          </Link>
        </motion.div>
      )}

      {subs !== null && subs.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-white border border-border rounded-xl p-4" data-testid="submit-history-total-count">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Submissions</p>
              <p className="text-xl font-bold text-foreground tabular-nums">{subs.length.toLocaleString("en-GB")}</p>
            </div>
            <div className="bg-white border border-border rounded-xl p-4" data-testid="submit-history-total-hours">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Total hours</p>
              <p className="text-xl font-bold text-foreground tabular-nums">{Math.round(totalHours).toLocaleString("en-GB")}</p>
            </div>
            <div className="bg-white border border-border rounded-xl p-4" data-testid="submit-history-total-value">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Est. social value</p>
              <p className="text-xl font-bold text-foreground tabular-nums">{formatGBP(totalValue)}</p>
            </div>
          </div>

          <div className="bg-white border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 text-left">
                  <th className="py-2.5 px-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Submission</th>
                  <th className="py-2.5 pr-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Activities</th>
                  <th className="py-2.5 pr-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Hours</th>
                  <th className="py-2.5 pr-4 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Est. value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {subs.map(s => (
                  <tr key={s.recordId} data-testid={`submit-history-row-${s.recordId}`}>
                    <td className="py-2.5 px-4">
                      <p className="font-medium text-foreground">{s.period || s.name}</p>
                      <p className="text-[11px] text-muted-foreground">Submitted {formatDate(s.submittedAt)}</p>
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums whitespace-nowrap">{s.activityCount}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums whitespace-nowrap">{Math.round(s.totalHours).toLocaleString("en-GB")}</td>
                    <td className="py-2.5 pr-4 text-right font-semibold tabular-nums whitespace-nowrap">{formatGBP(s.totalValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-[11px] text-muted-foreground mt-3">
            Sent something by mistake? You can withdraw a submission right after sending it on the submit page, or ask your organisation manager to remove it.
          </p>
        </motion.div>
      )}
    </div>
  );
}
