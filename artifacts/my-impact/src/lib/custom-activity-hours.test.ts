import { describe, expect, it } from "vitest";
import { customActivityHours } from "./custom-activity-hours";

describe("customActivityHours", () => {
  it("counts no time for an everyday habit", () => {
    expect(customActivityHours("item", 75, 0)).toBe(0);
  });

  it("multiplies the amount by the time each one takes", () => {
    expect(customActivityHours("session", 12, 1.5)).toBe(18);
    expect(customActivityHours("person", 3, 0.25)).toBe(0.8);
  });

  it("takes hours as entered and gives money no time", () => {
    expect(customActivityHours("hour", 40, 0)).toBe(40);
    expect(customActivityHours("pound", 200, 2)).toBe(0);
  });

  it("assumes two hours each when there is no estimate", () => {
    expect(customActivityHours("household", 10)).toBe(20);
    expect(customActivityHours("item", 0.2, null)).toBe(1);
    expect(customActivityHours("item", 5, -1)).toBe(10);
  });
});
