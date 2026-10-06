import { describe, it, expect } from "vitest";
import { cleanGroupName, isGroupRole, pickGroup, GROUP_NAME_MAX } from "../src/lib/orgGroups.js";

describe("pickGroup", () => {
  it("uses the member's only group", () => {
    expect(pickGroup(["g1"], null)).toBe("g1");
  });
  it("does not guess for a member in several groups", () => {
    expect(pickGroup(["g1", "g2"], null)).toBeNull();
  });
  it("uses a remembered group the member is still in", () => {
    expect(pickGroup(["g1", "g2"], "g2")).toBe("g2");
  });
  it("ignores a remembered group the member has left or that was archived", () => {
    expect(pickGroup(["g1", "g2"], "gone")).toBeNull();
    expect(pickGroup(["g1"], "gone")).toBe("g1");
  });
  it("gives no group to someone in none", () => {
    expect(pickGroup([], "g1")).toBeNull();
  });
});

describe("cleanGroupName", () => {
  it("trims and collapses spaces", () => {
    expect(cleanGroupName("  Football   club ")).toBe("Football club");
  });
  it("refuses empty, non-text and over-long names", () => {
    expect(cleanGroupName("   ")).toBeNull();
    expect(cleanGroupName(42)).toBeNull();
    expect(cleanGroupName("x".repeat(GROUP_NAME_MAX + 1))).toBeNull();
    expect(cleanGroupName("x".repeat(GROUP_NAME_MAX))).toHaveLength(GROUP_NAME_MAX);
  });
});

describe("isGroupRole", () => {
  it("accepts member and lead only", () => {
    expect(isGroupRole("member")).toBe(true);
    expect(isGroupRole("lead")).toBe(true);
    expect(isGroupRole("manager")).toBe(false);
    expect(isGroupRole(undefined)).toBe(false);
  });
});
