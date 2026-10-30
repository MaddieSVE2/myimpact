import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { CheckCircle, Loader2, MapPin } from "lucide-react";
import { useT } from "@/i18n";
import { PlaceSuggestionList, usePlaceSuggestions } from "@/components/PlaceSuggestions";
import {
  formatPostcode,
  isFullPostcode,
  isPostcodeLike,
  lookupPostcode,
  resolvePlace,
  searchPlaces,
  soleMatch,
  type HomeLocation,
  type PlaceSuggestion,
} from "@/lib/place-search";

/** What the person's profile already holds. */
export interface SavedHomeLocation {
  postcode: string | null;
  locationName: string | null;
}

/**
 * The profile fields to send. Empty when the entry hasn't changed, so an older
 * entry nobody has re-picked yet stays as it is.
 */
export type HomeLocationFields = { postcode?: string | null; locationName?: string | null };

export type SettledHomeLocation = { ok: true; fields: HomeLocationFields } | { ok: false };

export interface HomeLocationHandle {
  /** Finish any lookup, then report what to save, or `ok: false` if a choice is still needed. */
  settle: () => Promise<SettledHomeLocation>;
}

type Problem = "pick" | "no_place" | "no_postcode";

type Outcome =
  | { kind: "resolved"; location: HomeLocation }
  /** Postcode-shaped, but postcodes.io couldn't be reached to confirm it. */
  | { kind: "unverified"; postcode: string }
  | { kind: "problem"; problem: Problem };

async function fromPlace(place: PlaceSuggestion): Promise<Outcome> {
  const area = await resolvePlace(place);
  return area
    ? { kind: "resolved", location: { ...area, locationName: place.name } }
    : { kind: "problem", problem: "no_place" };
}

async function lookUp(raw: string): Promise<Outcome> {
  if (isPostcodeLike(raw)) {
    const result = await lookupPostcode(raw);
    if (result.status === "found") {
      const locationName = isFullPostcode(raw) ? null : formatPostcode(raw);
      return { kind: "resolved", location: { ...result.area, locationName } };
    }
    return result.status === "unavailable"
      ? { kind: "unverified", postcode: formatPostcode(raw) }
      : { kind: "problem", problem: "no_postcode" };
  }
  const places = await searchPlaces(raw);
  const match = soleMatch(raw, places);
  if (match) return fromPlace(match);
  return { kind: "problem", problem: places.length > 0 ? "pick" : "no_place" };
}

function describeArea(location: HomeLocation): string {
  return [...new Set([location.adminDistrict, location.region].filter(Boolean))].join(", ");
}

interface HomeLocationFieldProps {
  ref?: Ref<HomeLocationHandle>;
  id: string;
  /** What's in the box: a town name or a postcode. */
  text: string;
  /** The resolved location, once the text has been matched to one. */
  value: HomeLocation | null;
  onChange: (text: string, value: HomeLocation | null) => void;
  saved?: SavedHomeLocation | null;
  /** Called when the saved entry has been looked up without the person editing it. */
  onSavedResolved?: (value: HomeLocation) => void;
}

/**
 * "Where do you live?" box. Takes a town from the suggestions, a postcode or an
 * outward code, and only ever hands back something that can be looked up: text
 * that hasn't been picked or matched is never saved.
 */
