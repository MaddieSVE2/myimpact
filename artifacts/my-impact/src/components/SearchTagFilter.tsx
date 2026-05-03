import { Search, X } from "lucide-react";

interface SearchTagFilterProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  availableTags: string[];
  selectedTags: string[];
  onToggleTag: (tag: string) => void;
  onClearAll: () => void;
}

export function SearchTagFilter({
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search…",
  availableTags,
  selectedTags,
  onToggleTag,
  onClearAll,
}: SearchTagFilterProps) {
  const hasActive = !!searchValue || selectedTags.length > 0;

  return (
    <div className="mb-5 space-y-3">
      <div className="relative">
        <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="search"
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full rounded-md border border-border bg-white pl-9 pr-9 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/40"
          aria-label="Search"
        />
        {searchValue && (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {availableTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mr-1">
            Tags
          </span>
          {availableTags.map((tag) => {
            const active = selectedTags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => onToggleTag(tag)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                  active
                    ? "bg-primary text-white border-primary"
                    : "bg-white text-muted-foreground border-border hover:border-foreground/40 hover:text-foreground"
                }`}
                aria-pressed={active}
              >
                #{tag}
              </button>
            );
          })}
          {hasActive && (
            <button
              type="button"
              onClick={onClearAll}
              className="px-2 py-1 rounded-full text-[11px] font-medium text-muted-foreground hover:text-destructive"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}
