import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Trophy, Plus, Users, Calendar, Target, ChevronRight, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface ChallengeSummary {
  id: string;
  name: string;
  description: string | null;
  goalType: "social_value" | "hours";
  target: number;
  startDate: string;
  endDate: string;
  scope: "personal" | "org";
  inviteCode: string;
  participantCount: number;
  isOwner: boolean;
  progressTotal: number;
  progressPercent: number;
  isActive: boolean;
  hasEnded: boolean;
  hasStarted: boolean;
}

function useMyChallenges() {
  return useQuery<{ challenges: ChallengeSummary[] }>({
    queryKey: ["challenges-mine"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/challenges/mine`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load challenges");
      return res.json();
    },
  });
}

function useMyOrg() {
  return useQuery<{ org: { id: string; name: string; type: string; role: string } | null }>({
    queryKey: ["my-org"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/org/my`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });
}

function formatGoal(goalType: string, value: number): string {
  if (goalType === "hours") return `${Math.round(value).toLocaleString()} hrs`;
  return formatCurrency(value);
}

function dateRange(startISO: string, endISO: string): string {
  const start = new Date(startISO);
  const end = new Date(endISO);
  const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return `${fmt(start)} – ${fmt(end)}`;
}

function ChallengeCard({ c }: { c: ChallengeSummary }) {
  const status = c.hasEnded ? "ended" : c.hasStarted ? "active" : "upcoming";
  const statusBadge =
    status === "ended"
      ? { label: "Ended", color: "bg-muted text-muted-foreground" }
      : status === "active"
        ? { label: "Active", color: "bg-green-100 text-green-700" }
        : { label: "Upcoming", color: "bg-amber-100 text-amber-700" };

  return (
    <Link
      href={`/challenges/${c.id}`}
      className="block bg-white rounded-2xl border border-border p-5 hover:border-primary/40 hover:shadow-md transition-all"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${statusBadge.color}`}>
              {statusBadge.label}
            </span>
            {c.scope === "org" && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                Org
              </span>
            )}
            {c.isOwner && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">
                Owner
              </span>
            )}
          </div>
          <h3 className="font-display font-bold text-foreground text-base leading-tight truncate">{c.name}</h3>
        </div>
        <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" aria-hidden="true" />
      </div>

      <div className="space-y-2.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5" aria-hidden="true" />
            {formatGoal(c.goalType, c.progressTotal)} of {formatGoal(c.goalType, c.target)}
          </span>
          <span className="font-semibold text-foreground">{c.progressPercent}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${Math.min(100, c.progressPercent)}%` }}
          />
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Users className="w-3.5 h-3.5" aria-hidden="true" /> {c.participantCount}
          </span>
          <span className="inline-flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" aria-hidden="true" /> {dateRange(c.startDate, c.endDate)}
          </span>
        </div>
      </div>
    </Link>
  );
}

interface CreateBody {
  name: string;
  description: string;
  goalType: "social_value" | "hours";
  target: number;
  startDate: string;
  endDate: string;
  scope: "personal" | "org";
  departmentTag?: string | null;
}

