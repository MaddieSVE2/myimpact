import { useEffect, useRef, useState } from "react";
import { MapPin, Globe, Map, Loader2, X, Check } from "lucide-react";

const UK_POSTCODE_RE = /^[A-Z]{1,2}[0-9][0-9A-Z]?\s?[0-9][A-Z]{2}$/i;
const UK_OUTWARD_RE = /^[A-Z]{1,2}[0-9][0-9A-Z]?$/i;

/**
 * Structured activity location matching the server's `location` field on
 * /impact/save (locationJson). `null` means "not provided" — location is
 * always optional and is never inferred from the user's home address.
 */
export interface ActivityLocationValue {
  mode: "in_person" | "online" | "multiple";
  label?: string | null;
  postcode?: string | null;
  townCity?: string | null;
  lat?: number | null;
  lng?: number | null;
  localAuthority?: string | null;
  region?: string | null;
  country?: string | null;
}

export function describeLocation(loc: ActivityLocationValue | null | undefined): string | null {
  if (!loc) return null;
  if (loc.mode === "online") return "Online / remote";
  if (loc.mode === "multiple") return "Multiple locations";
  return loc.label || loc.townCity || loc.postcode || loc.region || null;
}

/**
 * Geocode a UK postcode (full or outward-only) via postcodes.io. Returns null
 * for anything that isn't a valid postcode — the caller then keeps the raw
 * text as a plain label (venue / town name).
 */
async function geocode(raw: string): Promise<Partial<ActivityLocationValue> | null> {
  const trimmed = raw.trim();
  const compact = trimmed.replace(/\s+/g, "").toUpperCase();
  try {
    if (UK_POSTCODE_RE.test(trimmed)) {
      const res = await fetch(`https://api.postcodes.io/postcodes/${compact}`);
      if (!res.ok) return null;
      const json = await res.json();
      if (json.status !== 200 || !json.result) return null;
      const r = json.result;
      return {
        postcode: r.postcode as string,
        townCity: (r.admin_district ?? r.parish ?? "") as string,
        lat: r.latitude as number,
        lng: r.longitude as number,
        localAuthority: (r.admin_district ?? "") as string,
        region: (r.region ?? r.nuts ?? "") as string,
        country: (r.country ?? "") as string,
      };
    }
    if (UK_OUTWARD_RE.test(compact)) {
      const res = await fetch(`https://api.postcodes.io/outcodes/${compact}`);
      if (!res.ok) return null;
      const json = await res.json();
      if (json.status !== 200 || !json.result) return null;
      const r = json.result;
      return {
        postcode: compact,
        townCity: (r.admin_district?.[0] ?? "") as string,
        lat: r.latitude as number,
        lng: r.longitude as number,
        localAuthority: (r.admin_district?.[0] ?? "") as string,
        country: (r.country?.[0] ?? "") as string,
      };
    }
  } catch {
    /* offline / blocked — fall through to plain label */
  }
  return null;
}

/** A single town/area suggestion from the postcodes.io /places search. */
interface PlaceSuggestion {
  id: string;
  name: string;
  /** e.g. "City", "Village", "Suburban Area" */
  localType: string;
  localAuthority: string;
  region: string;
  country: string;
  lat: number;
  lng: number;
}

/**
 * Search town/area-level place suggestions via postcodes.io /places. Returns
 * [] on any failure — suggestions are strictly additive; free text always
 * still works as a plain label.
 */
async function searchPlaces(query: string, signal: AbortSignal): Promise<PlaceSuggestion[]> {
  try {
    const res = await fetch(
      `https://api.postcodes.io/places?q=${encodeURIComponent(query)}&limit=6`,
      { signal }
    );
    if (!res.ok) return [];
    const json = await res.json();
    if (json.status !== 200 || !Array.isArray(json.result)) return [];
    return (json.result as Array<Record<string, unknown>>)
      .filter((r) => typeof r.latitude === "number" && typeof r.longitude === "number" && r.name_1)
      .map((r) => ({
        id: String(r.code ?? `${r.name_1}-${r.latitude}`),
        name: String(r.name_1),
        localType: typeof r.local_type === "string" ? r.local_type : "",
        localAuthority: String(r.county_unitary ?? r.district_borough ?? ""),
        region: String(r.region ?? r.country ?? ""),
        country: String(r.country ?? ""),
        lat: r.latitude as number,
        lng: r.longitude as number,
      }));
  } catch {
    return [];
  }
}

function suggestionContext(s: PlaceSuggestion): string {
  const parts = [s.localAuthority, s.region].filter((p) => p && p !== s.name);
  return [...new Set(parts)].join(", ");
}

interface LocationPickerProps {
  value: ActivityLocationValue | null;
  onChange: (value: ActivityLocationValue | null) => void;
  /** The user's usual/previous activity location, offered for one-tap reuse. */
  previous?: ActivityLocationValue | null;
}

/**
 * "Where did this happen?" input for per-occurrence logging. Optional.
 * Offers: previous-location one-tap reuse, free search (venue, postcode or
 * town — geocoded to structured data when it looks like a UK postcode),
 * "Online / remote" and "Multiple locations".
 */
