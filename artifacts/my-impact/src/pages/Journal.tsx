import { useState, useEffect, useRef, useMemo } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpen, Plus, Trash2, ArrowLeft, Sparkles, LogIn, Camera, Pencil, X, List, CalendarDays, Loader2, AlertCircle } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import Attachments from "@/components/Attachments";
import { TagEditor } from "@/components/TagEditor";
import { ReflectionPrompts, seedReflection } from "@/components/ReflectionPrompts";
import { SearchTagFilter } from "@/components/SearchTagFilter";
import { useUrlFilters } from "@/lib/useUrlFilters";
import { OrgPromptsSection } from "@/components/OrgPromptsSection";
import { Calendar } from "@/components/ui/calendar";

interface JournalEntry {
  id: string;
  type: "entry";
  text: string;
  prompt: string;
  tags: string[];
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
  tags: string[];
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
  tags?: string[];
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
  "What small moment from today do you want to remember?",
  "What are you proud of, even if nobody else noticed?",
  "What felt difficult, and what helped you through it?",
  "What would you tell someone thinking about getting involved?",
];

const STARTING_PROMPTS = [
  "What motivated you to get involved in this?",
  "What difference do you think you've made?",
  "What have you learned about yourself through this?",
  "What surprised you about getting involved?",
  "What small moment from today do you want to remember?",
  "What felt difficult, and what helped you through it?",
];

function randomPrompt() {
  return PROMPTS[Math.floor(Math.random() * PROMPTS.length)];
}

const STORAGE_KEY = "myimpact_journal";

function isActivityCard(item: unknown): item is Omit<ActivityCard, "tags"> & { tags?: string[] } {
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
        result.push({
          id: item.id,
          type: "activity",
          impactRecordId: item.impactRecordId,
          periodLabel: item.periodLabel,
          summary: item.summary,
          reflectionPrompt: item.reflectionPrompt,
          reflectionText: item.reflectionText,
          tags: Array.isArray(item.tags) ? item.tags.filter((t): t is string => typeof t === "string") : [],
          createdAt: item.createdAt,
        });
      } else if (isJournalEntryLike(item)) {
        const maybeTags = (item as { tags?: unknown }).tags;
        result.push({
          id: item.id,
          type: "entry",
          text: item.text,
          prompt: item.prompt,
          tags: Array.isArray(maybeTags) ? maybeTags.filter((t): t is string => typeof t === "string") : [],
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
  const tags = Array.isArray(e.tags) ? e.tags : [];
  if (e.type === "activity") {
    return {
      id: e.id,
      type: "activity",
      impactRecordId: e.impactRecordId ?? "",
      periodLabel: e.periodLabel ?? "",
      summary: e.summary ?? "",
      reflectionPrompt: e.reflectionPrompt ?? "",
      reflectionText: e.reflectionText ?? "",
      tags,
      createdAt: e.createdAt,
    };
  }
  return {
    id: e.id,
    type: "entry",
    text: e.text ?? "",
    prompt: e.prompt ?? "",
    tags,
    createdAt: e.createdAt,
  };
}

function PhotoBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      className="inline-flex items-center gap-0.5 text-[11px] font-medium text-muted-foreground/80 shrink-0"
      aria-label={`${count} ${count === 1 ? "photo" : "photos"} attached`}
    >
      <Camera className="w-3 h-3" aria-hidden="true" /> {count}
    </span>
  );
}

const IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"]);
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
};

