import { useEffect, useRef, useState } from "react";
import { MapPin, Globe, Map, Loader2, X, Check } from "lucide-react";
import { PlaceSuggestionList, usePlaceSuggestions } from "@/components/PlaceSuggestions";
import {
  exactMatches,
  isFullPostcode,
  isPostcodeLike,
  lookupPostcode,
  resolvePlace,
  searchPlaces,
  type PlaceSuggestion,
} from "@/lib/place-search";

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
 * Geocode a UK postcode (full or outward-only). Returns null for anything that
 * isn't a valid postcode — the caller then keeps the raw text as a plain label
 * (venue / town name). An outward code stays outward: it's what the person
 * chose to give.
 */
async function geocode(raw: string): Promise<Partial<ActivityLocationValue> | null> {
  const result = await lookupPostcode(raw);
  if (result.status !== "found") return null;
  const { area } = result;
  return {
    postcode: isFullPostcode(raw) ? area.postcode : area.outwardCode,
    townCity: area.adminDistrict,
    lat: area.lat,
    lng: area.lng,
    localAuthority: area.adminDistrict,
    region: area.region,
    country: area.country,
  };
}

interface LocationPickerProps {
  value: ActivityLocationValue | null;
  onChange: (value: ActivityLocationValue | null) => void;
  /** The user's usual/previous activity location, offered for one-tap reuse. */
  previous?: ActivityLocationValue | null;
}

/**
 * "Where did this happen?" input for per-occurrence logging. Optional.
 * Offers: previous-location one-tap reuse, free search (a venue stays a plain
 * label; a postcode or a town name resolves to structured data, so the
 * organisation can report on it), "Online / remote" and "Multiple locations".
 */
export function LocationPicker({ value, onChange, previous }: LocationPickerProps) {
  const [text, setText] = useState("");
  const [looking, setLooking] = useState(false);
  const [needsPick, setNeedsPick] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { suggestions, highlighted, setHighlighted, moveHighlight, show, clear } = usePlaceSuggestions(text);

  // Close the suggestion list when clicking outside the picker.
  useEffect(() => {
    if (suggestions.length === 0) return;
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) clear();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [suggestions.length, clear]);

  // The nearest postcode supplies the local authority and region, so a town
  // reports the same way as a postcode in the organisation's breakdowns. Its
  // outward code is all that's kept: nobody typed a full postcode here.
  const applySuggestion = async (s: PlaceSuggestion) => {
    clear();
    setNeedsPick(false);
    setLooking(true);
    const area = await resolvePlace(s);
    setLooking(false);
    onChange({
      mode: "in_person",
      label: s.name,
      townCity: s.name,
      postcode: area?.outwardCode || s.outwardCode || null,
      lat: s.lat,
      lng: s.lng,
      localAuthority: area?.adminDistrict || s.localAuthority || null,
      region: area?.region || s.region || null,
      country: area?.country || s.country || null,
    });
    setText("");
  };

  const applyText = async () => {
    const raw = text.trim();
    if (!raw) return;
    clear();
    setNeedsPick(false);
    setLooking(true);
    if (isPostcodeLike(raw)) {
      const geo = await geocode(raw);
      setLooking(false);
      onChange({ mode: "in_person", label: raw, ...(geo ?? {}) });
      setText("");
      return;
    }
    const places = exactMatches(raw, await searchPlaces(raw));
    setLooking(false);
    if (places.length === 1) {
      await applySuggestion(places[0]);
    } else if (places.length > 1) {
      show(places);
      setNeedsPick(true);
    } else {
      onChange({ mode: "in_person", label: raw });
      setText("");
    }
  };

  const chip = (active: boolean) =>
    `inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium border transition-colors min-h-[36px] ${
      active ? "text-white border-transparent" : "bg-white text-foreground border-border hover:border-foreground/40"
    }`;
  const chipStyle = (active: boolean) => (active ? { background: "var(--brand-orange)" } : undefined);

  const previousLabel = describeLocation(previous);
  const isPreviousSelected =
    !!value && !!previous && describeLocation(value) === previousLabel && value.mode === previous.mode;

  return (
    <div data-testid="quick-log-location">
      {value ? (
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold text-white"
            style={{ background: "var(--brand-orange)" }}
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
                onChange={(e) => {
                  setText(e.target.value);
                  setNeedsPick(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown" && suggestions.length > 0) {
                    e.preventDefault();
                    moveHighlight(1);
                  } else if (e.key === "ArrowUp" && suggestions.length > 0) {
                    e.preventDefault();
                    moveHighlight(-1);
                  } else if (e.key === "Escape") {
                    clear();
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    if (highlighted >= 0 && suggestions[highlighted]) {
                      void applySuggestion(suggestions[highlighted]);
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
                <PlaceSuggestionList
                  id="quick-log-location-suggestions"
                  testId="quick-log-location-suggestions"
                  suggestions={suggestions}
                  highlighted={highlighted}
                  onHighlight={setHighlighted}
                  onPick={(place) => void applySuggestion(place)}
                />
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
          {needsPick && (
            <p className="text-[11px] text-red-600 mt-2" role="status" data-testid="quick-log-location-pick">
              There's more than one place called {text.trim()}. Choose the right one from the list.
            </p>
          )}
          <p className="text-[11px] text-muted-foreground mt-2">
            Optional — helps you remember where it happened. We never fill this in from your home address.
          </p>
        </>
      )}
    </div>
  );
}

export default LocationPicker;
