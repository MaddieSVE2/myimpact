import { afterEach, describe, expect, it, vi } from "vitest";
import {
  exactMatches,
  formatPostcode,
  isFullPostcode,
  isOutwardCode,
  isPostcodeLike,
  lookupPostcode,
  rankPlaces,
  resolvePlace,
  searchPlaces,
  soleMatch,
  type PlaceSuggestion,
} from "./place-search";

function place(name: string, localType: string, overrides: Partial<PlaceSuggestion> = {}): PlaceSuggestion {
  return {
    id: `${name}-${localType}`,
    name,
    altName: null,
    localType,
    localAuthority: "",
    region: "",
    country: "England",
    outwardCode: "",
    lat: 52,
    lng: -1,
    ...overrides,
  };
}

function apiPlace(name1: string, overrides: Record<string, unknown> = {}) {
  return {
    code: `osgb-${name1}`,
    name_1: name1,
    name_1_lang: null,
    name_2: null,
    name_2_lang: null,
    local_type: "Town",
    county_unitary: null,
    district_borough: null,
    region: "East Midlands",
    country: "England",
    outcode: "NG1",
    latitude: 52.95,
    longitude: -1.15,
    ...overrides,
  };
}

const NOTTINGHAM_POSTCODE = {
  postcode: "NG1 1FP",
  outcode: "NG1",
  admin_district: "Nottingham",
  admin_county: null,
  region: "East Midlands",
  country: "England",
  latitude: 52.95,
  longitude: -1.14,
};