async function uploadJournalPhoto(BASE: string, journalId: number, file: File) {
  const reportedType = file.type.toLowerCase().split(";")[0].trim();
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const mimeType = reportedType || IMAGE_MIME_BY_EXTENSION[extension] || "";
  if (!IMAGE_TYPES.has(mimeType)) throw new Error("Choose a JPEG, PNG, WebP, GIF, HEIC, or HEIF image.");
  if (file.size > MAX_PHOTO_BYTES) throw new Error("The photo must be 10 MB or smaller.");
  const urlRes = await fetch(`${BASE}/api/attachments/upload-url`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ journalId, kind: "photo", mimeType, byteSize: file.size }),
  });
  const urlBody = await urlRes.json().catch(() => ({})) as { uploadUrl?: string; storageKey?: string; error?: string };
  if (!urlRes.ok || !urlBody.uploadUrl || !urlBody.storageKey) throw new Error(urlBody.error || "Could not prepare the photo upload.");
  const putRes = await fetch(urlBody.uploadUrl, { method: "PUT", headers: { "Content-Type": mimeType }, body: file });
  if (!putRes.ok) throw new Error("The photo upload was interrupted.");
  const registerRes = await fetch(`${BASE}/api/attachments/register`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ journalId, kind: "photo", storageKey: urlBody.storageKey }),
  });
  const registerBody = await registerRes.json().catch(() => ({})) as { error?: string };
  if (!registerRes.ok) throw new Error(registerBody.error || "Could not attach the uploaded photo.");
}

