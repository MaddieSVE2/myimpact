import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Sidekick is given a short summary of the signed-in person's saved record.
// These tests cover what goes into that summary, how big it can get, and the
// two cases where nothing may be read at all: anonymous callers, and a
// manager speaking for their organisation.

const aggregation = vi.hoisted(() => ({
  aggregateLifetime: vi.fn(),
  aggregateYear: vi.fn(),
}));
// The database readers. Replaced so a test can prove they were never called.
vi.mock("../src/lib/recordAggregation.js", () => aggregation);

import {
  SIDEKICK_TEMPLATES,
  buildRegeneratePrompt,
  buildTemplatePrompt,
  templatesForPersona,
  type SidekickPersona,
  type SidekickUserContext,
} from "../../my-impact/src/lib/sidekick-templates";
import { buildSidekickContextMessage, type SidekickSavedRecord } from "../src/lib/sidekickContext";
import {
  MAX_SAVED_ACTIVITY_NAME_CHARS,
  MAX_SAVED_RECORD_ACTIVITIES,
  loadSidekickSavedRecord,
  summariseSavedRecord,
  type SavedRecordAggregates,
} from "../src/lib/sidekickSavedRecord";

const NOW = new Date(Date.UTC(2026, 10, 23));

const activity = (activityName: string, impactValue: number, hours: number) => ({
  activityId: activityName,
  activityName,
  category: "Community",
  sdg: "SDG 3",
  sdgColor: "#4C9F38",
  impactValue,
  hours,
});

function aggregates(overrides: Partial<SavedRecordAggregates["lifetime"]> = {}): SavedRecordAggregates {
  return {
    lifetime: {
      records: [
        { entryDate: new Date(Date.UTC(2024, 2, 9)) },
        { entryDate: new Date(Date.UTC(2026, 9, 30)) },
      ],
      totalValue: 4210.456,
      totalHours: 312.25,
      activityMap: new Map([
        ["food_bank", activity("Food bank volunteering", 2400, 120)],
        ["mentoring", activity("Youth mentoring", 1500.5, 80.5)],
        ["blood", activity("Giving blood", 310, 0)],
      ]),
      ...overrides,
    },
    thisYear: { totalValue: 1850.004, totalHours: 140 },
  };
}

const SAVED: SidekickSavedRecord = summariseSavedRecord(aggregates(), 2026);

beforeEach(() => {
  aggregation.aggregateLifetime.mockReset();
  aggregation.aggregateYear.mockReset();
});

