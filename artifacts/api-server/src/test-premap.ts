import { geocodePostcode } from "./lib/postcode.js";
import { generateForAuthority, getStoredSuggestions } from "./lib/premappedCharities.js";
import { db, localCharityAreasTable } from "@workspace/db";

async function main() {
  const geo = await geocodePostcode("LN1 1YL");
  console.log("geo:", geo);
  if (!geo) throw new Error("geocode failed");
  await db.insert(localCharityAreasTable).values({ localAuthority: geo.adminDistrict, country: geo.country, status: "pending" }).onConflictDoNothing();
  console.time("generate");
  await generateForAuthority(geo.adminDistrict, geo.country);
  console.timeEnd("generate");
  const rows = await getStoredSuggestions(geo.adminDistrict);
  for (const r of rows) {
    console.log(r.category, "->", r.places.map(p => `${p.name}${p.verified ? " [✓ " + p.registrationNumber + "]" : ""}`).join(" | "));
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