function CreateChallengeForm({
  canCreateOrg,
  onCreated,
  onCancel,
}: {
  canCreateOrg: boolean;
  onCreated: (id: string) => void;
  onCancel: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const inThreeMonths = new Date();
  inThreeMonths.setMonth(inThreeMonths.getMonth() + 3);
  const defaultEnd = inThreeMonths.toISOString().slice(0, 10);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [goalType, setGoalType] = useState<"social_value" | "hours">("social_value");
  const [target, setTarget] = useState("10000");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [scope, setScope] = useState<"personal" | "org">("personal");
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: async (body: CreateBody) => {
      const res = await fetch(`${BASE}/api/challenges`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create challenge");
      return data as { challenge: { id: string } };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["challenges-mine"] });
      onCreated(data.challenge.id);
    },
    onError: (err: Error) => setError(err.message),
  });

  const handleSubmit = () => {
    setError(null);
    const targetNum = parseFloat(target);
    if (!name.trim()) { setError("Give your challenge a name"); return; }
    if (!Number.isFinite(targetNum) || targetNum <= 0) { setError("Target must be a positive number"); return; }
    if (new Date(endDate).getTime() <= new Date(startDate).getTime()) {
      setError("End date must be after start date"); return;
    }
    createMutation.mutate({
      name: name.trim(),
      description: description.trim(),
      goalType,
      target: targetNum,
      startDate,
      endDate,
      scope,
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white border border-border rounded-2xl p-6 space-y-5"
    >
      <div>
        <h2 className="text-lg font-display font-semibold text-foreground mb-1">New challenge</h2>
        <p className="text-sm text-muted-foreground">Set a shared target and rally your friends or team to hit it.</p>
      </div>

      <div className="space-y-1.5">
        <label className="block text-xs font-medium text-foreground">Name</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Spring volunteering sprint"
          maxLength={120}
          className="w-full px-3 py-2.5 rounded-lg border border-border text-sm focus:outline-none focus:border-primary"
        />
      </div>

      <div className="space-y-1.5">
        <label className="block text-xs font-medium text-foreground">Description <span className="text-muted-foreground font-normal">(optional)</span></label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder="A short note about why this matters"
          className="w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:border-primary resize-y"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-foreground">Goal type</label>
          <select
            value={goalType}
            onChange={e => setGoalType(e.target.value as "social_value" | "hours")}
            className="w-full px-3 py-2.5 rounded-lg border border-border text-sm bg-white focus:outline-none focus:border-primary"
          >
            <option value="social_value">Social value (£)</option>
            <option value="hours">Volunteer hours</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-foreground">Target</label>
          <input
            type="number"
            value={target}
            onChange={e => setTarget(e.target.value)}
            min="1"
            className="w-full px-3 py-2.5 rounded-lg border border-border text-sm focus:outline-none focus:border-primary"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-foreground">Starts</label>
          <input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg border border-border text-sm focus:outline-none focus:border-primary"
          />
        </div>
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-foreground">Ends</label>
          <input
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            min={startDate}
            className="w-full px-3 py-2.5 rounded-lg border border-border text-sm focus:outline-none focus:border-primary"
          />
        </div>
      </div>

      {canCreateOrg && (
        <div className="space-y-2">
          <label className="block text-xs font-medium text-foreground">Scope</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setScope("personal")}
              className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                scope === "personal"
                  ? "bg-primary text-white border-primary"
                  : "bg-white text-foreground border-border hover:border-primary/40"
              }`}
            >
              Friends (private)
            </button>
            <button
              type="button"
              onClick={() => setScope("org")}
              className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                scope === "org"
                  ? "bg-primary text-white border-primary"
                  : "bg-white text-foreground border-border hover:border-primary/40"
              }`}
            >
              My organisation
            </button>
          </div>
          {scope === "org" && (
            <p className="text-xs text-muted-foreground">All current org members will be auto-included.</p>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-100">
          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" aria-hidden="true" />
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}

      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={handleSubmit}
          disabled={createMutation.isPending}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-white text-sm font-bold disabled:opacity-50 transition-opacity"
          style={{ background: "#F06127" }}
        >
          {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
          Create challenge
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground border border-border hover:bg-muted/30 transition-colors"
        >
          Cancel
        </button>
      </div>
    </motion.div>
  );
}

export default function Challenges() {
  const { data, isLoading, isError, refetch } = useMyChallenges();
  const { data: orgData } = useMyOrg();
  const [showCreate, setShowCreate] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [, setLocation] = useState<string | null>(null);

  const canCreateOrg = orgData?.org?.role === "manager";
  const challenges = data?.challenges ?? [];

  const active = challenges.filter(c => c.isActive || (!c.hasStarted && !c.hasEnded));
  const ended = challenges.filter(c => c.hasEnded);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-center px-4">
        <AlertCircle className="w-10 h-10 text-destructive" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">Could not load your challenges.</p>
        <button onClick={() => refetch()} className="text-sm text-primary underline hover:text-primary/80">
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-start justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Trophy className="w-5 h-5 text-primary" aria-hidden="true" />
            <h1 className="text-2xl font-bold text-foreground">Challenges</h1>
          </div>
          <p className="text-sm text-muted-foreground">Group goals you're part of. Records logged inside the challenge dates count toward the total.</p>
        </div>
        {!showCreate && (
          <button
            onClick={() => { setShowCreate(true); setCreatedId(null); setLocation(null); }}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-white text-sm font-bold shrink-0"
            style={{ background: "#F06127" }}
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            New
          </button>
        )}
      </div>

      {showCreate && (
        <div className="mb-6">
          <CreateChallengeForm
            canCreateOrg={!!canCreateOrg}
            onCreated={(id) => { setShowCreate(false); setCreatedId(id); }}
            onCancel={() => setShowCreate(false)}
          />
        </div>
      )}

      {createdId && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-100"
        >
          <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" aria-hidden="true" />
          <p className="text-sm text-green-800 flex-1">Challenge created.</p>
          <Link href={`/challenges/${createdId}`} className="text-sm font-semibold text-green-700 hover:underline">
            View
          </Link>
        </motion.div>
      )}

      {challenges.length === 0 && !showCreate && (
        <div className="bg-white border border-dashed border-border rounded-2xl p-10 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-orange-50 mb-3">
            <Trophy className="w-6 h-6 text-primary" aria-hidden="true" />
          </div>
          <p className="text-base font-display font-semibold text-foreground mb-1">No challenges yet</p>
          <p className="text-sm text-muted-foreground mb-5 max-w-sm mx-auto">
            Create a private challenge to invite friends, or join one with a link.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-white text-sm font-bold"
            style={{ background: "#F06127" }}
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            Create your first
          </button>
        </div>
      )}

      {active.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Active & upcoming</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {active.map(c => <ChallengeCard key={c.id} c={c} />)}
          </div>
        </section>
      )}

      {ended.length > 0 && (
        <section>
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Ended</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {ended.map(c => <ChallengeCard key={c.id} c={c} />)}
          </div>
        </section>
      )}
    </div>
  );
}