describe("the saved-record summary", () => {
  it("carries the totals, this year's figures and the main activities with hours", () => {
    expect(SAVED).toEqual({
      status: "saved",
      totalValue: 4210.46,
      totalHours: 312.25,
      year: 2026,
      yearValue: 1850,
      yearHours: 140,
      activities: [
        { name: "Food bank volunteering", hours: 120 },
        { name: "Youth mentoring", hours: 80.5 },
        { name: "Giving blood", hours: 0 },
      ],
      moreActivities: 0,
      firstEntry: "March 2024",
      latestEntry: "October 2026",
    });
  });

  it("says so when nothing has been saved", () => {
    expect(summariseSavedRecord(aggregates({ records: [], activityMap: new Map() }), 2026)).toEqual({
      status: "empty",
    });
  });

  it("stays small however much has been saved", () => {
    const longName = "Helping an older neighbour with shopping,\nappointments and paperwork ".repeat(6);
    const many = new Map(
      Array.from({ length: 50 }, (_, i) => [`a${i}`, activity(`${i} ${longName}`, 1000 - i, 10 + i)] as const),
    );
    const saved = summariseSavedRecord(aggregates({ activityMap: many }), 2026);
    if (saved.status !== "saved") throw new Error("expected a saved record");

    expect(saved.activities).toHaveLength(MAX_SAVED_RECORD_ACTIVITIES);
    expect(saved.moreActivities).toBe(50 - MAX_SAVED_RECORD_ACTIVITIES);
    for (const a of saved.activities) {
      expect(a.name.length).toBeLessThanOrEqual(MAX_SAVED_ACTIVITY_NAME_CHARS);
      expect(a.name).not.toMatch(/\p{Cc}/u);
    }
    // Highest social value first, the order the recap uses.
    expect(saved.activities[0]!.name.startsWith("0 ")).toBe(true);

    const message = buildSidekickContextMessage({}, undefined, saved)!;
    expect(message).toContain("and 42 more not listed here");
    expect(message).not.toContain("\n");
    expect(message.length).toBeLessThan(2500);
  });

  it("leaves out activities with nothing counted, and never shows a negative figure", () => {
    const saved = summariseSavedRecord(
      {
        lifetime: {
          records: [{ entryDate: new Date(Date.UTC(2026, 0, 5)) }],
          totalValue: -0.004,
          totalHours: Number.NaN,
          activityMap: new Map([
            ["gone", activity("Reconciled away", 0, 0)],
            ["kept", activity("Litter picking", 12, 1)],
          ]),
        },
        thisYear: { totalValue: 12, totalHours: 1 },
      },
      2026,
    );
    expect(saved).toMatchObject({
      totalValue: 0,
      totalHours: 0,
      activities: [{ name: "Litter picking", hours: 1 }],
      moreActivities: 0,
      firstEntry: "January 2026",
      latestEntry: "January 2026",
    });
  });

  it("contains nothing but totals, dates and activity names", () => {
    // Records carry far more than this (the entry's name, location, and
    // links to journal entries). None of it may reach the summary.
    const withExtras = aggregates({
      records: [
        {
          entryDate: new Date(Date.UTC(2025, 4, 1)),
          name: "PRIVATE-ENTRY-NAME",
          locationJson: { postcode: "PRIVATE-POSTCODE" },
          notes: "PRIVATE-REFLECTION",
        } as { entryDate: Date },
      ],
    });
    const saved = summariseSavedRecord(withExtras, 2026);
    expect(JSON.stringify(saved)).not.toContain("PRIVATE");
    expect(Object.keys(saved).sort()).toEqual([
      "activities", "firstEntry", "latestEntry", "moreActivities", "status",
      "totalHours", "totalValue", "year", "yearHours", "yearValue",
    ]);
  });

  it("is built without reading journal entries, notes or reflections", () => {
    const read = (path: string) => readFileSync(new URL(`../src/lib/${path}`, import.meta.url), "utf8");
    for (const source of [read("sidekickSavedRecord.ts"), read("recordAggregation.ts")]) {
      expect(source).not.toMatch(/journalEntriesTable|from\(journal/);
    }
  });
});

describe("when the saved record is read", () => {
  it("is read from the database for a signed-in person asking about their own impact", async () => {
    aggregation.aggregateLifetime.mockResolvedValue(aggregates().lifetime);
    aggregation.aggregateYear.mockResolvedValue(aggregates().thisYear);

    const saved = await loadSidekickSavedRecord({ userId: "user_1", context: { totalValue: 99 }, now: NOW });

    expect(aggregation.aggregateLifetime).toHaveBeenCalledWith("user_1");
    expect(aggregation.aggregateYear).toHaveBeenCalledWith("user_1", 2026);
    expect(saved).toEqual(SAVED);
  });

  it("is read even when the browser sent no context at all", async () => {
    aggregation.aggregateLifetime.mockResolvedValue(aggregates().lifetime);
    aggregation.aggregateYear.mockResolvedValue(aggregates().thisYear);
    expect(await loadSidekickSavedRecord({ userId: "user_1", context: undefined, now: NOW })).toEqual(SAVED);
  });

  it("is not read for an anonymous caller", async () => {
    for (const userId of [undefined, null, ""]) {
      expect(await loadSidekickSavedRecord({ userId, context: { totalValue: 99 }, now: NOW })).toBeNull();
    }
    expect(aggregation.aggregateLifetime).not.toHaveBeenCalled();
    expect(aggregation.aggregateYear).not.toHaveBeenCalled();
  });

  it("is not read for a manager speaking for their organisation", async () => {
    const saved = await loadSidekickSavedRecord({
      userId: "manager_1",
      context: { interests: ["caring", "org_manager"], org: { name: "Riverside Food Bank" } },
      now: NOW,
    });
    expect(saved).toBeNull();
    expect(aggregation.aggregateLifetime).not.toHaveBeenCalled();
    expect(aggregation.aggregateYear).not.toHaveBeenCalled();
  });

  it("skips the second read when nothing is saved", async () => {
    aggregation.aggregateLifetime.mockResolvedValue({ ...aggregates().lifetime, records: [] });
    expect(await loadSidekickSavedRecord({ userId: "user_1", context: {}, now: NOW })).toEqual({ status: "empty" });
    expect(aggregation.aggregateYear).not.toHaveBeenCalled();
  });

  it("does not break the chat when the record cannot be read", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    aggregation.aggregateLifetime.mockRejectedValue(new Error("database is down"));
    expect(await loadSidekickSavedRecord({ userId: "user_1", context: {}, now: NOW })).toEqual({
      status: "unavailable",
    });
    quiet.mockRestore();
  });
});