function ActivityCardItem({
  card,
  onDelete,
  onSaveReflection,
  onChangeTags,
}: {
  card: ActivityCard;
  onDelete: (id: string) => void;
  onSaveReflection: (cardId: string, text: string) => Promise<boolean>;
  onChangeTags: (cardId: string, tags: string[]) => void | Promise<void>;
}) {
  const [draft, setDraft] = useState("");
  const [saved, setSaved] = useState(!!card.reflectionText);
  const [text, setText] = useState(card.reflectionText || "");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const cardDraftRef = useRef<HTMLTextAreaElement>(null);

  const handleSaveReflection = async () => {
    if (!draft.trim()) return;
    setSaving(true);
    const ok = await onSaveReflection(card.id, draft.trim());
    if (!ok) {
      setSaving(false);
      return;
    }
    setText(draft.trim());
    setSaved(true);
    setEditing(false);
    setDraft("");
    setSaving(false);
  };

  return (
    <motion.div
      key={card.id}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      className="rounded-xl overflow-hidden group"
      style={{
        border: "2px solid var(--brand-orange-bright)",
        background: "#fff9f7",
      }}
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--brand-orange-bright)" }} />
            <span className="text-xs font-semibold" style={{ color: "var(--brand-orange-bright)" }}>Activity recorded</span>
          </div>
          <button
            type="button"
            onClick={() => onDelete(card.id)}
            className="text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive transition-all shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="sr-only">Delete activity reflection</span>
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
          <p className="text-xs italic mb-3" style={{ color: "var(--brand-orange-bright)" }}>
            "{card.reflectionPrompt}"
          </p>

          {saved && !editing ? (
            <div>
              <p className="text-sm text-foreground leading-relaxed italic whitespace-pre-wrap">{text}</p>
              <button
                type="button"
                onClick={() => { setDraft(text); setEditing(true); }}
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <Pencil className="w-3 h-3" aria-hidden="true" /> Edit reflection
              </button>
            </div>
          ) : (
            <>
              <textarea
                ref={cardDraftRef}
                value={draft}
                onChange={e => setDraft(e.target.value)}
                placeholder="Write freely. This is just for you…"
                rows={3}
                className="w-full p-2.5 rounded-md border border-border bg-white text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 resize-none"
                style={{ borderColor: "rgba(240,97,39,0.3)" }}
              />
              <ReflectionPrompts
                text={draft}
                context={`Reflection prompt: ${card.reflectionPrompt}. Activity: ${card.summary}`}
                onPick={(q) => {
                  setDraft(prev => seedReflection(prev, q));
                  setTimeout(() => {
                    const el = cardDraftRef.current;
                    if (el) {
                      el.focus();
                      const len = el.value.length;
                      el.setSelectionRange(len, len);
                    }
                  }, 0);
                }}
              />
              <div className="flex justify-end gap-2 mt-2">
                {editing && (
                  <button
                    type="button"
                    onClick={() => { setDraft(""); setEditing(false); }}
                    className="px-3 py-1.5 rounded-md border border-border text-xs"
                  >
                    Cancel
                  </button>
                )}
                <button
                  onClick={handleSaveReflection}
                  disabled={!draft.trim() || saving}
                  className="px-4 py-1.5 rounded-md text-xs font-medium text-white transition-colors disabled:opacity-40"
                  style={{ background: "var(--brand-orange-bright)" }}
                >
                  {saving ? "Saving…" : editing ? "Save changes" : "Save reflection"}
                </button>
              </div>
            </>
          )}
        </div>

        <div className="mt-3 pt-3 border-t border-border/40">
          <TagEditor tags={card.tags} onChange={(t) => onChangeTags(card.id, t)} />
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

function JournalEntryItem({
  entry,
  photoCount,
  isLoggedIn,
  onDelete,
  onSave,
  onChangeTags,
  onPhotoCount,
}: {
  entry: JournalEntry;
  photoCount: number;
  isLoggedIn: boolean;
  onDelete: (id: string) => void;
  onSave: (id: string, changes: { text: string; prompt: string; tags: string[] }) => Promise<boolean>;
  onChangeTags: (id: string, tags: string[]) => void | Promise<void>;
  onPhotoCount: (id: string, count: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(entry.text);
  const [prompt, setPrompt] = useState(entry.prompt);
  const [tags, setTags] = useState(entry.tags);
  const [saving, setSaving] = useState(false);
  const numericId = parseInt(entry.id, 10);

  const cancel = () => {
    setText(entry.text);
    setPrompt(entry.prompt);
    setTags(entry.tags);
    setEditing(false);
  };

  const beginEditing = () => {
    setText(entry.text);
    setPrompt(entry.prompt);
    setTags(entry.tags);
    setEditing(true);
  };

  const save = async () => {
    if (!text.trim()) return;
    setSaving(true);
    const ok = await onSave(entry.id, { text: text.trim(), prompt: prompt.trim(), tags });
    setSaving(false);
    if (ok) setEditing(false);
  };

  return (
    <motion.div
      id={`entry-${entry.id}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      className="bg-white border border-border rounded-xl p-4 sm:p-5 group"
    >
      {editing ? (
        <>
          <label className="block text-xs font-medium text-muted-foreground mb-1" htmlFor={`prompt-${entry.id}`}>Reflection prompt</label>
          <input
            id={`prompt-${entry.id}`}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            maxLength={500}
            className="w-full rounded-md border border-border px-3 py-2 text-sm mb-3 focus:border-primary focus:ring-1 focus:ring-primary outline-none"
          />
          <label className="block text-xs font-medium text-muted-foreground mb-1" htmlFor={`text-${entry.id}`}>Journal entry</label>
          <textarea
            id={`text-${entry.id}`}
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={6}
            maxLength={20000}
            className="w-full rounded-md border border-border p-3 text-sm resize-y focus:border-primary focus:ring-1 focus:ring-primary outline-none"
          />
          <div className="mt-3"><TagEditor tags={tags} onChange={setTags} /></div>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={cancel} disabled={saving} className="px-3 py-1.5 rounded-md border border-border text-xs">Cancel</button>
            <button type="button" onClick={save} disabled={saving || !text.trim()} className="px-4 py-1.5 rounded-md bg-primary text-white text-xs font-medium disabled:opacity-40">
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-start justify-between gap-3 mb-2">
            <p className="text-xs text-primary italic">"{entry.prompt}"</p>
            <div className="flex items-center gap-2 shrink-0">
              <PhotoBadge count={photoCount} />
              <button type="button" onClick={beginEditing} className="text-muted-foreground opacity-70 hover:text-primary transition-colors" aria-label="Edit journal entry">
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button type="button" onClick={() => onDelete(entry.id)} className="text-muted-foreground opacity-70 hover:text-destructive transition-colors" aria-label="Delete journal entry">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{entry.text}</p>
          {isLoggedIn && Number.isFinite(numericId) && (
            <Attachments
              journalId={numericId}
              maxImages={1}
              label="Private photo"
              presentation="journal-feed"
              onChange={(attachments) => onPhotoCount(entry.id, attachments.filter((attachment) => attachment.kind === "photo").length)}
            />
          )}
          <div className="mt-3 pt-3 border-t border-border/40">
            <TagEditor tags={entry.tags} onChange={(nextTags) => onChangeTags(entry.id, nextTags)} />
          </div>
          <p className="text-[11px] text-muted-foreground mt-3">
            {new Date(entry.createdAt).toLocaleDateString("en-GB", {
              weekday: "short", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
            })}
          </p>
        </>
      )}
    </motion.div>
  );
}

export default function Journal() {
  const { isLoggedIn, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [entries, setEntries] = useState<FeedItem[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [prompt, setPrompt] = useState(randomPrompt);
  const [draftTags, setDraftTags] = useState<string[]>([]);
  const [draftPhoto, setDraftPhoto] = useState<File | null>(null);
  const [draftPhotoUrl, setDraftPhotoUrl] = useState<string | null>(null);
  const [savingEntry, setSavingEntry] = useState(false);
  const [photoUploadError, setPhotoUploadError] = useState("");
  const [savedDraftEntryId, setSavedDraftEntryId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const draftRef = useRef<HTMLTextAreaElement>(null);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [photoCounts, setPhotoCounts] = useState<Record<string, number>>({});
  const migrated = useRef(false);

  const { filters, setSearch, toggleTag, clearAll } = useUrlFilters();

  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

  useEffect(() => {
    if (!draftPhoto) {
      setDraftPhotoUrl(null);
      return;
    }
    const url = URL.createObjectURL(draftPhoto);
    setDraftPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [draftPhoto]);

  const resetComposer = () => {
    setDraft("");
    setDraftTags([]);
    setDraftPhoto(null);
    setPhotoUploadError("");
    setSavedDraftEntryId(null);
    setPrompt(randomPrompt());
    setIsAdding(false);
  };

  async function refreshPhotoCounts(items: FeedItem[]) {
    const ids: number[] = [];
    for (const it of items) {
      if (it.type !== "entry") continue;
      const n = parseInt(it.id, 10);
      if (Number.isFinite(n) && n > 0) ids.push(n);
    }
    if (ids.length === 0) {
      setPhotoCounts({});
      return;
    }
    try {
      const res = await fetch(
        `${BASE}/api/attachments/counts?journalIds=${encodeURIComponent(ids.join(","))}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("counts failed");
      const data = await res.json() as { journals: Record<string, number> };
      setPhotoCounts(data.journals ?? {});
    } catch {
      setPhotoCounts({});
    }
  }

  async function fetchEntries() {
    setLoadingEntries(true);
    try {
      const params = new URLSearchParams();
      if (filters.q) params.set("q", filters.q);
      if (filters.tags.length > 0) params.set("tags", filters.tags.join(","));
      const url = params.toString() ? `${BASE}/api/journal?${params.toString()}` : `${BASE}/api/journal`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json() as { entries: unknown[] };
      const items = data.entries
        .filter(isApiEntry)
        .map(apiEntryToFeedItem);
      setEntries(items);
      void refreshPhotoCounts(items);
    } catch {
      setEntries([]);
      setPhotoCounts({});
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn, authLoading, filters.q, filters.tags.join(",")]);

  useEffect(() => {
    if (loadingEntries || entries.length === 0) return;
    const hash = window.location.hash;
    if (!hash.startsWith("#entry-")) return;
    const id = hash.slice(1);
    const target = document.getElementById(id);
    if (!target) return;
    requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.style.transition = "box-shadow 0.6s ease";
      target.style.boxShadow = "0 0 0 3px color-mix(in srgb, var(--brand-orange-bright) 45%, transparent)";
      setTimeout(() => { target.style.boxShadow = ""; }, 1800);
    });
  }, [loadingEntries, entries.length]);

  const handleAdd = async () => {
    if (!draft.trim()) return;
    const newEntry: JournalEntry = {
      id: Date.now().toString(),
      type: "entry",
      text: draft.trim(),
      prompt,
      tags: draftTags,
      createdAt: new Date().toISOString(),
    };

    setSavingEntry(true);
    if (isLoggedIn) {
      try {
        let entryId = savedDraftEntryId;
        if (entryId == null) {
          const res = await fetch(`${BASE}/api/journal`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "entry", text: draft.trim(), prompt, tags: draftTags }),
          });
          if (!res.ok) {
            toast({ title: "Could not save entry", description: "Please try again.", variant: "destructive" });
            return;
          }
          const saved = await res.json() as unknown;
          if (!isApiEntry(saved)) throw new Error("Invalid saved entry");
          entryId = parseInt(saved.id, 10);
          setSavedDraftEntryId(entryId);
          setEntries(prev => [apiEntryToFeedItem(saved), ...prev.filter(item => item.id !== saved.id)]);
        } else {
          const updateRes = await fetch(`${BASE}/api/journal/${entryId}`, {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: draft.trim(), prompt, tags: draftTags }),
          });
          if (!updateRes.ok) throw new Error("Could not update the saved entry before retrying");
          const updated = await updateRes.json() as unknown;
          if (isApiEntry(updated)) {
            setEntries((current) => current.map((item) => item.id === updated.id ? apiEntryToFeedItem(updated) : item));
          }
        }
        if (draftPhoto && Number.isFinite(entryId)) {
          setPhotoUploadError("");
          try {
            await uploadJournalPhoto(BASE, entryId, draftPhoto);
            setPhotoCounts(prev => ({ ...prev, [String(entryId)]: 1 }));
          } catch (error) {
            const message = error instanceof Error ? error.message : "Could not upload the photo.";
            setPhotoUploadError(message);
            toast({ title: "Entry saved, but the photo needs retrying", description: message, variant: "destructive" });
            return;
          }
        }
      } catch {
        toast({ title: "Could not save entry", description: "Check your connection and try again.", variant: "destructive" });
        return;
      } finally {
        setSavingEntry(false);
      }
    } else {
      const updated = [newEntry, ...entries];
      setEntries(updated);
      saveLocalEntries(updated);
      setSavingEntry(false);
    }

    resetComposer();
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

  const handleChangeTags = async (entryId: string, nextTags: string[]) => {
    if (isLoggedIn) {
      const snapshot = entries;
      setEntries(prev => prev.map(item => item.id === entryId ? { ...item, tags: nextTags } : item));
      try {
        const res = await fetch(`${BASE}/api/journal/${entryId}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tags: nextTags }),
        });
        if (!res.ok) {
          setEntries(snapshot);
          toast({ title: "Could not update tags", description: "Please try again.", variant: "destructive" });
        }
      } catch {
        setEntries(snapshot);
        toast({ title: "Could not update tags", description: "Check your connection and try again.", variant: "destructive" });
      }
    } else {
      const updated = entries.map(item => item.id === entryId ? { ...item, tags: nextTags } : item);
      setEntries(updated);
      saveLocalEntries(updated);
    }
  };

  const handleSaveReflection = async (cardId: string, reflectionText: string): Promise<boolean> => {
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
          return false;
        }
      } catch {
        setEntries(snapshot);
        toast({ title: "Could not save reflection", description: "Check your connection and try again.", variant: "destructive" });
        return false;
      }
    } else {
      const updated = entries.map(item =>
        item.id === cardId ? { ...item, reflectionText } : item
      );
      setEntries(updated);
      saveLocalEntries(updated);
    }
    return true;
  };

  const handleSaveEntry = async (
    entryId: string,
    changes: { text: string; prompt: string; tags: string[] },
  ): Promise<boolean> => {
    if (isLoggedIn) {
      try {
        const res = await fetch(`${BASE}/api/journal/${entryId}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(changes),
        });
        if (!res.ok) throw new Error("save failed");
        const updated = await res.json() as unknown;
        if (!isApiEntry(updated)) throw new Error("invalid response");
        setEntries((current) => current.map((item) => item.id === entryId ? apiEntryToFeedItem(updated) : item));
        toast({ title: "Journal entry updated" });
        return true;
      } catch {
        toast({ title: "Could not update entry", description: "Your original entry is unchanged. Please try again.", variant: "destructive" });
        return false;
      }
    }
    const updated = entries.map((item) => item.id === entryId && item.type === "entry" ? { ...item, ...changes } : item);
    setEntries(updated);
    saveLocalEntries(updated);
    return true;
  };

  const hasFilter = !!filters.q || filters.tags.length > 0;
  const isEmpty = entries.length === 0 && !isAdding && !hasFilter;
  const isFilteredEmpty = entries.length === 0 && hasFilter && !loadingEntries;

  const availableTags = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries) for (const t of e.tags ?? []) set.add(t);
    for (const t of filters.tags) set.add(t);
    return Array.from(set).sort();
  }, [entries, filters.tags]);

  const dateKey = (value: string | Date) => {
    const date = typeof value === "string" ? new Date(value) : value;
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  };
  const journalDates = useMemo(() => entries.map((entry) => new Date(entry.createdAt)), [entries]);
  const visibleEntries = useMemo(() => {
    if (viewMode !== "calendar" || !selectedDate) return entries;
    const selectedKey = dateKey(selectedDate);
    return entries.filter((entry) => dateKey(entry.createdAt) === selectedKey);
  }, [entries, viewMode, selectedDate]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <OrgPromptsSection variant="compact" />
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
            <fieldset className="mb-4">
              <legend className="text-sm font-medium text-foreground mb-2">Choose a starting point</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {STARTING_PROMPTS.map((choice) => (
                  <button
                    key={choice}
                    type="button"
                    aria-pressed={prompt === choice}
                    onClick={() => setPrompt(choice)}
                    className={`rounded-lg border px-3 py-2 text-left text-xs leading-snug transition-colors ${
                      prompt === choice ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-primary/40"
                    }`}
                  >
                    {choice}
                  </button>
                ))}
              </div>
            </fieldset>
            <label className="block text-sm font-medium text-foreground mb-1" htmlFor="new-journal-entry">Your reflection</label>
            <p className="text-sm text-primary italic mb-3">"{prompt}"</p>
            <textarea
              id="new-journal-entry"
              ref={draftRef}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              placeholder="Write freely. This is just for you…"
              rows={4}
              className="w-full p-3 rounded-md border border-border bg-white text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none resize-none"
              autoFocus
            />
            <ReflectionPrompts
              text={draft}
              context={`Reflection prompt: ${prompt}`}
              onPick={(q) => {
                setDraft(prev => seedReflection(prev, q));
                setTimeout(() => {
                  const el = draftRef.current;
                  if (el) {
                    el.focus();
                    const len = el.value.length;
                    el.setSelectionRange(len, len);
                  }
                }, 0);
              }}
            />
            <div className="mt-4 rounded-lg border border-border/70 p-3">
              <p className="text-xs font-medium text-foreground mb-2">Tags</p>
              <TagEditor tags={draftTags} onChange={setDraftTags} placeholder="Add context…" size="md" />
            </div>
            {isLoggedIn && (
              <div className="mt-3 rounded-lg border border-border/70 p-3">
                <p className="text-xs font-medium text-foreground mb-2">Private photo <span className="font-normal text-muted-foreground">(optional)</span></p>
                {draftPhotoUrl ? (
                  <div className="flex items-start gap-3">
                    <img src={draftPhotoUrl} alt="Selected journal photo preview" className="h-24 w-24 rounded-lg border border-border object-cover" />
                    <div className="flex flex-wrap gap-2">
                      <label className="cursor-pointer rounded-md border border-border px-3 py-2 text-xs font-medium hover:bg-muted/30">
                        Replace photo
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif"
                          className="sr-only"
                          onChange={(event) => {
                            const file = event.target.files?.[0] ?? null;
                            setDraftPhoto(file);
                            setPhotoUploadError("");
                            event.target.value = "";
                          }}
                        />
                      </label>
                      <button type="button" onClick={() => { setDraftPhoto(null); setPhotoUploadError(""); }} className="rounded-md border border-border px-3 py-2 text-xs text-destructive">
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium hover:bg-muted/30">
                    <Camera className="w-3.5 h-3.5" aria-hidden="true" /> Select photo
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif"
                      className="sr-only"
                      onChange={(event) => {
                        setDraftPhoto(event.target.files?.[0] ?? null);
                        setPhotoUploadError("");
                        event.target.value = "";
                      }}
                    />
                  </label>
                )}
                {photoUploadError && (
                  <p role="alert" className="mt-2 flex items-start gap-1.5 text-xs text-destructive">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {photoUploadError} Your entry is saved; choose Save entry to retry.
                  </p>
                )}
              </div>
            )}
            <div className="flex items-center justify-between mt-3">
              <p className="text-xs text-muted-foreground">{draft.length} characters</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={resetComposer}
                  disabled={savingEntry}
                  className="px-3 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAdd}
                  disabled={!draft.trim() || savingEntry}
                  className="px-4 py-1.5 rounded-md bg-primary text-white text-xs font-medium hover:bg-primary/90 disabled:opacity-40 transition-colors"
                >
                  {savingEntry ? <><Loader2 className="mr-1 inline h-3 w-3 animate-spin" />Saving…</> : photoUploadError ? "Retry photo" : "Save entry"}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!isEmpty && (
        <>
          <SearchTagFilter
            searchValue={filters.q}
            onSearchChange={setSearch}
            searchPlaceholder="Search entries, reflections, or tags…"
            availableTags={availableTags}
            selectedTags={filters.tags}
            onToggleTag={toggleTag}
            onClearAll={clearAll}
          />
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-lg border border-border bg-white p-1" role="group" aria-label="Journal view">
              <button
                type="button"
                onClick={() => { setViewMode("list"); setSelectedDate(undefined); }}
                aria-pressed={viewMode === "list"}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium ${viewMode === "list" ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground"}`}
              >
                <List className="h-3.5 w-3.5" aria-hidden="true" /> List
              </button>
              <button
                type="button"
                onClick={() => setViewMode("calendar")}
                aria-pressed={viewMode === "calendar"}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium ${viewMode === "calendar" ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground"}`}
              >
                <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" /> Calendar
              </button>
            </div>
            {viewMode === "calendar" && selectedDate && (
              <button type="button" onClick={() => setSelectedDate(undefined)} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                <X className="h-3 w-3" aria-hidden="true" /> Show all dates
              </button>
            )}
          </div>
          {viewMode === "calendar" && (
            <div className="mb-6 rounded-xl border border-border bg-white p-2 sm:p-4">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                modifiers={{ hasEntry: journalDates }}
                modifiersClassNames={{ hasEntry: "after:absolute after:bottom-1 after:h-1 after:w-1 after:rounded-full after:bg-primary" }}
                fullWidth
                className="w-full p-1 [--cell-size:2.25rem] sm:p-3 sm:[--cell-size:2.75rem]"
                aria-label="Browse journal entries by date"
              />
              <p className="mt-2 text-center text-xs text-muted-foreground">Dates with a dot contain journal entries.</p>
            </div>
          )}
        </>
      )}

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
      ) : isFilteredEmpty ? (
        <div className="bg-white border border-dashed border-border rounded-xl py-10 text-center">
          <p className="text-sm font-medium text-foreground mb-1">No matches</p>
          <p className="text-xs text-muted-foreground mb-4">
            No entries match your search or selected tags.
          </p>
          <button
            onClick={clearAll}
            className="text-xs text-primary underline underline-offset-2 hover:text-primary/80"
          >
            Reset filters
          </button>
        </div>
      ) : viewMode === "calendar" && selectedDate && visibleEntries.length === 0 ? (
        <div className="bg-white border border-dashed border-border rounded-xl py-10 text-center">
          <CalendarDays className="mx-auto mb-2 h-6 w-6 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">No journal items on this date</p>
          <p className="mt-1 text-xs text-muted-foreground">{selectedDate.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
        </div>
      ) : (
        <div className="space-y-5">
          <AnimatePresence>
            {visibleEntries.map((item) => {
              if (item.type === "activity") {
                return (
                  <div key={item.id} id={`entry-${item.id}`}>
                    <ActivityCardItem
                      card={item}
                      onDelete={handleDelete}
                      onSaveReflection={handleSaveReflection}
                      onChangeTags={handleChangeTags}
                    />
                  </div>
                );
              }
              const entry = item as JournalEntry;
              return (
                <JournalEntryItem
                  key={entry.id}
                  entry={entry}
                  photoCount={photoCounts[entry.id] ?? 0}
                  isLoggedIn={isLoggedIn}
                  onDelete={handleDelete}
                  onSave={handleSaveEntry}
                  onChangeTags={handleChangeTags}
                  onPhotoCount={(id, count) => setPhotoCounts((current) => current[id] === count ? current : { ...current, [id]: count })}
                />
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