function stubFetch(handler: (url: string) => { status?: number; result?: unknown } | Error) {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const outcome = handler(String(input));
    if (outcome instanceof Error) throw outcome;
    const status = outcome.status ?? 200;
    return new Response(JSON.stringify({ status, result: outcome.result ?? null }), { status });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("postcode shapes", () => {
  it("tells full postcodes, outward codes and place names apart", () => {
    expect(isFullPostcode("ng1 5fs")).toBe(true);
    expect(isFullPostcode("SW1A1AA")).toBe(true);
    expect(isOutwardCode("NG1")).toBe(true);
    expect(isOutwardCode("SW1A")).toBe(true);
    expect(isPostcodeLike("Nottingham")).toBe(false);
    expect(isPostcodeLike("Newcastle upon Tyne")).toBe(false);
  });

  it("formats postcodes the way Royal Mail writes them", () => {
    expect(formatPostcode("ng15fs")).toBe("NG1 5FS");
    expect(formatPostcode("sw1a 1aa")).toBe("SW1A 1AA");
    expect(formatPostcode("m1")).toBe("M1");
  });
});

describe("rankPlaces", () => {
  it("puts cities and towns with the typed name first", () => {
    const ranked = rankPlaces(
      [
        place("Newport", "Village"),
        place("Newport", "Suburban Area"),
        place("Newport", "Town", { localAuthority: "Isle of Wight" }),
        place("Newport Pagnell", "Town"),
        place("Newport", "City", { altName: "Casnewydd" }),
      ],
      "Newport",
    );
    expect(ranked.map((p) => `${p.name}/${p.localType}`)).toEqual([
      "Newport/City",
      "Newport/Town",
      "Newport Pagnell/Town",
      "Newport/Suburban Area",
      "Newport/Village",
    ]);
  });

  it("finds a big place when a village has the exact name", () => {
    const ranked = rankPlaces(
      [place("Stoke", "Village"), place("Bradley Stoke", "Town"), place("Stoke-on-Trent", "City")],
      "Stoke",
    );
    expect(ranked[0].name).toBe("Stoke-on-Trent");
  });

  it("finds a city that has the query inside its name", () => {
    const ranked = rankPlaces(
      [place("Hull Bridge", "Village"), place("Kingston upon Hull", "City")],
      "Hull",
    );
    expect(ranked[0].name).toBe("Kingston upon Hull");
  });
});

describe("exactMatches and soleMatch", () => {
  const nottingham = place("Nottingham", "City");
  const newportCity = place("Newport", "City", { altName: "Casnewydd" });
  const newportTown = place("Newport", "Town");

  it("ignores case, apostrophes and hyphens", () => {
    const lynn = place("King's Lynn", "Town");
    const stoke = place("Stoke-on-Trent", "City");
    expect(exactMatches("kings lynn", [lynn])).toEqual([lynn]);
    expect(exactMatches("stoke on trent", [stoke])).toEqual([stoke]);
  });

  it("matches the other language name too", () => {
    expect(exactMatches("casnewydd", [newportCity])).toEqual([newportCity]);
  });

  it("settles on the only place with that exact name", () => {
    expect(soleMatch("nottingham", [nottingham, place("Nottingham Road", "Hamlet")])).toBe(nottingham);
  });

  it("takes a lone suggestion when nothing matches exactly", () => {
    expect(soleMatch("notting", [nottingham])).toBe(nottingham);
  });

  it("never guesses between places with the same name", () => {
    expect(soleMatch("newport", [newportCity, newportTown])).toBeNull();
  });

  it("needs a choice when several places partly match", () => {
    expect(soleMatch("new", [newportCity, nottingham])).toBeNull();
  });
});

describe("searchPlaces", () => {
  it("shows the English name when Welsh is listed first", async () => {
    stubFetch(() => ({
      result: [
        apiPlace("Casnewydd", {
          name_1_lang: "cym",
          name_2: "Newport",
          name_2_lang: "eng",
          local_type: "City",
          county_unitary: "Casnewydd - Newport",
        }),
      ],
    }));
    const [newport] = await searchPlaces("Newport");
    expect(newport.name).toBe("Newport");
    expect(newport.altName).toBe("Casnewydd");
    expect(newport.localAuthority).toBe("Newport");
  });

  it("keeps the first name when English is already listed first", async () => {
    stubFetch(() => ({
      result: [apiPlace("Cardiff", { name_1_lang: "eng", name_2: "Caerdydd", name_2_lang: "cym" })],
    }));
    const [cardiff] = await searchPlaces("Cardiff");
    expect(cardiff.name).toBe("Cardiff");
    expect(cardiff.altName).toBe("Caerdydd");
  });

  it("asks for more results than it shows, so ranking can reach big places", async () => {
    const villages = Array.from({ length: 30 }, (_, i) =>
      apiPlace("Stoke", { code: `v${i}`, local_type: "Village" }),
    );
    const fetchMock = stubFetch(() => ({
      result: [...villages, apiPlace("Stoke-on-Trent", { local_type: "City" })],
    }));
    const results = await searchPlaces("Stoke");
    expect(String(fetchMock.mock.calls[0][0])).toContain("limit=100");
    expect(results).toHaveLength(10);
    expect(results[0].name).toBe("Stoke-on-Trent");
  });

  it("returns nothing when the service can't be reached", async () => {
    stubFetch(() => new Error("offline"));
    await expect(searchPlaces("Nottingham")).resolves.toEqual([]);
  });
});

describe("resolvePlace", () => {
  const nottingham = place("Nottingham", "City", { lat: 52.95, lng: -1.14 });

  it("uses the local authority of the nearest postcode", async () => {
    stubFetch(() => ({ result: [NOTTINGHAM_POSTCODE] }));
    expect(await resolvePlace(nottingham)).toMatchObject({
      postcode: "NG1 1FP",
      outwardCode: "NG1",
      adminDistrict: "Nottingham",
      region: "East Midlands",
    });
  });

  it("widens the search for places with no postcode nearby", async () => {
    const fetchMock = stubFetch((url) => ({
      result: url.includes("widesearch") ? [NOTTINGHAM_POSTCODE] : null,
    }));
    await expect(resolvePlace(nottingham)).resolves.toMatchObject({ postcode: "NG1 1FP" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falls back to the country for regions outside England", async () => {
    stubFetch(() => ({
      result: [{ ...NOTTINGHAM_POSTCODE, admin_district: "Highland", region: null, country: "Scotland" }],
    }));
    await expect(resolvePlace(nottingham)).resolves.toMatchObject({ region: "Scotland" });
  });

  it("returns null when the service can't be reached", async () => {
    stubFetch(() => new Error("offline"));
    await expect(resolvePlace(nottingham)).resolves.toBeNull();
  });
});

describe("lookupPostcode", () => {
  it("finds a full postcode", async () => {
    const fetchMock = stubFetch(() => ({ result: NOTTINGHAM_POSTCODE }));
    await expect(lookupPostcode("ng1 1fp")).resolves.toMatchObject({
      status: "found",
      area: { postcode: "NG1 1FP", adminDistrict: "Nottingham" },
    });
    expect(String(fetchMock.mock.calls[0][0])).toContain("/postcodes/NG11FP");
  });

  it("turns an outward code into a nearby full postcode", async () => {
    stubFetch((url) =>
      url.includes("/outcodes/")
        ? { result: { outcode: "NG1", latitude: 52.95, longitude: -1.14 } }
        : { result: [NOTTINGHAM_POSTCODE] },
    );
    await expect(lookupPostcode("NG1")).resolves.toMatchObject({
      status: "found",
      area: { postcode: "NG1 1FP", outwardCode: "NG1" },
    });
  });

  it("reports a postcode that doesn't exist", async () => {
    stubFetch(() => ({ status: 404 }));
    await expect(lookupPostcode("NG1 9ZZ")).resolves.toEqual({ status: "not_found" });
  });

  it("reports when the service can't be reached", async () => {
    stubFetch(() => new Error("offline"));
    await expect(lookupPostcode("NG1 1FP")).resolves.toEqual({ status: "unavailable" });
  });

  it("treats a server error as unavailable", async () => {
    stubFetch(() => ({ status: 503 }));
    await expect(lookupPostcode("NG1 1FP")).resolves.toEqual({ status: "unavailable" });
  });
});