describe("what Sidekick is told about the saved record", () => {
  it("gives an individual their saved figures and activities", () => {
    const message = buildSidekickContextMessage({ interests: ["caring"] }, undefined, SAVED)!;
    expect(message).toContain("SAVED RECORD");
    expect(message).toContain("dated from March 2024 to October 2026");
    expect(message).toContain("All time: £4,210 total social value and 312.3 hours.");
    expect(message).toContain("In 2026 so far: £1,850 and 140 hours.");
    expect(message).toContain("Food bank volunteering (120 hours); Youth mentoring (80.5 hours); Giving blood.");
    expect(message).toContain("asking as an individual");
  });

  it("keeps the saved record apart from the calculation open on screen", () => {
    const message = buildSidekickContextMessage({ totalValue: 950, activities: ["Dog walking"] }, undefined, SAVED)!;
    expect(message).toContain("The result open on their screen right now comes to £950.");
    expect(message).toContain("The result open on their screen lists these activities: Dog walking.");
    expect(message).not.toContain("current social value score is");
  });

  it("works when the browser sent no context", () => {
    const message = buildSidekickContextMessage(undefined, "consented_logging", SAVED)!;
    expect(message).toContain("All time: £4,210 total social value");
    expect(message).toContain("uses consented logging");
  });

  it("says plainly when the record is empty or could not be read", () => {
    const empty = buildSidekickContextMessage({}, undefined, { status: "empty" })!;
    expect(empty).toContain("has nothing saved in their My Impact record yet");
    expect(empty).toContain("Do not invent figures");

    const unavailable = buildSidekickContextMessage({ totalValue: 950 }, undefined, { status: "unavailable" })!;
    expect(unavailable).toContain("could not be read for this message");
    // With no saved figures, the on-screen score keeps its usual wording.
    expect(unavailable).toContain("current social value score is £950");
  });

  it("never puts a personal record into an organisation reply, even if one is passed in", () => {
    const message = buildSidekickContextMessage(
      { interests: ["org_manager"], org: { name: "Riverside Food Bank", totalSocialValue: 12400, totalHours: 830, people: 42 } },
      "explicit_submission",
      SAVED,
    )!;
    expect(message).toContain("organisation manager at Riverside Food Bank");
    expect(message).not.toContain("SAVED RECORD");
    expect(message).not.toContain("£4,210");
    expect(message).not.toContain("Food bank volunteering");
    expect(message).not.toContain("312");
  });

  it("leaves anonymous requests exactly as they were", () => {
    expect(buildSidekickContextMessage(undefined)).toBeNull();
    expect(buildSidekickContextMessage(undefined, undefined, null)).toBeNull();
    const before = buildSidekickContextMessage({ totalValue: 950, activities: ["Dog walking"] })!;
    expect(buildSidekickContextMessage({ totalValue: 950, activities: ["Dog walking"] }, undefined, null)).toBe(before);
    expect(before).toContain("The user's current social value score is £950.");
    expect(before).toContain("Their logged activities include: Dog walking.");
    expect(before).not.toContain("SAVED RECORD");
  });

  it("tells Sidekick how to use it, without loosening the application rules", () => {
    const route = readFileSync(new URL("../src/routes/sidekick.ts", import.meta.url), "utf8");
    expect(route).toContain("THE PERSON'S SAVED RECORD:");
    expect(route).toContain("Do not ask the person to retype activities, hours or totals that are in the saved record");
    expect(route).toContain("never to produce finished application wording");
    expect(route).toContain("An organisation manager speaking for their organisation is never given a personal saved record");
    // The rules themselves come after, untouched.
    expect(route.indexOf("THE PERSON'S SAVED RECORD:")).toBeLessThan(route.indexOf("APPLICATION-WRITING SAFETY:"));
    expect(route).toContain("Do not produce finished or submission-ready application wording");
  });
});

