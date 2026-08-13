import { useState } from "react";
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

  const applyText = async () => {
    const raw = text.trim();
    if (!raw) return;
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
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
              <input
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void applyText();
                  }
                }}
                placeholder="Venue, postcode or town…"
                className="w-full pl-9 pr-3 py-2.5 rounded-md bg-white border border-border text-sm focus:border-primary outline-none"
                data-testid="quick-log-location-input"
              />
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
