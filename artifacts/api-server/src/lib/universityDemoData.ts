/**
 * The plan for My Impact University's demo data: who its students are, what
 * they log each month and how they answer pulse surveys.
 *
 * Everything here is worked out from fixed numbers, never from chance or from
 * the database, so every run plans exactly the same students, activities and
 * answers. scripts/seed-demo.ts writes whatever part of the plan is missing.
 * Activity is planned month by month up to "now", so the dashboard's current
 * academic year keeps filling in as real time passes.
 *
 * Changing the numbers or lists below changes the plan. Rows already seeded
 * from the old plan stay in the database, so a change adds to the totals
 * instead of replacing them. Treat the plan as fixed once it has been live.
 */

export const UNI_SYNTH_EMAIL_DOMAIN = "myimpact-university.org";

/**
 * Seeded students. With the manager and the student persona this makes 10,240
 * people registered, the size of a mid-sized university's student body.
 */
export const UNI_SYNTH_COUNT = 10_238;

/** The first academic year with any activity (September 2025 to August 2026). */
const FIRST_ACADEMIC_YEAR = 2025;

/**
 * The 25 students seeded before the cohort grew. They already have activity
 * and consent in live databases, so they stay 2025 starters who log.
 */
const ORIGINAL_STUDENT_COUNT = 25;

const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Repeatable "random" numbers
// ---------------------------------------------------------------------------