export function HomeLocationField({
  ref,
  id,
  text,
  value,
  onChange,
  saved,
  onSavedResolved,
}: HomeLocationFieldProps) {
  const t = useT();
  const [focused, setFocused] = useState(false);
  const [checking, setChecking] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inFlight = useRef<{ key: string; promise: Promise<Outcome> } | null>(null);

  const savedText = saved?.locationName || saved?.postcode || "";
  const isSavedEntry = !!savedText && text === savedText;
  const savedPostcode = saved?.postcode ?? "";
  const savedNeedsPick = isSavedEntry && !isPostcodeLike(savedPostcode);
  const listId = `${id}-suggestions`;

  const { suggestions, highlighted, setHighlighted, moveHighlight, clear, noMatches } =
    usePlaceSuggestions(focused && !value ? text : "");

  const run = (key: string, work: () => Promise<Outcome>, keepText: boolean): Promise<Outcome> => {
    if (inFlight.current?.key === key) return inFlight.current.promise;
    setChecking(true);
    setProblem(null);
    const promise = work().then((outcome) => {
      if (inFlight.current?.promise === promise) {
        inFlight.current = null;
        setChecking(false);
        if (outcome.kind === "resolved") {
          onChange(keepText ? text : (outcome.location.locationName ?? text), outcome.location);
        } else if (outcome.kind === "problem") {
          setProblem(outcome.problem);
        }
      }
      return outcome;
    });
    inFlight.current = { key, promise };
    return promise;
  };

  const resolveText = (raw: string) => run(raw, () => lookUp(raw), isPostcodeLike(raw));

  const pick = (place: PlaceSuggestion) => {
    clear();
    void run(`place:${place.id}`, () => fromPlace(place), false);
  };

  // Anything looked up belongs to the old text, however the text changed: the
  // wizard can fill this box from the profile while someone is typing.
  useEffect(() => {
    inFlight.current = null;
    setChecking(false);
    setProblem(null);
  }, [text]);

  // Postcodes resolve as they're typed. An outward code may be the start of a
  // full postcode, so the box stays editable and carries on if typing resumes.
  useEffect(() => {
    const raw = text.trim();
    if (value || isSavedEntry || !isPostcodeLike(raw)) return;
    const timer = setTimeout(() => void resolveText(raw), 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run on typing only
  }, [text, value, isSavedEntry]);

  // The wizard needs the saved entry's area for the record it's about to make.
  useEffect(() => {
    if (!onSavedResolved || value || !isSavedEntry || !isPostcodeLike(savedPostcode)) return;
    let cancelled = false;
    const work = lookUp(savedPostcode).then((outcome): Outcome => {
      if (!cancelled && outcome.kind === "resolved") {
        const location = {
          ...outcome.location,
          locationName: saved?.locationName ?? outcome.location.locationName,
        };
        onSavedResolved(location);
        return { kind: "resolved", location };
      }
      return outcome;
    });
    inFlight.current = { key: `saved:${savedPostcode}`, promise: work };
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per saved entry
  }, [savedPostcode, isSavedEntry, !!value]);

  useImperativeHandle(ref, () => ({
    settle: async () => {
      const raw = text.trim();
      if (!raw) return { ok: true, fields: { postcode: null, locationName: null } };
      if (value) {
        return { ok: true, fields: { postcode: value.postcode, locationName: value.locationName } };
      }
      if (isSavedEntry) {
        await inFlight.current?.promise;
        return { ok: true, fields: {} };
      }
      const outcome = await resolveText(raw);
      if (outcome.kind === "resolved") {
        const { postcode, locationName } = outcome.location;
        return { ok: true, fields: { postcode, locationName } };
      }
      if (outcome.kind === "unverified") {
        return { ok: true, fields: { postcode: outcome.postcode, locationName: null } };
      }
      inputRef.current?.focus();
      return { ok: false };
    },
  }));

  const showList = focused && suggestions.length > 0;
  const message = checking
    ? null
    : problem === "no_postcode"
      ? t("wizard.postcodeNotFound")
      : problem === "pick"
        ? t("wizard.pickFromList")
        : problem === "no_place" || noMatches
          ? t("wizard.placeNotFound")
          : null;

  return (
    <div className="max-w-xs">
      <div className="relative">
        <MapPin
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none"
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          id={id}
          type="text"
          value={text}
          onChange={(e) => onChange(e.target.value, null)}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            const raw = text.trim();
            if (raw && !value && !isSavedEntry) void resolveText(raw);
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
              const raw = text.trim();
              if (highlighted >= 0 && suggestions[highlighted]) pick(suggestions[highlighted]);
              else if (raw && !value) void resolveText(raw);
            }
          }}
          role="combobox"
          aria-expanded={showList}
          aria-autocomplete="list"
          aria-controls={listId}
          aria-describedby={`${id}-status`}
          autoComplete="off"
          placeholder={t("wizard.postcodePlaceholder")}
          className="w-full pl-9 pr-4 py-3 min-h-[44px] rounded-md border border-border bg-white text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
          data-testid="home-location-input"
        />
        {showList && (
          <PlaceSuggestionList
            id={listId}
            testId="home-location-suggestions"
            suggestions={suggestions}
            highlighted={highlighted}
            onHighlight={setHighlighted}
            onPick={pick}
          />
        )}
      </div>
      <div id={`${id}-status`} role="status" className="mt-1.5 min-h-5 text-xs" data-testid="home-location-status">
        {checking ? (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> {t("wizard.lookingUpLocation")}
          </span>
        ) : value ? (
          <span className="flex items-center gap-1.5 text-green-600">
            <CheckCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /> {describeArea(value)}
          </span>
        ) : message ? (
          <span className="text-red-600">{message}</span>
        ) : savedNeedsPick ? (
          <span className="text-muted-foreground">{t("wizard.pickSavedPlace")}</span>
        ) : null}
      </div>
    </div>
  );
}

export default HomeLocationField;
