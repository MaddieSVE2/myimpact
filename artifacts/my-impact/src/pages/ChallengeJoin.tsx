import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Trophy, Loader2, AlertCircle, CheckCircle2, LogIn } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface ChallengePreview {
  id: string;
  name: string;
  description: string | null;
  goalType: string;
  target: number;
  startDate: string;
  endDate: string;
  scope: string;
  participantCount: number;
  hasEnded: boolean;
}

export default function ChallengeJoin() {
  const [, setLocation] = useLocation();
  const { isLoggedIn, isLoading } = useAuth();
  const queryClient = useQueryClient();

  const [code, setCode] = useState("");
  const [preview, setPreview] = useState<ChallengePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const c = params.get("code");
    if (c) setCode(c.toUpperCase());
  }, []);

  useEffect(() => {
    if (!code || !isLoggedIn) return;
    setLoadingPreview(true);
    setError(null);
    fetch(`${BASE}/api/challenges/by-code/${encodeURIComponent(code)}`, { credentials: "include" })
      .then(async r => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "Could not find that challenge");
        setPreview(data.challenge);
      })
      .catch((err: Error) => { setError(err.message); setPreview(null); })
      .finally(() => setLoadingPreview(false));
  }, [code, isLoggedIn]);

  const joinMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/challenges/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ inviteCode: code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to join");
      return data as { challenge: { id: string } };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["challenges-mine"] });
      setLocation(`/challenges/${data.challenge.id}`);
    },
    onError: (err: Error) => setError(err.message),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isLoggedIn) {
    const returnTo = encodeURIComponent(`/challenges/join${window.location.search}`);
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-6" style={{ background: "rgba(232,99,58,0.10)" }}>
          <Trophy className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-2xl font-display font-bold text-foreground mb-3">You've been invited to a challenge</h1>
        <p className="text-muted-foreground mb-8 leading-relaxed">
          Log in or create a free account to see the challenge and join.
        </p>
        <Link
          href={`/login?next=${returnTo}`}
          className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-md bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          <LogIn className="w-4 h-4" />
          Log in to join
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white border border-border rounded-2xl p-6"
      >
        <div className="flex items-center gap-2 mb-4">
          <Trophy className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-display font-semibold text-foreground">Join a challenge</h1>
        </div>

        <label className="block text-xs font-medium text-foreground mb-1.5">Invite code</label>
        <input
          type="text"
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase())}
          placeholder="e.g. AB12CD34"
          className="w-full px-3 py-2.5 rounded-lg border border-border text-sm font-mono uppercase focus:outline-none focus:border-primary mb-4"
        />

        {loadingPreview && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Looking up challenge…
          </div>
        )}

        {preview && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-lg border border-border bg-muted/20 p-4 mb-4"
          >
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              <p className="text-xs font-bold uppercase tracking-wider text-green-700">Found</p>
            </div>
            <p className="text-base font-display font-semibold text-foreground">{preview.name}</p>
            {preview.description && (
              <p className="text-xs text-muted-foreground mt-1">{preview.description}</p>
            )}
            <p className="text-xs text-muted-foreground mt-2">
              {preview.participantCount} participant{preview.participantCount === 1 ? "" : "s"} ·
              Ends {new Date(preview.endDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
            </p>
            {preview.hasEnded && (
              <p className="text-xs text-amber-700 mt-2">This challenge has already ended.</p>
            )}
          </motion.div>
        )}

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-100 mb-4">
            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}

        <button
          onClick={() => joinMutation.mutate()}
          disabled={!preview || preview.hasEnded || joinMutation.isPending}
          className="w-full px-5 py-2.5 rounded-lg text-white text-sm font-bold disabled:opacity-50 transition-opacity inline-flex items-center justify-center gap-2"
          style={{ background: "#F06127" }}
        >
          {joinMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          Join challenge
        </button>

        <Link href="/challenges" className="block text-center text-xs text-muted-foreground mt-3 hover:text-foreground">
          Back to challenges
        </Link>
      </motion.div>
    </div>
  );
}
