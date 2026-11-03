import { describe, expect, it } from "vitest";
import {
  activeCount,
  annualHours,
  basisFromAnnual,
  changePeriod,
  isShortPeriod,
  weeksInPeriod,
  withCustomCount,
  withoutYearPhrase,
  type HoursBasis,
} from "./hours-estimate";

const weekly: HoursBasis = { period: "week", amount: 2, share: "most", customWeeks: 40 };

describe("annualHours", () => {
  it("scales a weekly answer by the weeks it covers", () => {
    expect(annualHours(weekly)).toBe(80);
    expect(annualHours({ ...weekly, share: "nearly_all" })).toBe(92);
    expect(annualHours({ ...weekly, share: "part" })).toBe(52);
  });

  it("scales a monthly answer by the months it covers", () => {
    expect(annualHours({ ...weekly, period: "month", amount: 10, share: "nearly_all" })).toBe(110);
    expect(annualHours({ ...weekly, period: "month", amount: 10, share: "most" })).toBe(90);
    expect(annualHours({ ...weekly, period: "month", amount: 10, share: "part" })).toBe(60);
  });

  it("takes a yearly answer as it stands, whatever the share", () => {
    expect(annualHours({ ...weekly, period: "year", amount: 75, share: "part" })).toBe(75);
  });

  it("rounds to whole hours", () => {
    expect(annualHours({ ...weekly, amount: 1.5, share: "nearly_all" })).toBe(69);
    expect(annualHours({ ...weekly, amount: 0.25, share: "custom", customWeeks: 30 })).toBe(8);
  });

  it("gives zero for an empty answer", () => {
    expect(annualHours({ ...weekly, amount: 0 })).toBe(0);
  });
});

describe("basisFromAnnual", () => {
  it("asks by the week while the figure is still the starting value", () => {
    expect(basisFromAnnual(80, 80)).toEqual({ period: "week", amount: 2, share: "most", customWeeks: 40 });
    expect(basisFromAnnual(0)).toMatchObject({ period: "week", amount: 0 });
  });

  it("keeps an answered figure as a yearly number", () => {
    expect(basisFromAnnual(6)).toMatchObject({ period: "year", amount: 6 });
    expect(basisFromAnnual(75, 50)).toMatchObject({ period: "year", amount: 75 });
  });
});

describe("changePeriod", () => {
  it("keeps the annual total when moving between periods", () => {
    const monthly = changePeriod(weekly, 80, "month");
    expect(monthly).toMatchObject({ period: "month", amount: 8.9 });
    expect(annualHours(monthly)).toBe(80);

    const yearly = changePeriod(monthly, 80, "year");
    expect(yearly).toMatchObject({ period: "year", amount: 80 });

    const back = changePeriod(yearly, 80, "week");
    expect(back).toMatchObject({ period: "week", amount: 2 });
  });

  it("keeps the amount when a custom count has been cleared", () => {
    const cleared = withCustomCount(weekly, 0);
    expect(changePeriod(cleared, 0, "month").amount).toBe(2);
  });
});

describe("withCustomCount", () => {
  it("takes weeks for a weekly answer", () => {
    const b = withCustomCount(weekly, 30);
    expect(b).toMatchObject({ share: "custom", customWeeks: 30 });
    expect(annualHours(b)).toBe(60);
  });

  it("takes months for a monthly answer and shows them back unchanged", () => {
    for (let months = 1; months <= 12; months += 1) {
      const b = withCustomCount({ ...weekly, period: "month" }, months);
      expect(activeCount(b)).toBe(months);
    }
  });

  it("stays within a year", () => {
    expect(withCustomCount(weekly, 60).customWeeks).toBe(52);
    expect(activeCount(withCustomCount({ ...weekly, period: "month" }, 20))).toBe(12);
  });
});

describe("small starting figures", () => {
  it.each([1, 2, 3, 5, 6, 10, 26])("keeps %i hours a year when asked by the week", (annual) => {
    expect(annualHours(basisFromAnnual(annual, annual))).toBe(annual);
  });

  it("keeps a small figure when moved to months", () => {
    const basis = basisFromAnnual(6, 6);
    expect(annualHours(changePeriod(basis, 6, "month"))).toBe(6);
  });
});

describe("report periods shorter than a year", () => {
  const quarter = { startDate: "2026-04-01", endDate: "2026-06-30" };

  it("counts the weeks in a period", () => {
    expect(weeksInPeriod(quarter)).toBe(13);
    expect(weeksInPeriod({ startDate: "2026-01-01", endDate: "2026-12-31" })).toBe(52);
    expect(weeksInPeriod({ startDate: "2026-06-01", endDate: "2026-06-01" })).toBe(1);
  });

  it("treats a year, or nearly one, as a year", () => {
    expect(isShortPeriod(52)).toBe(false);
    expect(isShortPeriod(46)).toBe(false);
    expect(isShortPeriod(45)).toBe(true);
  });

  it("counts a weekly answer for the whole of a short period", () => {
    const basis = basisFromAnnual(0, 0, 13);
    expect(annualHours({ ...basis, amount: 2 })).toBe(26);
    expect(annualHours({ ...changePeriod({ ...basis, amount: 2 }, 26, "month"), amount: 10 })).toBe(30);
  });

  it("uses the usual presets for a full year", () => {
    expect(basisFromAnnual(0, 0, 52).share).toBe("most");
  });
});

describe("withoutYearPhrase", () => {
  it.each([
    ["How many hours did you spend coaching or instructing sport this year?", "How many hours did you spend coaching or instructing sport?"],
    ["How many hours do you give to conservation work each year?", "How many hours do you give to conservation work?"],
    ["How many hours per year do you spend managing care admin — appointments?", "How many hours do you spend managing care admin — appointments?"],
    ["How many hours do you volunteer annually?", "How many hours do you volunteer?"],
    ["How many hours do you spend each year on conservation?", "How many hours do you spend on conservation?"],
    ["Hours each year:", "Hours:"],
  ])("rewrites %s", (input, expected) => {
    expect(withoutYearPhrase(input)).toBe(expected);
  });

  it.each([
    "Which event do you help at twice a year?",
    "How many hours at the fair you run three times a year?",
  ])("keeps how often something happens in %s", (question) => {
    expect(withoutYearPhrase(question)).toBe(question);
  });

  it("leaves a question with no year phrase alone", () => {
    const q = "How many hours did you spend on logistics planning and coordination?";
    expect(withoutYearPhrase(q)).toBe(q);
  });
});
