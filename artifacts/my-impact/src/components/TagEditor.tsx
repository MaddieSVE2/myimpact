import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import { Tag as TagIcon, X, Plus } from "lucide-react";

interface TagEditorProps {
  tags: string[];
  onChange: (tags: string[]) => void | Promise<void>;
  placeholder?: string;
  size?: "sm" | "md";
  className?: string;
}

function normalise(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, "-").slice(0, 32);
}

export function TagEditor({
  tags,
  onChange,
  placeholder = "Add tag…",
  size = "sm",
  className = "",
}: TagEditorProps) {
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  const commit = async () => {
    const value = normalise(draft);
    if (!value) {
      setDraft("");
      setAdding(false);
      return;
    }
    if (tags.includes(value)) {
      setDraft("");
      return;
    }
    await onChange([...tags, value]);
    setDraft("");
  };

  const remove = async (tag: string) => {
    await onChange(tags.filter((t) => t !== tag));
  };

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      void commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setDraft("");
      setAdding(false);
    } else if (e.key === "Backspace" && !draft && tags.length > 0) {
      e.preventDefault();
      void remove(tags[tags.length - 1]);
    }
  };

  const chipPad = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs";

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      <TagIcon className="w-3 h-3 text-muted-foreground/60 shrink-0" aria-hidden="true" />
      {tags.map((tag) => (
        <span
          key={tag}
          className={`inline-flex items-center gap-1 rounded-full bg-muted/40 text-foreground border border-border ${chipPad}`}
        >
          <span className="font-medium">#{tag}</span>
          <button
            type="button"
            onClick={() => void remove(tag)}
            className="text-muted-foreground hover:text-destructive rounded-full p-0.5"
            aria-label={`Remove tag ${tag}`}
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </span>
      ))}
      {adding ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKey}
          onBlur={() => void commit()}
          placeholder={placeholder}
          className={`${chipPad} rounded-full border border-primary/30 bg-white outline-none focus:ring-1 focus:ring-primary/40 w-24`}
          maxLength={32}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className={`inline-flex items-center gap-1 rounded-full border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-foreground/40 ${chipPad}`}
        >
          <Plus className="w-2.5 h-2.5" />
          <span>tag</span>
        </button>
      )}
    </div>
  );
}
