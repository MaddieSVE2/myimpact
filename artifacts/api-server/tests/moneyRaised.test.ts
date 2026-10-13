import { describe, it, expect } from "vitest";
import { parseDonation, parseMoneyRaised } from "../src/lib/donationRepair.js";

describe("parseMoneyRaised", () => {
  it("takes the amount from money raised however it is put", () => {
    expect(parseMoneyRaised("I did a bakesale and raised £200 for the local garden.")).toEqual({ amount: 200 });
    expect(parseMoneyRaised("Raised 1,250 pounds on a sponsored walk")).toEqual({ amount: 1250 });
    expect(parseMoneyRaised("Fundraising for the hospice, £75.50")).toEqual({ amount: 75.5 });
  });

  it("counts fundraising and sales held to raise money without an amount", () => {
    expect(parseMoneyRaised("Fund-raising for Scouts")).toEqual({ amount: null });
    expect(parseMoneyRaised("Ran the cake sale at school")).toEqual({ amount: null });
    expect(parseMoneyRaised("Helped at the charity car boot sale")).toEqual({ amount: null });
  });

  it("leaves activities that only mention raising something else", () => {
    expect(parseMoneyRaised("Raising awareness of mental health")).toBeNull();
    expect(parseMoneyRaised("Raised a garden bed at the allotment")).toBeNull();
    expect(parseMoneyRaised("Volunteered at the food bank")).toBeNull();
  });

  it("keeps donations as donations", () => {
    expect(parseMoneyRaised("I donate £10 a month to Shelter")).toBeNull();
    expect(parseDonation("I donate £10 a month to Shelter")).toEqual({ annualAmount: 120 });
  });
});