describe("template prompts for someone with a saved record", () => {
  const PERSONAL: SidekickPersona[] = ["default", "veteran", "carer", "student", "apprenticeship", "career_break"];
  const NO_SCORE = "I have not generated a score yet";
  const USE_RECORD = "Use the activities, hours and social value in my saved record, and ask me for anything else.";

  it("point to the saved record instead of saying there is no score", () => {
    for (const persona of PERSONAL) {
      for (const t of SIDEKICK_TEMPLATES) {
        const prompt = buildTemplatePrompt(t, { persona, signedIn: true });
        expect(prompt).toContain(USE_RECORD);
        expect(prompt).not.toContain(NO_SCORE);
        expect(prompt).not.toMatch(/\{\w+\}/);
      }
    }
  });

  it("are unchanged for someone who is not signed in", () => {
    for (const signedIn of [false, undefined]) {
      const prompt = buildTemplatePrompt(SIDEKICK_TEMPLATES[0]!, { persona: "default", signedIn });
      expect(prompt).toContain(`${NO_SCORE}, so focus on the activity and ask me for any facts you need.`);
      expect(prompt).not.toContain("saved record");
    }
  });

  it("still quote the calculation that is open, when there is one", () => {
    const prompt = buildTemplatePrompt(SIDEKICK_TEMPLATES[0]!, {
      persona: "default",
      signedIn: true,
      totalValue: 950,
      totalHours: 40,
      topActivity: "Dog walking",
    });
    expect(prompt).toContain("My current My Impact total social value is £950 (about 40 hours logged).");
    expect(prompt).not.toContain("saved record");
  });

  it("never mention a personal record in an organisation prompt", () => {
    const manager: SidekickUserContext = { persona: "org_manager", signedIn: true, totalValue: 950 };
    for (const t of templatesForPersona("org_manager")) {
      const prompt = buildTemplatePrompt(t, manager);
      expect(prompt).not.toContain("saved record");
      expect(prompt).not.toContain("£950");
    }
  });

  // Prompts are sent as the person's own message, which has a length limit.
  // The new sentence is shorter than the one it replaces, so no prompt can
  // get longer than it already was, whatever the limit is set to.
  it("are never longer than the prompt they replace", () => {
    let longest = 0;
    for (const persona of PERSONAL) {
      for (const t of SIDEKICK_TEMPLATES) {
        const signedIn = buildTemplatePrompt(t, { persona, signedIn: true });
        const signedOut = buildTemplatePrompt(t, { persona });
        expect(signedIn.length).toBeLessThanOrEqual(signedOut.length);
        for (let attempt = 0; attempt < 5; attempt++) {
          longest = Math.max(longest, buildRegeneratePrompt(signedIn, attempt, persona).length);
        }
      }
    }
    // Well inside the 600 characters the server accepts for one message.
    expect(longest).toBeLessThanOrEqual(600);
  });

  // The UCAS, CV and cover-letter prompts ask for evidence and planning, not
  // finished wording (applicationWritingSafety.test). Pointing to the saved
  // record must change that one sentence and nothing else.
  it("change nothing else in a prompt, so the application templates keep their safeguards", () => {
    for (const t of SIDEKICK_TEMPLATES) {
      for (const persona of PERSONAL) {
        const signedIn = buildTemplatePrompt(t, { persona, signedIn: true });
        const signedOut = buildTemplatePrompt(t, { persona });
        expect(
          signedIn.replace(USE_RECORD, `${NO_SCORE}, so focus on the activity and ask me for any facts you need.`),
        ).toBe(signedOut);
      }
    }
  });
});
