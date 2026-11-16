import { describe, it, expect } from "vitest";
import { isDemoOrSyntheticEmail, isSyntheticSeedEmail } from "../src/lib/demoAccounts.js";

describe("isSyntheticSeedEmail", () => {
  it("matches every seeded university student, whatever the number", () => {
    expect(isSyntheticSeedEmail("uni-synth-u-001@myimpact-university.org")).toBe(true);
    expect(isSyntheticSeedEmail("uni-synth-u-10238@myimpact-university.org")).toBe(true);
    expect(isSyntheticSeedEmail("UNI-SYNTH-U-4096@MyImpact-University.org")).toBe(true);
  });

  it("matches the Demo Organisation's seeded survey respondents", () => {
    expect(isSyntheticSeedEmail("synth-member-050@demo-organisation.org")).toBe(true);
  });

  it("leaves real people and the demo sign-ins alone", () => {
    expect(isSyntheticSeedEmail("sam@example.com")).toBe(false);
    expect(isSyntheticSeedEmail("student@student.org")).toBe(false);
  });
});

describe("isDemoOrSyntheticEmail", () => {
  it("covers the shared demo sign-ins as well as seeded accounts", () => {
    expect(isDemoOrSyntheticEmail("university@university.org")).toBe(true);
    expect(isDemoOrSyntheticEmail("Student@Student.org")).toBe(true);
    expect(isDemoOrSyntheticEmail("uni-synth-u-10238@myimpact-university.org")).toBe(true);
  });

  it("never excludes a real address", () => {
    expect(isDemoOrSyntheticEmail("student@northfield.ac.uk")).toBe(false);
    expect(isDemoOrSyntheticEmail("demo@example.com")).toBe(false);
  });
});