export function LocationPicker({ value, onChange, previous }: LocationPickerProps) {
  const [text, setText] = useState("");
  const [looking, setLooking] = useState(false);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [highlighted, setHighlighted] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  // Live place suggestions (town/area level) while typing. Skipped for
  // postcode-shaped input — those geocode directly on "Use"/Enter as before.
  useEffect(() => {
    const raw = text.trim();
    const compact = raw.replace(/\s+/g, "");
    if (raw.length < 2 || UK_POSTCODE_RE.test(raw) || UK_OUTWARD_RE.test(compact)) {
      setSuggestions([]);
      setHighlighted(-1);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const results = await searchPlaces(raw, controller.signal);
      if (!controller.signal.aborted) {
        setSuggestions(results);
        setHighlighted(-1);
      }
    }, 250);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [text]);

  // Close the suggestion list when clicking outside the picker.
  useEffect(() => {
    if (suggestions.length === 0) return;
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setSuggestions([]);
        setHighlighted(-1);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [suggestions.length]);

  const applySuggestion = (s: PlaceSuggestion) => {
    onChange({
      mode: "in_person",
      label: s.name,
      townCity: s.name,
      lat: s.lat,
      lng: s.lng,
      localAuthority: s.localAuthority || null,
      region: s.region || null,
      country: s.country || null,
    });
    setText("");
    setSuggestions([]);
    setHighlighted(-1);
  };

  const applyText = async () => {
    const raw = text.trim();
    if (!raw) return;
    setSuggestions([]);
    setHighlighted(-1);
    setLooking(true);
    const geo = await geocode(raw);
    setLooking(false);
    onChange({ mode: "in_person", label: raw, ...(geo ?? {}) });
    setText("");
  };

  const chip = (active: boolean) =>
    `inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium border transition-colors min-h-[36px] ${
      active ? "text-white border-transparent" : "bg-white text-foreground border-border hover:border-foreground/40"
    }`;
  const chipStyle = (active: boolean) => (active ? { background: "var(--brand-orange-bright)" } : undefined);

  const previousLabel = describeLocation(previous);
  const isPreviousSelected =
    !!value && !!previous && describeLocation(value) === previousLabel && value.mode === previous.mode;
  const inPersonSelected = value?.mode === "in_person" && !isPreviousSelected;

  return (
    <div data-testid="quick-log-location">
      {value ? (
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold text-white"
            style={{ background: "var(--brand-orange-bright)" }}
            data-testid="quick-log-location-selected"
          >
            {value.mode === "online" ? <Globe className="w-3.5 h-3.5" /> : value.mode === "multiple" ? <Map className="w-3.5 h-3.5" /> : <MapPin className="w-3.5 h-3.5" />}
            {describeLocation(value) ?? "Location set"}
            <button
              type="button"
              onClick={() => onChange(null)}
              aria-label="Clear location"
              className="ml-0.5 opacity-80 hover:opacity-100"
              data-testid="quick-log-location-clear"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </span>
          {value.mode === "in_person" && value.postcode && (
            <span className="text-[11px] text-muted-foreground">
              Only the general area is shared with organisations you belong to.
            </span>
          )}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mb-3">
            {previous && previousLabel && (
              <button
                type="button"
                onClick={() => onChange({ ...previous })}
                className={chip(isPreviousSelected)}
                style={chipStyle(isPreviousSelected)}
                data-testid="quick-log-location-previous"
              >
                <MapPin className="w-3.5 h-3.5" /> {previousLabel}
                <span className="text-[10px] opacity-70">(usual)</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onChange({ mode: "online" })}
              className={chip(false)}
              data-testid="quick-log-location-online"
            >
              <Globe className="w-3.5 h-3.5" /> Online / remote
            </button>
            <button
              type="button"
              onClick={() => onChange({ mode: "multiple" })}
              className={chip(false)}
              data-testid="quick-log-location-multiple"
            >
              <Map className="w-3.5 h-3.5" /> Multiple locations
            </button>
          </div>
          <div className="flex items-center gap-2" ref={containerRef}>
            <div className="relative flex-1">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
              <input
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown" && suggestions.length > 0) {
                    e.preventDefault();
                    setHighlighted((h) => (h + 1) % suggestions.length);
                  } else if (e.key === "ArrowUp" && suggestions.length > 0) {
                    e.preventDefault();
                    setHighlighted((h) => (h <= 0 ? suggestions.length - 1 : h - 1));
                  } else if (e.key === "Escape") {
                    setSuggestions([]);
                    setHighlighted(-1);
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    if (highlighted >= 0 && suggestions[highlighted]) {
                      applySuggestion(suggestions[highlighted]);
                    } else {
                      void applyText();
                    }
                  }
                }}
                role="combobox"
                aria-expanded={suggestions.length > 0}
                aria-autocomplete="list"
                aria-controls="quick-log-location-suggestions"
                placeholder="Venue, postcode or town…"
                className="w-full pl-9 pr-3 py-2.5 rounded-md bg-white border border-border text-sm focus:border-primary outline-none"
                data-testid="quick-log-location-input"
              />
              {suggestions.length > 0 && (
                <ul
                  id="quick-log-location-suggestions"
                  role="listbox"
                  className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-border rounded-md shadow-lg overflow-hidden"
                  data-testid="quick-log-location-suggestions"
                >
                  {suggestions.map((s, i) => {
                    const context = suggestionContext(s);
                    return (
                      <li key={s.id} role="option" aria-selected={i === highlighted}>
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => applySuggestion(s)}
                          onMouseEnter={() => setHighlighted(i)}
                          className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm ${
                            i === highlighted ? "bg-muted" : "bg-white"
                          }`}
                          data-testid={`quick-log-location-suggestion-${i}`}
                        >
                          <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
                          <span className="truncate">
                            <span className="font-medium">{s.name}</span>
                            {context && <span className="text-muted-foreground"> — {context}</span>}
                          </span>
                          {s.localType && (
                            <span className="ml-auto text-[10px] text-muted-foreground shrink-0">{s.localType}</span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <button
              type="button"
              onClick={() => void applyText()}
              disabled={!text.trim() || looking}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-md border border-border text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
              data-testid="quick-log-location-set"
            >
              {looking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Use
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            Optional — helps you remember where it happened. We never fill this in from your home address.
          </p>
        </>
      )}
    </div>
  );
}

export default LocationPicker;
