import { useState, useEffect } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpen, Plus, Trash2, ArrowLeft } from "lucide-react";

interface JournalEntry {
  id: string;
  text: string;
  prompt: string;
  createdAt: string;
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

function loadEntries(): JournalEntry[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveEntries(entries: JournalEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export default function Journal() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [prompt] = useState(randomPrompt);

  useEffect(() => {
    setEntries(loadEntries());
  }, []);

  const handleAdd = () => {
    if (!draft.trim()) return;
    const entry: JournalEntry = {
      id: Date.now().toString(),
      text: draft.trim(),
      prompt,
      createdAt: new Date().toISOString(),
    };
    const updated = [entry, ...entries];
    setEntries(updated);
    saveEntries(updated);
    setDraft("");
    setIsAdding(false);
  };

  const handleDelete = (id: string) => {
    const updated = entries.filter(e => e.id !== id);
    setEntries(updated);
    saveEntries(updated);
  };

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

      {/* New entry form */}
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
              placeholder="Write freely — this is just for you…"
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

      {entries.length === 0 && !isAdding ? (
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
            {entries.map((entry, i) => (
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
            ))}
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
