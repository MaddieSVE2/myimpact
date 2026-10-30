import { useCallback, useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { isPostcodeLike, searchPlaces, type PlaceSuggestion } from "@/lib/place-search";

/**
 * Live place suggestions (town/area level) while typing. Skipped for
 * postcode-shaped input, which is looked up directly.
 */
export function usePlaceSuggestions(query: string) {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [highlighted, setHighlighted] = useState(-1);
  const [noMatchesFor, setNoMatchesFor] = useState<string | null>(null);

  const show = useCallback((places: PlaceSuggestion[]) => {
    setSuggestions(places);
    setHighlighted(-1);
  }, []);
  const clear = useCallback(() => show([]), [show]);

  useEffect(() => {
    const raw = query.trim();
    setNoMatchesFor(null);
    if (raw.length < 2 || isPostcodeLike(raw)) {
      clear();
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const results = await searchPlaces(raw, controller.signal);
      if (!controller.signal.aborted) {
        show(results);
        setNoMatchesFor(results.length === 0 ? raw : null);
      }
    }, 250);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, clear, show]);

  const moveHighlight = useCallback(
    (step: 1 | -1) => {
      setHighlighted((h) => {
        if (suggestions.length === 0) return -1;
        if (step === 1) return (h + 1) % suggestions.length;
        return h <= 0 ? suggestions.length - 1 : h - 1;
      });
    },
    [suggestions.length],
  );

  return {
    suggestions,
    highlighted,
    setHighlighted,
    moveHighlight,
    show,
    clear,
    noMatches: noMatchesFor !== null && noMatchesFor === query.trim(),
  };
}

function suggestionContext(s: PlaceSuggestion): string {
  const parts = [s.localAuthority, s.region].filter((p) => p && p !== s.name);
  return [...new Set(parts)].join(", ");
}

interface PlaceSuggestionListProps {
  id: string;
  testId: string;
  suggestions: PlaceSuggestion[];
  highlighted: number;
  onHighlight: (index: number) => void;
  onPick: (place: PlaceSuggestion) => void;
}

export function PlaceSuggestionList({
  id,
  testId,
  suggestions,
  highlighted,
  onHighlight,
  onPick,
}: PlaceSuggestionListProps) {
  // The box can sit at the very bottom of the screen, which would open the
  // list out of sight.
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    listRef.current?.scrollIntoView({ block: "nearest" });
  }, []);

  return (
    <ul
      ref={listRef}
      id={id}
      role="listbox"
      onMouseDown={(e) => e.preventDefault()}
      className="absolute z-20 left-0 right-0 top-full mt-1 max-h-64 overflow-y-auto bg-white border border-border rounded-md shadow-lg"
      data-testid={testId}
    >
      {suggestions.map((s, i) => {
        const context = suggestionContext(s);
        return (
          <li key={s.id} role="option" aria-selected={i === highlighted}>
            <button
              type="button"
              onClick={() => onPick(s)}
              onMouseEnter={() => onHighlight(i)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm ${
                i === highlighted ? "bg-muted" : "bg-white"
              }`}
              data-testid={`${testId.replace(/s$/, "")}-${i}`}
            >
              <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
              <span className="truncate">
                <span className="font-medium">{s.name}</span>
                {context && <span className="text-muted-foreground">, {context}</span>}
              </span>
              {s.localType && (
                <span className="ml-auto text-[10px] text-muted-foreground shrink-0">{s.localType}</span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