/** A stream of numbers in [0, 1) that is the same every time for a given seed. */
function numberStream(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One seed from several whole numbers, so each (year, record) pair gets its own stream. */
function seedFrom(...parts: number[]): number {
  let h = 2166136261;
  for (const part of parts) {
    h = Math.imul(h ^ (part >>> 0), 16777619);
    h ^= h >>> 13;
  }
  return h >>> 0;
}

function pickWeighted<T extends { weight: number }>(items: readonly T[], roll: number): T {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let remaining = roll * total;
  for (const item of items) {
    remaining -= item.weight;
    if (remaining < 0) return item;
  }
  return items[items.length - 1]!;
}

// ---------------------------------------------------------------------------
// Students
// ---------------------------------------------------------------------------

const FIRST_NAMES = [
  "Aaliyah", "Adam", "Aisha", "Alex", "Amara", "Amelia", "Anya", "Arjun",
  "Ben", "Beth", "Callum", "Charlotte", "Chloe", "Connor", "Daniel", "Dylan",
  "Ella", "Emily", "Ethan", "Fatima", "Finn", "Freya", "George", "Grace",
  "Hannah", "Harry", "Hassan", "Imogen", "Isla", "Jack", "Jade", "James",
  "Jasmine", "Jess", "Joe", "Kai", "Katie", "Kieran", "Layla", "Leah",
  "Leo", "Lewis", "Liam", "Lily", "Lucy", "Maya", "Megan", "Mia",
  "Mohammed", "Molly", "Nadia", "Niamh", "Noah", "Olivia", "Omar", "Oscar",
  "Priya", "Rhys", "Rohan", "Ruby", "Ryan", "Sam", "Sana", "Sophie",
  "Tariq", "Tom", "Tyler", "Wei", "Yasmin", "Zain", "Zara", "Zoe",
] as const;

const LAST_NAMES = [
  "Smith", "Jones", "Taylor", "Brown", "Williams", "Wilson", "Johnson", "Davies",
  "Patel", "Robinson", "Wright", "Thompson", "Evans", "Walker", "White", "Roberts",
  "Green", "Hall", "Thomas", "Clarke", "Jackson", "Wood", "Harris", "Edwards",
  "Turner", "Martin", "Cooper", "Hill", "Ward", "Hughes", "Moore", "Clark",
  "King", "Harrison", "Lewis", "Baker", "Lee", "Allen", "Morris", "Khan",
  "Scott", "Watson", "Davis", "Parker", "James", "Bennett", "Young", "Phillips",
  "Richardson", "Mitchell", "Bailey", "Carter", "Cook", "Singh", "Shaw", "Bell",
  "Collins", "Morgan", "Kelly", "Begum", "Miller", "Cox", "Hussain", "Marshall",
  "Simpson", "Price", "Anderson", "Adams", "Wilkinson", "Ali", "Ahmed", "Foster",
  "Ellis", "Murphy", "Chapman", "Mason", "Gray", "Richards", "Webb", "Griffiths",
  "Hunt", "Palmer", "Campbell", "Holmes", "Mills", "Rogers", "Barnes", "Knight",
  "Matthews", "Barker", "Powell", "Stevens", "Kaur", "Fisher", "Butler", "Dixon",
  "Russell", "Harvey", "Pearson", "Graham", "Fletcher", "Murray", "Howard", "Shah",
  "Gibson", "Gill", "Fox", "Stewart", "Lloyd", "Elliott", "Ford", "Andrews",
  "Armstrong", "West", "Atkinson", "Dawson", "Reid", "Owen", "Sharma", "Okafor",
  "Adeyemi", "Mensah", "Nowak", "Kowalski", "Chen", "Wong", "Nguyen", "Rahman",
  "Iqbal", "Malik", "Akhtar", "Chowdhury", "Osei", "Boateng", "Popescu", "Silva",
  "Fernandes", "Costa", "Rossi", "Novak", "Dubois", "Hoang", "Tanaka", "Haddad",
] as const;

// Walking the first-name/last-name grid in steps of a prime that shares no
// factor with its size visits every pairing once, in a scattered order, so no
// two students share a full name and neighbours do not share a surname.
const NAME_GRID_SIZE = FIRST_NAMES.length * LAST_NAMES.length;
const NAME_GRID_STEP = 7919;

function studentName(index: number): string {
  const cell = (index * NAME_GRID_STEP) % NAME_GRID_SIZE;
  return `${FIRST_NAMES[cell % FIRST_NAMES.length]} ${LAST_NAMES[Math.floor(cell / FIRST_NAMES.length)]}`;
}

export interface UniStudent {
  /** Position in the cohort, from 0. */
  index: number;
  id: string;
  email: string;
  displayName: string;
  /** The September they started: 2025 or 2026. */
  intakeYear: number;
  joinedAt: Date;
  /** Whether they log activity (and so have given consent to share it). */
  logsActivity: boolean;
}

function buildStudent(index: number): UniStudent {
  const id = `uni-synth-u-${String(index + 1).padStart(3, "0")}`;
  const next = numberStream(seedFrom(1, index));
  const original = index < ORIGINAL_STUDENT_COUNT;
  const intakeYear = original || next() < 0.72 ? 2025 : 2026;
  // 2025 starters signed up across the autumn term; 2026 starters during
  // their first three weeks.
  const joinedAt = intakeYear === 2025
    ? new Date(Date.UTC(2025, 8, 8, 9) + Math.floor(next() * 50) * DAY_MS + Math.floor(next() * 10) * 60 * 60 * 1000)
    : new Date(Date.UTC(2026, 8, 1, 9) + Math.floor(next() * 20) * DAY_MS + Math.floor(next() * 10) * 60 * 60 * 1000);
  return {
    index,
    id,
    email: `${id}@${UNI_SYNTH_EMAIL_DOMAIN}`,
    displayName: studentName(index),
    intakeYear,
    joinedAt,
    logsActivity: original || next() < 0.46,
  };
}

let cachedStudents: UniStudent[] | null = null;

/** Every seeded student, in a fixed order. */
export function uniStudents(): UniStudent[] {
  cachedStudents ??= Array.from({ length: UNI_SYNTH_COUNT }, (_, index) => buildStudent(index));
  return cachedStudents;
}

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------

export interface PlannedActivity {
  activityId: string;
  quantity: number;
  hoursPerYear: number;
}

interface ActivityTemplate {
  name: string;
  activities: PlannedActivity[];
  /** How often students log this, relative to the others. */
  weight: number;
}

// What students log. Activity ids are Social Value Engine proxies from
// lib/impactData.ts, so every figure on the dashboard is valued the same way
// as a real student's entry. The mix averages a little over £1,000 a record,
// about half of it from education and the rest spread across eight categories.
const ACTIVITY_TEMPLATES: readonly ActivityTemplate[] = [
  { name: "Peer tutoring", activities: [{ activityId: "tutoring", quantity: 1, hoursPerYear: 12 }], weight: 9 },
  { name: "Peer tutoring for two first-years", activities: [{ activityId: "tutoring", quantity: 2, hoursPerYear: 20 }], weight: 3 },
  { name: "Youth mentoring programme", activities: [{ activityId: "youth_mentoring", quantity: 1, hoursPerYear: 15 }], weight: 7 },
  { name: "Reading support at a local primary school", activities: [{ activityId: "literacy_support", quantity: 1, hoursPerYear: 12 }], weight: 6 },
  { name: "Schools coding club", activities: [{ activityId: "coding_education_child", quantity: 8, hoursPerYear: 8 }], weight: 5 },
  { name: "Digital skills for older residents", activities: [{ activityId: "digital_coaching", quantity: 3, hoursPerYear: 6 }], weight: 5 },
  { name: "Duke of Edinburgh Gold volunteering", activities: [{ activityId: "dofe", quantity: 15, hoursPerYear: 15 }], weight: 6 },
  { name: "Employability drop-in", activities: [{ activityId: "employability_coaching", quantity: 8, hoursPerYear: 8 }], weight: 4 },
  { name: "Befriending an older neighbour", activities: [{ activityId: "befriending", quantity: 1, hoursPerYear: 20 }], weight: 2 },
  { name: "Coaching a community sports team", activities: [{ activityId: "sports_coaching", quantity: 1, hoursPerYear: 20 }], weight: 5 },
  { name: "Campus food bank shifts", activities: [{ activityId: "food_bank", quantity: 10, hoursPerYear: 10 }], weight: 9 },
  { name: "Charity fundraising event", activities: [{ activityId: "fundraising_events", quantity: 8, hoursPerYear: 8 }], weight: 7 },
  { name: "Nightline listening volunteer", activities: [{ activityId: "mental_health_support", quantity: 1, hoursPerYear: 20 }], weight: 4 },
  { name: "Blood donation", activities: [{ activityId: "blood_donation", quantity: 1, hoursPerYear: 1 }], weight: 4 },
  { name: "Campus tree planting day", activities: [{ activityId: "tree_planting", quantity: 1, hoursPerYear: 4 }], weight: 6 },
  { name: "Litter pick with the eco society", activities: [{ activityId: "litter_picking", quantity: 3, hoursPerYear: 6 }], weight: 6 },
  { name: "Community garden volunteering", activities: [{ activityId: "community_garden", quantity: 10, hoursPerYear: 10 }], weight: 4 },
  { name: "Junior sports coaching", activities: [{ activityId: "sport_coaching", quantity: 20, hoursPerYear: 20 }], weight: 8 },
  { name: "Student society committee mentoring", activities: [{ activityId: "mentoring_professional", quantity: 24, hoursPerYear: 24 }], weight: 6 },
  { name: "Community arts workshop", activities: [{ activityId: "arts_community_creative", quantity: 10, hoursPerYear: 10 }], weight: 3 },
  { name: "Animal shelter volunteering", activities: [{ activityId: "animal_shelter", quantity: 12, hoursPerYear: 12 }], weight: 3 },
];

// Share of a year's activity that falls in each month, September to August:
// busiest in the autumn and spring terms, quiet over exams and the summer.
const MONTH_SHARE = [1.3, 1.5, 1.4, 0.7, 0.9, 1.1, 1.2, 0.8, 0.7, 0.5, 0.3, 0.3] as const;
const MONTH_SHARE_TOTAL = MONTH_SHARE.reduce((sum, share) => sum + share, 0);

/** Records logged across one academic year. The programme grows each year. */
function recordsInAcademicYear(academicYear: number): number {
  return 3_500 + 1_400 * (academicYear - FIRST_ACADEMIC_YEAR);
}

/** The year in which the academic year containing `date` began. */
export function academicYearOf(date: Date): number {
  return date.getUTCMonth() >= 8 ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
}

/** That year's loggers in a fixed shuffled order, so activity is spread across them. */
function loggersFor(academicYear: number): UniStudent[] {
  const loggers = uniStudents().filter((s) => s.logsActivity && s.intakeYear <= academicYear);
  const next = numberStream(seedFrom(2, academicYear));
  for (let i = loggers.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [loggers[i], loggers[j]] = [loggers[j]!, loggers[i]!];
  }
  return loggers;
}

export interface PlannedUniRecord {
  userId: string;
  name: string;
  entryDate: Date;
  activities: PlannedActivity[];
}

/**
 * Every activity record the seeded students have logged up to `now`, oldest
 * academic year first. A record's student, name and date never change from
 * one call to the next; a later `now` only adds records to the end of each
 * month, so the three together identify a record that has been seeded.
 */
export function planUniRecords(now: Date): PlannedUniRecord[] {
  const records: PlannedUniRecord[] = [];
  for (let academicYear = FIRST_ACADEMIC_YEAR; academicYear <= academicYearOf(now); academicYear++) {
    const loggers = loggersFor(academicYear);
    const yearTotal = recordsInAcademicYear(academicYear);
    let recordIndex = 0;
    for (let monthOfYear = 0; monthOfYear < MONTH_SHARE.length; monthOfYear++) {
      const year = monthOfYear < 4 ? academicYear : academicYear + 1;
      const month = (8 + monthOfYear) % 12;
      const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
      const monthTotal = Math.round((yearTotal * MONTH_SHARE[monthOfYear]!) / MONTH_SHARE_TOTAL);
      for (let i = 0; i < monthTotal; i++, recordIndex++) {
        const next = numberStream(seedFrom(3, academicYear, recordIndex));
        const template = pickWeighted(ACTIVITY_TEMPLATES, next());
        const day = 1 + Math.floor(next() * daysInMonth);
        const hour = 9 + Math.floor(next() * 10);
        const entryDate = new Date(Date.UTC(year, month, day, hour));
        if (entryDate > now) continue;
        records.push({
          userId: loggers[recordIndex % loggers.length]!.id,
          name: template.name,
          entryDate,
          activities: template.activities,
        });
      }
    }
  }
  return records;
}

// ---------------------------------------------------------------------------
// Pulse surveys
// ---------------------------------------------------------------------------

export const UNI_SURVEYS = [
  {
    id: "uni-ps-001",
    template: "meaningfulness" as const,
    question: "How meaningful does your volunteering feel this term?",
    schedule: "monthly" as const,
    createdAt: new Date("2025-10-01T09:00:00.000Z"),
  },
  {
    id: "uni-ps-002",
    template: "custom" as const,
    question: "How much is volunteering helping you build skills for after graduation?",
    schedule: "quarterly" as const,
    createdAt: new Date("2025-10-01T09:05:00.000Z"),
  },
];

// Comments on particular windows, each from the student at `studentIndex`.
// The first five were seeded before the cohort grew and keep their places.
const SURVEY_COMMENTS: Record<string, Array<{ studentIndex: number; rating: number; text: string }>> = {
  "uni-ps-001|2025-11": [{ studentIndex: 2, rating: 5, text: "The mentoring scheme has been a highlight of my first term." }],
  "uni-ps-001|2026-02": [{ studentIndex: 5, rating: 3, text: "Would be great to have more weekend options around exams." }],
  "uni-ps-002|2026-Q1": [{ studentIndex: 9, rating: 5, text: "Ran my first workshop solo, straight onto the CV." }],
  "uni-ps-001|2026-05": [{ studentIndex: 14, rating: 3, text: "Fitting shifts around revision was hard, but the food bank team were flexible." }],
  "uni-ps-002|2026-Q2": [{ studentIndex: 31, rating: 5, text: "Talked about my tutoring in two placement interviews this term." }],
  "uni-ps-002|2026-Q3": [{ studentIndex: 47, rating: 5, text: "Used my coaching hours as evidence in a graduate scheme application." }],
  "uni-ps-001|2026-09": [{ studentIndex: 58, rating: 5, text: "Freshers' volunteering fair made it easy to find something that fits my timetable." }],
  "uni-ps-001|2026-10": [
    { studentIndex: 63, rating: 5, text: "Reading support at the primary school is the best part of my week." },
    { studentIndex: 71, rating: 3, text: "More sessions near the north campus would help those of us without a car." },
  ],
};

export interface PlannedSurveyResponse {
  id: string;
  surveyId: string;
  userId: string;
  windowKey: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
}

interface SurveyWindow {
  key: string;
  start: Date;
  /** Exclusive. */
  end: Date;
}

/** Windows that have fully closed by `now`, from the survey's first month or quarter on. */
function closedWindows(schedule: "monthly" | "quarterly", from: Date, now: Date): SurveyWindow[] {
  const windows: SurveyWindow[] = [];
  const monthsPerWindow = schedule === "monthly" ? 1 : 3;
  let year = from.getUTCFullYear();
  let month = Math.floor(from.getUTCMonth() / monthsPerWindow) * monthsPerWindow;
  for (;;) {
    const start = new Date(Date.UTC(year, month, 1));
    const end = new Date(Date.UTC(year, month + monthsPerWindow, 1));
    if (end > now) break;
    windows.push({
      key: schedule === "monthly"
        ? `${year}-${String(month + 1).padStart(2, "0")}`
        : `${year}-Q${month / 3 + 1}`,
      start,
      end,
    });
    year = end.getUTCFullYear();
    month = end.getUTCMonth();
  }
  return windows;
}

/**
 * Answers to both pulse surveys for every window that has closed by `now`.
 * The window still open is left alone so the student persona can answer it
 * in a demo. Ratings improve a little over time, as a settled programme's do.
 */
export function planUniSurveyResponses(now: Date): PlannedSurveyResponse[] {
  const students = uniStudents();
  const responses: PlannedSurveyResponse[] = [];
  UNI_SURVEYS.forEach((survey, surveyIndex) => {
    closedWindows(survey.schedule, survey.createdAt, now).forEach((window, windowIndex) => {
      const academicYear = academicYearOf(window.start);
      const loggers = students.filter((s) => s.logsActivity && s.intakeYear <= academicYear);
      const next = numberStream(seedFrom(4, surveyIndex, window.start.getTime() / DAY_MS));
      const summer = window.start.getUTCMonth() === 6 || window.start.getUTCMonth() === 7;
      const wanted = Math.round((240 + next() * 120) * (summer ? 0.5 : 1));
      const comments = new Map((SURVEY_COMMENTS[`${survey.id}|${window.key}`] ?? []).map((c) => [c.studentIndex, c]));

      // Commenters always answer; the rest are every nth logger from a
      // starting point that moves each window.
      const respondents = new Map<number, UniStudent>();
      for (const studentIndex of comments.keys()) respondents.set(studentIndex, students[studentIndex]!);
      const step = Math.max(1, Math.floor(loggers.length / wanted));
      for (let i = Math.floor(next() * step); i < loggers.length && respondents.size < wanted; i += step) {
        respondents.set(loggers[i]!.index, loggers[i]!);
      }

      // Later windows lean towards higher ratings.
      const lift = Math.min(windowIndex, 12) * 0.006;
      const ratingWeights = [
        { rating: 1, weight: 0.02 },
        { rating: 2, weight: 0.07 - lift / 2 },
        { rating: 3, weight: 0.23 - lift },
        { rating: 4, weight: 0.42 + lift / 2 },
        { rating: 5, weight: 0.26 + lift },
      ];
      const windowDays = Math.round((window.end.getTime() - window.start.getTime()) / DAY_MS);
      for (const student of respondents.values()) {
        const comment = comments.get(student.index);
        responses.push({
          id: `seed-${survey.id}-${window.key}-u${student.index}`,
          surveyId: survey.id,
          userId: student.id,
          windowKey: window.key,
          rating: comment?.rating ?? pickWeighted(ratingWeights, next()).rating,
          comment: comment?.text ?? null,
          createdAt: new Date(window.start.getTime() + Math.floor(next() * windowDays) * DAY_MS + (9 + Math.floor(next() * 10)) * 60 * 60 * 1000),
        });
      }
    });
  });
  return responses;
}
