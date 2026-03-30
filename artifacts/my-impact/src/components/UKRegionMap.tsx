import { useEffect, useRef } from "react";
import type { Map as LeafletMap, GeoJSON as LeafletGeoJSON } from "leaflet";
import { ShieldCheck } from "lucide-react";
import UK_REGIONS_GEOJSON from "@/data/uk-regions";

export interface RegionData {
  region: string;
  members: number;
  hours?: number;
  value?: number;
  sroi?: number | null;
  pct: number;
}

interface UKRegionMapProps {
  regions: RegionData[];
}

const REGION_NAME_ALIASES: Record<string, string> = {
  "Midlands": "West Midlands",
  "North West England": "North West",
  "North East England": "North East",
  "East": "East of England",
  "Yorkshire": "Yorkshire and The Humber",
  "Yorkshire and Humber": "Yorkshire and The Humber",
};

function canonicalName(name: string): string {
  return REGION_NAME_ALIASES[name] ?? name;
}

function formatCurrencyShort(v: number): string {
  if (v >= 1000) return `£${(v / 1000).toFixed(1)}k`;
  return `£${v.toLocaleString("en-GB")}`;
}

function buildPopupElement(region: RegionData): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.style.cssText = "font-family:system-ui,sans-serif;padding:4px 0;min-width:160px";

  const title = document.createElement("p");
  title.style.cssText = "font-size:13px;font-weight:700;color:#111;margin:0 0 8px";
  title.textContent = region.region;
  wrapper.appendChild(title);

  const rows = document.createElement("div");
  rows.style.cssText = "display:flex;flex-direction:column;gap:4px";

  function addRow(label: string, text: string, valueColor = "#111") {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;justify-content:space-between;gap:12px";
    const labelEl = document.createElement("span");
    labelEl.style.cssText = "font-size:11px;color:#666";
    labelEl.textContent = label;
    const valEl = document.createElement("span");
    valEl.style.cssText = `font-size:12px;font-weight:600;color:${valueColor}`;
    valEl.textContent = text;
    row.appendChild(labelEl);
    row.appendChild(valEl);
    rows.appendChild(row);
  }

  addRow("Members", String(region.members), "#F06127");
  if (region.hours !== undefined) addRow("Hours given", region.hours.toLocaleString("en-GB"));
  if (region.value !== undefined) addRow("Social value", formatCurrencyShort(region.value));
  if (region.sroi != null) addRow("SROI", `£${region.sroi.toFixed(2)} per £1`);
  addRow("Share of org", `${region.pct}%`);

  wrapper.appendChild(rows);
  return wrapper;
}

export function UKRegionMap({ regions }: UKRegionMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<LeafletMap | null>(null);
  const layersRef = useRef<LeafletGeoJSON[]>([]);

  function clearLayers() {
    for (const layer of layersRef.current) {
      layer.remove();
    }
    layersRef.current = [];
  }

  useEffect(() => {
    if (!mapRef.current) return;
    let cancelled = false;

    async function run() {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !mapRef.current) return;

      let map = mapInstanceRef.current;
      if (!map) {
        map = L.map(mapRef.current, {
          center: [54.5, -4.0],
          zoom: 5,
          zoomControl: true,
          scrollWheelZoom: false,
          attributionControl: true,
        });
        mapInstanceRef.current = map;

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '© <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 18,
        }).addTo(map);
      }

      clearLayers();

      const regionByName = new Map<string, RegionData>();
      for (const r of regions) {
        regionByName.set(canonicalName(r.region), r);
        regionByName.set(r.region, r);
      }

      const maxPct = Math.max(...regions.map(r => r.pct), 1);

      for (const rawFeature of UK_REGIONS_GEOJSON.features) {
        if (cancelled) break;
        const featureName = (rawFeature.properties as Record<string, unknown> | null)?.name as string | undefined;
        if (!featureName) continue;

        const regionData = regionByName.get(featureName);

        const geoInput = rawFeature as Parameters<typeof L.geoJSON>[0];

        if (!regionData) {
          const layer: LeafletGeoJSON = L.geoJSON(geoInput, {
            style: {
              color: "#ccc",
              weight: 1,
              fillColor: "#e5e7eb",
              fillOpacity: 0.2,
            },
          });

          const label = document.createElement("div");
          label.style.cssText = "font-family:system-ui,sans-serif;padding:4px 8px;font-size:12px;color:#555";
          label.textContent = `${featureName} — no data`;

          layer.bindPopup(label, { maxWidth: 220 });
          layer.addTo(map);
          layersRef.current.push(layer);
          continue;
        }

        const fillOpacity = 0.2 + (regionData.pct / maxPct) * 0.65;

        const layer: LeafletGeoJSON = L.geoJSON(geoInput, {
          style: {
            color: "#F06127",
            weight: 1.5,
            fillColor: "#F06127",
            fillOpacity,
          },
        });

        layer.bindPopup(buildPopupElement(regionData), { maxWidth: 220 });
        layer.on("mouseover", () => layer.setStyle({ fillOpacity: Math.min(fillOpacity + 0.2, 0.95) }));
        layer.on("mouseout", () => layer.setStyle({ fillOpacity }));
        layer.addTo(map);
        layersRef.current.push(layer);
      }
    }

    run().catch(console.error);

    return () => {
      cancelled = true;
    };
  }, [regions]);

  useEffect(() => {
    return () => {
      clearLayers();
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  return (
    <div>
      <div ref={mapRef} className="w-full rounded-xl overflow-hidden border border-border" style={{ height: 360 }} />
      <div className="mt-2 flex items-start gap-1.5">
        <ShieldCheck className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Only broad regions are shown. No individual location data is stored — regions are derived from member-supplied postcodes and shown in aggregate only. Darker shading indicates higher member activity.
        </p>
      </div>
    </div>
  );
}
