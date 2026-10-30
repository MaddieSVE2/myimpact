import { describe, it, expect, vi } from "vitest";

// profileLocation imports orgBreakdown, which pulls impactData; stub the db
// package in case transitive imports ever touch it.
vi.mock("@workspace/db", async () => {
  const schema = await import("../../../lib/db/src/schema/index.js");
  return { ...schema, db: {}, pool: {} };
});

const { memberArea, resolveProfileLocation } = await import("../src/lib/profileLocation.js");

const town = { postcode: "NG1 1FP", locationName: "Nottingham" };

describe("resolveProfileLocation", () => {
  it("stores a picked town with its nearest postcode", () => {
    expect(resolveProfileLocation({ postcode: "NG1 1FP", locationName: "Nottingham" }, null)).toEqual(town);
  });

  it("stores a typed postcode with no town name", () => {
    expect(resolveProfileLocation({ postcode: "ng1 5fs", locationName: null }, town)).toEqual({
      postcode: "NG1 5FS",
      locationName: null,
    });
  });

  it("accepts an outward code", () => {
    expect(resolveProfileLocation({ postcode: "M1", locationName: "M1" }, null)).toEqual({
      postcode: "M1",
      locationName: "M1",
    });
  });

  it("clears both fields when the postcode is cleared", () => {
    expect(resolveProfileLocation({ postcode: null, locationName: null }, town)).toEqual({
      postcode: null,
      locationName: null,
    });
    expect(resolveProfileLocation({ postcode: "  " }, town)).toEqual({ postcode: null, locationName: null });
  });

  it("keeps what's stored when the location isn't part of the update", () => {
    expect(resolveProfileLocation({ interests: [] }, town)).toEqual(town);
  });

  it("leaves an older town name in the postcode field alone until it's replaced", () => {
    const legacy = { postcode: "Nottingham", locationName: null };
    expect(resolveProfileLocation({ interests: [] }, legacy)).toEqual(legacy);
    expect(resolveProfileLocation({ postcode: "Nottingham" }, legacy)).toEqual(legacy);
  });

  it("never stores free text sent by an older version of the app", () => {
    expect(resolveProfileLocation({ postcode: "Newcastle upon Tyne" }, town)).toEqual(town);
    expect(resolveProfileLocation({ postcode: "Nottingham" }, null)).toEqual({
      postcode: null,
      locationName: null,
    });
  });

  it("keeps the town name when an older client resends the same postcode", () => {
    expect(resolveProfileLocation({ postcode: "NG1 1FP" }, town)).toEqual(town);
  });

  it("drops the town name when an older client sends a different postcode", () => {
    expect(resolveProfileLocation({ postcode: "M1 1AE" }, town)).toEqual({
      postcode: "M1 1AE",
      locationName: null,
    });
  });

  it("trims the town name and caps its length", () => {
    const stored = resolveProfileLocation({ postcode: "M1", locationName: `  ${"x".repeat(150)}  ` }, null);
    expect(stored.locationName).toHaveLength(100);
  });
});

describe("memberArea", () => {
  it("shows the town someone picked", () => {
    expect(memberArea(town)).toBe("Nottingham");
  });

  it("reduces a postcode to its area letters", () => {
    expect(memberArea({ postcode: "SW1A 1AA", locationName: null })).toBe("SW");
  });

  it("shows nothing for an older town name in the postcode field", () => {
    expect(memberArea({ postcode: "12 High Street, Nottingham", locationName: null })).toBeNull();
  });

  it("copes with a member who has no profile", () => {
    expect(memberArea(null)).toBeNull();
    expect(memberArea(undefined)).toBeNull();
  });
});
