import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpen, Plus, Trash2, ArrowLeft, Sparkles, LogIn } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";

interface JournalEntry {
  id: string;
  type: "entry";
  text: string;
  prompt: string;
  createdAt: string;
}

interface ActivityCard {
  id: string;
  type: "activity";
  impactRecordId: string;
  periodLabel: string;
  summary: string;
  reflectionPrompt: string;
  reflectionText: string;
  createdAt: string;
}

type FeedItem = JournalEntry | ActivityCard;

interface ApiEntryShape {
  id: string;
  type: string;
  text?: string;
  prompt?: string;
  reflectionText?: string;
  periodLabel?: string;
  impactRecordId?: string;
  summary?: string;
  reflectionPrompt?: string;
  createdAt: string;
}

interface MigrateResponse {
  migrated: number;
}

const PROMPTS = [
  "What motivated you to get involved in this?",
  "How did it make you feel to contribute?",
  "What difference do you think you've made?",
  "What have you learned about yourself through this?",
  "Who has inspired you to take action?",
  "What would you like to do more of next year?",
  "How has your community benefited from your actions?",
  "What surprised you about getting involved?",
];

function randomPrompt() {
  return PROMPTS[Math.floor(Math.random() * PROMPTS.length)];
}

const STORAGE_KEY = "myimpact_journal";

function isActivityCard(item: unknown): item is ActivityCard {
  if (typeof item !== "object" || item === null) return false;
  const obj = item as Record<string, unknown>;
  return (
    typeof obj.id === "string" &&
    obj.type === "activity" &&
    typeof obj.impactRecordId === "string" &&
    typeof obj.periodLabel === "string" &&
    typeof obj.summary === "string" &&
    typeof obj.reflectionPrompt === "string" &&
    typeof obj.reflectionText === "string" &&
    typeof obj.createdAt === "string"
  );
}

interface JournalEntryRaw {
  id: string;
  text: string;
  prompt: string;
  createdAt: string;
}

function isJournalEntryLike(item: unknown): item is JournalEntryRaw {
  if (typeof item !== "object" || item === null) return false;
  const obj = item as Record<string, unknown>;
  return (
    typeof obj.id === "string" &&
    typeof obj.text === "string" &&
    typeof obj.prompt === "string" &&
    typeof obj.createdAt === "string"
  );
}

function isApiEntry(value: unknown): value is ApiEntryShape {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return typeof obj.id === "string" && typeof obj.createdAt === "string";
}

function loadLocalEntries(): FeedItem[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    const result: FeedItem[] = [];
    for (const item of parsed) {
      if (isActivityCard(item)) {
        result.push(item);
      } else if (isJournalEntryLike(item)) {
        result.push({
          id: item.id,
          type: "entry",
          text: item.text,
          prompt: item.prompt,
          createdAt: item.createdAt,
        });
      }
    }
    return result;
  } catch {
    return [];
  }
}

