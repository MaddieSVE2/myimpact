// Single source of truth for UN Sustainable Development Goal (SDG) reference data.
//
// Maps every SDG name used across the app (in personal activity data and on the
// org dashboard) to its official goal number, short label, official colour, a
// one-line plain-language description, and an info URL. Personal and org
// surfaces both read from here so the SDG story stays consistent everywhere.
//
// No social value figure is calculated here — this module only describes and
// contextualises the goals.

import type { Locale } from "@/i18n";

export interface SdgGoal {
  number: number;
  /** Canonical full name as it appears in activity data. */
  name: string;
  /** Official goal colour (hex). */
  color: string;
  /** Link to the relevant UN SDG information page. */
  url: string;
  /** Localised short label + one-line plain-language description. */
  i18n: Record<Locale, { label: string; description: string }>;
}

export const SDG_GOALS: SdgGoal[] = [
  {
    number: 1, name: "No Poverty", color: "#E5243B", url: "https://sdgs.un.org/goals/goal1",
    i18n: {
      en: { label: "No Poverty", description: "End poverty in all its forms, everywhere." },
      cy: { label: "Dim Tlodi", description: "Dod â thlodi i ben ym mhob ffurf, ym mhobman." },
    },
  },
  {
    number: 2, name: "Zero Hunger", color: "#DDA63A", url: "https://sdgs.un.org/goals/goal2",
    i18n: {
      en: { label: "Zero Hunger", description: "End hunger and make sure everyone has enough nutritious food." },
      cy: { label: "Dim Newyn", description: "Dod â newyn i ben a sicrhau bod gan bawb ddigon o fwyd maethlon." },
    },
  },
  {
    number: 3, name: "Good Health and Well-Being", color: "#4C9F38", url: "https://sdgs.un.org/goals/goal3",
    i18n: {
      en: { label: "Good Health & Wellbeing", description: "Help people live longer, healthier and happier lives." },
      cy: { label: "Iechyd Da a Llesiant", description: "Helpu pobl i fyw bywydau hirach, iachach a hapusach." },
    },
  },
  {
    number: 4, name: "Quality Education", color: "#C5192D", url: "https://sdgs.un.org/goals/goal4",
    i18n: {
      en: { label: "Quality Education", description: "Give everyone a fair chance to learn." },
      cy: { label: "Addysg o Safon", description: "Rhoi cyfle teg i bawb ddysgu." },
    },
  },
  {
    number: 5, name: "Gender Equality", color: "#FF3A21", url: "https://sdgs.un.org/goals/goal5",
    i18n: {
      en: { label: "Gender Equality", description: "Equal rights and opportunities for women and girls." },
      cy: { label: "Cydraddoldeb Rhywiol", description: "Hawliau a chyfleoedd cyfartal i fenywod a merched." },
    },
  },
  {
    number: 6, name: "Clean Water and Sanitation", color: "#26BDE2", url: "https://sdgs.un.org/goals/goal6",
    i18n: {
      en: { label: "Clean Water & Sanitation", description: "Clean water and safe sanitation for all." },
      cy: { label: "Dŵr Glân a Glanweithdra", description: "Dŵr glân a glanweithdra diogel i bawb." },
    },
  },
  {
    number: 7, name: "Affordable and Clean Energy", color: "#FCC30B", url: "https://sdgs.un.org/goals/goal7",
    i18n: {
      en: { label: "Affordable & Clean Energy", description: "Affordable, reliable and cleaner energy for everyone." },
      cy: { label: "Ynni Fforddiadwy a Glân", description: "Ynni fforddiadwy, dibynadwy a glanach i bawb." },
    },
  },
  {
    number: 8, name: "Decent Work and Economic Growth", color: "#A21942", url: "https://sdgs.un.org/goals/goal8",
    i18n: {
      en: { label: "Decent Work & Economic Growth", description: "Good jobs and a fair economy that works for all." },
      cy: { label: "Gwaith Teg a Thwf Economaidd", description: "Swyddi da ac economi deg sy'n gweithio i bawb." },
    },
  },
  {
    number: 9, name: "Industry, Innovation and Infrastructure", color: "#FD6925", url: "https://sdgs.un.org/goals/goal9",
    i18n: {
      en: { label: "Industry, Innovation & Infrastructure", description: "Build resilient infrastructure and support innovation." },
      cy: { label: "Diwydiant, Arloesedd a Seilwaith", description: "Adeiladu seilwaith gwydn a chefnogi arloesedd." },
    },
  },
  {
    number: 10, name: "Reduced Inequalities", color: "#DD1367", url: "https://sdgs.un.org/goals/goal10",
    i18n: {
      en: { label: "Reduced Inequalities", description: "Reduce inequality so no one is left behind." },
      cy: { label: "Lleihau Anghydraddoldebau", description: "Lleihau anghydraddoldeb fel nad oes neb yn cael ei adael ar ôl." },
    },
  },
  {
    number: 11, name: "Sustainable Cities and Communities", color: "#FD9D24", url: "https://sdgs.un.org/goals/goal11",
    i18n: {
      en: { label: "Sustainable Cities & Communities", description: "Make towns and cities safe, inclusive and sustainable." },
      cy: { label: "Dinasoedd a Chymunedau Cynaliadwy", description: "Gwneud trefi a dinasoedd yn ddiogel, cynhwysol a chynaliadwy." },
    },
  },
  {
    number: 12, name: "Responsible Consumption and Production", color: "#BF8B2E", url: "https://sdgs.un.org/goals/goal12",
    i18n: {
      en: { label: "Responsible Consumption & Production", description: "Use resources wisely and waste less." },
      cy: { label: "Defnydd a Chynhyrchu Cyfrifol", description: "Defnyddio adnoddau'n ddoeth a gwastraffu llai." },
    },
  },
  {
    number: 13, name: "Climate Action", color: "#3F7E44", url: "https://sdgs.un.org/goals/goal13",
    i18n: {
      en: { label: "Climate Action", description: "Take urgent action to tackle climate change." },
      cy: { label: "Gweithredu ar yr Hinsawdd", description: "Cymryd camau brys i fynd i'r afael â newid hinsawdd." },
    },
  },
  {
    number: 14, name: "Life Below Water", color: "#0A97D9", url: "https://sdgs.un.org/goals/goal14",
    i18n: {
      en: { label: "Life Below Water", description: "Protect oceans, seas and marine life." },
      cy: { label: "Bywyd o dan y Dŵr", description: "Diogelu'r cefnforoedd, y moroedd a bywyd morol." },
    },
  },
  {
    number: 15, name: "Life on Land", color: "#56C02B", url: "https://sdgs.un.org/goals/goal15",
    i18n: {
      en: { label: "Life on Land", description: "Protect nature, wildlife and the land we depend on." },
      cy: { label: "Bywyd ar y Tir", description: "Diogelu natur, bywyd gwyllt a'r tir rydym yn dibynnu arno." },
    },
  },
  {
    number: 16, name: "Peace, Justice and Strong Institutions", color: "#00689D", url: "https://sdgs.un.org/goals/goal16",
    i18n: {
      en: { label: "Peace, Justice & Strong Institutions", description: "Promote peaceful, fair and inclusive societies." },
      cy: { label: "Heddwch, Cyfiawnder a Sefydliadau Cryf", description: "Hyrwyddo cymdeithasau heddychlon, teg a chynhwysol." },
    },
  },
  {
    number: 17, name: "Partnerships for the Goals", color: "#19486A", url: "https://sdgs.un.org/goals/goal17",
    i18n: {
      en: { label: "Partnerships for the Goals", description: "Work together globally to achieve the goals." },
      cy: { label: "Partneriaethau dros y Nodau", description: "Cydweithio'n fyd-eang i gyflawni'r nodau." },
    },
  },
];

/** Normalise an SDG name/label so minor punctuation/casing differences match. */
function normalise(s: string): string {
  return s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
}

const BY_NUMBER = new Map<number, SdgGoal>(SDG_GOALS.map((g) => [g.number, g]));
const BY_NAME = new Map<string, SdgGoal>();
for (const g of SDG_GOALS) {
  BY_NAME.set(normalise(g.name), g);
  for (const loc of Object.keys(g.i18n) as Locale[]) {
    BY_NAME.set(normalise(g.i18n[loc].label), g);
  }
}

/** Look up a goal by its number. */
export function getSdgByNumber(n: number): SdgGoal | undefined {
  return BY_NUMBER.get(n);
}

/** Look up a goal by any of its names/labels (case- and punctuation-insensitive). */
export function getSdgByName(name: string | null | undefined): SdgGoal | undefined {
  if (!name) return undefined;
  return BY_NAME.get(normalise(name));
}

/** Localised short label + description for a goal, falling back to English. */
export function getSdgText(goal: SdgGoal, locale: Locale): { label: string; description: string } {
  return goal.i18n[locale] ?? goal.i18n.en;
}