function saveLocalEntries(entries: FeedItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function apiEntryToFeedItem(e: ApiEntryShape): FeedItem {
  if (e.type === "activity") {
    return {
      id: e.id,
      type: "activity",
      impactRecordId: e.impactRecordId ?? "",
      periodLabel: e.periodLabel ?? "",
      summary: e.summary ?? "",
      reflectionPrompt: e.reflectionPrompt ?? "",
      reflectionText: e.reflectionText ?? "",
      createdAt: e.createdAt,
    };
  }
  return {
    id: e.id,
    type: "entry",
    text: e.text ?? "",
    prompt: e.prompt ?? "",
    createdAt: e.createdAt,
  };
}

function ActivityCardItem({
  card,
  onDelete,
  onSaveReflection,
}: {
  card: ActivityCard;
  onDelete: (id: string) => void;
  onSaveReflection: (cardId: string, text: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [saved, setSaved] = useState(!!card.reflectionText);
  const [text, setText] = useState(card.reflectionText || "");

  const handleSaveReflection = () => {
    if (!draft.trim()) return;
    onSaveReflection(card.id, draft.trim());
    setText(draft.trim());
    setSaved(true);
    setDraft("");
  };

  return (
    <motion.div
      key={card.id}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      className="rounded-xl overflow-hidden group"
      style={{
        borderLeft: "4px solid #F06127",
        border: "1px solid #fde8dc",
        borderLeftWidth: "4px",
        borderLeftColor: "#F06127",
        background: "#fff9f7",
      }}
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 shrink-0" style={{ color: "#F06127" }} />
            <span className="text-xs font-semibold" style={{ color: "#F06127" }}>Activity recorded</span>
          </div>
          <button
            onClick={() => onDelete(card.id)}
            className="text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive transition-all shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        <p className="text-sm font-semibold text-foreground mb-0.5">{card.periodLabel}</p>
        <p className="text-sm text-muted-foreground leading-relaxed mb-4">{card.summary}</p>

        <div
          className="rounded-lg p-3.5"
          style={{ background: "rgba(240,97,39,0.06)", border: "1px solid rgba(240,97,39,0.15)" }}
        >
          <p className="text-xs font-medium text-foreground mb-2">
            Reflect on this…
          </p>
          <p className="text-xs italic mb-3" style={{ color: "#F06127" }}>
            "{card.reflectionPrompt}"
          </p>

          {saved ? (
            <p className="text-sm text-foreground leading-relaxed italic">{text}</p>
          ) : (
            <>
              <textarea
                value={draft}
                onChange={e => setDraft(e.target.value)}
                placeholder="Write freely. This is just for you…"
                rows={3}
                className="w-full p-2.5 rounded-md border border-border bg-white text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 resize-none"
                style={{ borderColor: "rgba(240,97,39,0.3)" }}
              />
              <div className="flex justify-end mt-2">
                <button
                  onClick={handleSaveReflection}
                  disabled={!draft.trim()}
                  className="px-4 py-1.5 rounded-md text-xs font-medium text-white transition-colors disabled:opacity-40"
                  style={{ background: "#F06127" }}
                >
                  Save reflection
                </button>
              </div>
            </>
          )}
        </div>

        <p className="text-[11px] text-muted-foreground mt-3">
          {new Date(card.createdAt).toLocaleDateString("en-GB", {
            weekday: "short", day: "numeric", month: "long", year: "numeric",
            hour: "2-digit", minute: "2-digit"
          })}
        </p>
      </div>
    </motion.div>
  );
}

export default function Journal() {
  const { isLoggedIn, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [entries, setEntries] = useState<FeedItem[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [prompt] = useState(randomPrompt);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const migrated = useRef(false);

  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

  async function fetchEntries() {
    setLoadingEntries(true);
    try {
      const res = await fetch(`${BASE}/api/journal`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json() as { entries: unknown[] };
      setEntries(
        data.entries
          .filter(isApiEntry)
          .map(apiEntryToFeedItem)
      );
    } catch {
      setEntries([]);
    } finally {
      setLoadingEntries(false);
    }
  }

  async function migrateLocalEntries() {
    if (migrated.current) return;
    migrated.current = true;
    const local = loadLocalEntries();
    if (local.length === 0) return;
    try {
      const res = await fetch(`${BASE}/api/journal/migrate`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: local }),
      });
      if (!res.ok) {
        migrated.current = false;
        return;
      }
      const data = await res.json() as MigrateResponse;
      if (typeof data.migrated === "number" && data.migrated >= 0) {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        migrated.current = false;
      }
    } catch {
      migrated.current = false;
    }
  }

  useEffect(() => {
    if (authLoading) return;
    if (isLoggedIn) {
      migrateLocalEntries().then(() => fetchEntries());
    } else {
      setEntries(loadLocalEntries());
    }
  }, [isLoggedIn, authLoading]);

  const handleAdd = async () => {
    if (!draft.trim()) return;
    const newEntry: JournalEntry = {
      id: Date.now().toString(),
      type: "entry",
      text: draft.trim(),
      prompt,
      createdAt: new Date().toISOString(),
    };

    if (isLoggedIn) {
      try {
        const res = await fetch(`${BASE}/api/journal`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "entry", text: draft.trim(), prompt }),
        });
        if (!res.ok) {
          toast({ title: "Could not save entry", description: "Please try again.", variant: "destructive" });
          return;
        }
        const saved = await res.json() as unknown;
        if (isApiEntry(saved)) {
          setEntries(prev => [apiEntryToFeedItem(saved), ...prev]);
        }
      } catch {
        toast({ title: "Could not save entry", description: "Check your connection and try again.", variant: "destructive" });
        return;
      }
    } else {
      const updated = [newEntry, ...entries];
      setEntries(updated);
      saveLocalEntries(updated);
    }

    setDraft("");
    setIsAdding(false);
  };

  const handleDelete = async (id: string) => {
    if (isLoggedIn) {
      const snapshot = entries;
      setEntries(prev => prev.filter(e => e.id !== id));
      try {
        const res = await fetch(`${BASE}/api/journal/${id}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (!res.ok) {
          setEntries(snapshot);
          toast({ title: "Could not delete entry", description: "Please try again.", variant: "destructive" });
        }
      } catch {
        setEntries(snapshot);
        toast({ title: "Could not delete entry", description: "Check your connection and try again.", variant: "destructive" });
      }
    } else {
      const updated = entries.filter(e => e.id !== id);
      setEntries(updated);
      saveLocalEntries(updated);
    }
  };

  const handleSaveReflection = async (cardId: string, reflectionText: string) => {
    if (isLoggedIn) {
      const snapshot = entries;
      setEntries(prev =>
        prev.map(item => item.id === cardId ? { ...item, reflectionText } : item)
      );
      try {
        const res = await fetch(`${BASE}/api/journal/${cardId}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reflectionText }),
        });
        if (!res.ok) {
          setEntries(snapshot);
          toast({ title: "Could not save reflection", description: "Please try again.", variant: "destructive" });
        }
      } catch {
        setEntries(snapshot);
        toast({ title: "Could not save reflection", description: "Check your connection and try again.", variant: "destructive" });
      }
    } else {
      const updated = entries.map(item =>
        item.id === cardId ? { ...item, reflectionText } : item
      );
      setEntries(updated);
      saveLocalEntries(updated);
    }
  };

  const isEmpty = entries.length === 0 && !isAdding;

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <BookOpen className="w-4 h-4 text-primary" />
            <h1 className="text-2xl font-display font-semibold text-foreground">My journal</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Reflect on what motivates you and what difference you're making. Private to you.
          </p>
        </div>
        <button
          onClick={() => setIsAdding(o => !o)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> New entry
        </button>
      </div>

      {!isLoggedIn && !authLoading && (
        <div className="mb-5 rounded-lg border border-border bg-muted/30 px-4 py-3 flex items-center gap-3">
          <LogIn className="w-4 h-4 text-muted-foreground shrink-0" />
          <p className="text-xs text-muted-foreground">
            Your entries are saved locally.{" "}
            <Link href="/login?from=/journal" className="text-primary underline underline-offset-2">Sign in</Link>{" "}
            to keep them safe across devices.
          </p>
        </div>
      )}

      <AnimatePresence>
        {isAdding && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-white border border-border rounded-xl p-5 mb-6"
          >
            <p className="text-sm font-medium text-foreground mb-1">Reflect on this…</p>
            <p className="text-sm text-primary italic mb-3">"{prompt}"</p>
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              placeholder="Write freely. This is just for you…"
              rows={4}
              className="w-full p-3 rounded-md border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none resize-none"
              autoFocus
            />
            <div className="flex items-center justify-between mt-3">
              <p className="text-xs text-muted-foreground">{draft.length} characters</p>
              <div className="flex gap-2">
                <button
                  onClick={() => { setIsAdding(false); setDraft(""); }}
                  className="px-3 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAdd}
                  disabled={!draft.trim()}
                  className="px-4 py-1.5 rounded-md bg-primary text-white text-xs font-medium hover:bg-primary/90 disabled:opacity-40 transition-colors"
                >
                  Save entry
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {loadingEntries ? (
        <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>
      ) : isEmpty ? (
        <div className="bg-white border border-dashed border-border rounded-xl py-14 text-center">
          <BookOpen className="w-7 h-7 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground mb-1">No journal entries yet</p>
          <p className="text-xs text-muted-foreground mb-5">
            Take a moment to reflect on what drives you and what you've achieved.
          </p>
          <button
            onClick={() => setIsAdding(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-white text-xs font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Write your first entry
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <AnimatePresence>
            {entries.map((item, i) => {
              if (item.type === "activity") {
                return (
                  <ActivityCardItem
                    key={item.id}
                    card={item}
                    onDelete={handleDelete}
                    onSaveReflection={handleSaveReflection}
                  />
                );
              }
              const entry = item as JournalEntry;
              return (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ delay: i * 0.05 }}
                  className="bg-white border border-border rounded-xl p-5 group"
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <p className="text-xs text-primary italic">"{entry.prompt}"</p>
                    <button
                      onClick={() => handleDelete(entry.id)}
                      className="text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive transition-all shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{entry.text}</p>
                  <p className="text-[11px] text-muted-foreground mt-3">
                    {new Date(entry.createdAt).toLocaleDateString("en-GB", {
                      weekday: "short", day: "numeric", month: "long", year: "numeric",
                      hour: "2-digit", minute: "2-digit"
                    })}
                  </p>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      <div className="mt-8">
        <Link href="/results" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to my impact
        </Link>
      </div>
    </div>
  );
}
