import { Router } from "express";
import { completeJson } from "../lib/aiJson.js";
import { createRateLimiter } from "../lib/rateLimiter.js";
import { authenticate } from "../middleware/authenticate.js";
import { textAiQuota } from "../lib/textAiUsage.js";
import { ACTIVITIES } from "../lib/impactData";
import { getEnabledProxies } from "../lib/proxyStore.js";
import { deflateProxyValue } from "../lib/proxyValuation.js";
import { candidateProxies, safeHoursPerUnit, unitFitsProxy } from "../lib/proxyMatch.js";

const UNIT_LABELS: Record<string, string> = {
  hour: "hours per year",
  session: "sessions per year",
  person: "people helped",
  item: "items per year",
  household: "households",
};

// Litter picking is valued via the GMCA "welfare cost from significant
// litter accumulation" proxy (per household). The proxy title reads like a
// cost, which confuses users, so this deterministic route pairs it with a
// plain-English question about households benefiting. Conservative (low
// value) variant is preferred.
const LITTER_RE = /\blitter[\s-]?pick(?:ing|er|ers|s|ed)?\b|\bpick(?:ing|ed)?\s+(?:up\s+)?litter\b/i;

// Monetary donation detection: money donations must be valued 1:1 with the
// amount given (annualised from the stated period), never matched to an
// hourly/weekly proxy — otherwise "£72 a year" can get inflated into a
// weekly habit (£72 × 48 weeks). Detection lives in lib/donationRepair so
// the History "fix this entry" repair path shares the exact same logic.
export { parseDonation } from "../lib/donationRepair";
import { parseDonation, parseMoneyRaised } from "../lib/donationRepair";

const router = Router();

const customActivityRateLimit = createRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  message: "Too many requests. Please slow down.",
});

const MAX_NAME_CHARS = 200;
const MAX_DESCRIPTION_CHARS = 500;

router.post("/analyse", authenticate, customActivityRateLimit, textAiQuota, async (req, res) => {
  try {
    const { name } = req.body as { name: string };

    if (!name?.trim()) {
      res.status(400).json({ error: "activity name is required" });
      return;
    }

    if (name.length > MAX_NAME_CHARS) {
      res.status(400).json({ error: `Activity name must be at most ${MAX_NAME_CHARS} characters.` });
      return;
    }

    // Money raised counts pound for pound, at the amount stated if there is
    // one. Matching it to a proxy instead can turn "raised £200" into 200
    // items, each given volunteer hours.
    const raised = parseMoneyRaised(name.trim());
    if (raised) {
      res.json({
        friendlyQuestion: "How much do you raise for charity each year, in pounds?",
        unit: "pound",
        unitLabel: "pounds raised per year",
        defaultQuantity: raised.amount ?? 500,
        sdgHint: "SDG 17: Partnerships for the Goals",
        proxyMatch: {
          title: "Amount raised for charity",
          proxyYear: "",
          valuePerUnit: 1,
          unit: "pound",
        },
      });
      return;
    }

    // Monetary donations are valued pound-for-pound at the annualised amount
    // the user stated — never routed through AI proxy matching, which could
    // wrongly treat an annual gift as a weekly habit.
    const donation = parseDonation(name.trim());
    if (donation) {
      res.json({
        friendlyQuestion: "How much do you donate each year, in pounds?",
        unit: "pound",
        unitLabel: "pounds donated per year",
        defaultQuantity: donation.annualAmount,
        sdgHint: "SDG 17: Partnerships for the Goals",
        proxyMatch: {
          title: "Money donated to charity — counted pound for pound",
          proxyYear: "",
          valuePerUnit: 1,
          unit: "pound",
        },
      });
      return;
    }

    // Only admin-enabled proxies are ever offered to the AI matcher.
    const enabledProxies = await getEnabledProxies();

    // Deterministic litter-picking route: always use the GMCA household
    // litter proxy (low value, conservative) with a friendly question.
    if (LITTER_RE.test(name.trim())) {
      const litterProxies = enabledProxies.filter(
        p =>
          /litter accumulation/i.test(p.title) &&
          /household/i.test(p.unit) &&
          (p.allowedUnits.length === 0 || p.allowedUnits.includes("household")),
      );
      // Only the conservative (low value) variant is used deterministically;
      // if it's missing or disabled, fall through to normal AI matching.
      const picked = litterProxies.find(p => /low value/i.test(p.title));
      if (picked) {
        const valuation = deflateProxyValue(picked, "household");
        res.json({
          friendlyQuestion: "Roughly how many households make use of the area you keep tidy?",
          unit: "household",
          unitLabel: "households benefiting",
          defaultQuantity: 10,
          sdgHint: "SDG 11: Sustainable Cities and Communities",
          proxyMatch: {
            title: picked.title,
            proxyYear: picked.sourceYear,
            valuePerUnit: valuation.valuePerUnit,
            unit: "household",
            fullValuePerUnit: picked.value,
            deflationFactor: valuation.appliedFactor,
            deflationNote: valuation.note,
            horizon: picked.horizon,
          },
        });
        return;
      }
    }
    const candidates = candidateProxies(enabledProxies, name.trim());
    const candidateList = candidates
      .map((p, i) => {
        const units = p.allowedUnits.length > 0 ? ` | unit must be: ${p.allowedUnits.join(" or ")}` : "";
        return `${i + 1}. "${p.title}" | £${p.value} per: ${p.unit.trim()}${units}`;
      })
      .join("\n");

    const parsed = (await completeJson(
      [
        {
          role: "system",
          content: `You are a social value measurement assistant. Given an activity name, return a JSON object with:

- friendlyQuestion (string): A warm, simple question asking the user about frequency or volume. Under 15 words. British English. Use plain, accessible language — avoid jargon. If the activity is military-sounding, rephrase it in civilian-friendly terms (e.g. "patrol duties" -> "team leadership and safety responsibilities").
- unit (string): one of "hour" | "session" | "person" | "item" | "household" — the most natural unit
- unitLabel (string): human-readable label, e.g. "hours per year", "sessions per year", "people helped"

If the best matching proxy is valued per household, set unit to "household" and phrase friendlyQuestion in plain terms about how many households benefit or make use of the area — never echo cost/welfare-cost jargon from the proxy title.
- defaultQuantity (number): sensible default for a typical volunteer or community contributor
- hoursPerUnit (number): hours of the person's own time that ONE unit takes (one session, one person helped, one item), given up to help others or the environment. Use 0 for everyday habits and choices that take no real extra time, such as reusing bags, recycling, buying second-hand or turning lights off. Never more than 8. Use 1 when unit is "hour".
- sdgHint (string): most relevant UN SDG, e.g. "SDG 3: Good Health and Well-Being"
- proxyIndex (number | null): 1-based index of the proxy below that prices this activity, or null. Many everyday activities have NO proxy below, and null is then the right answer: a wrong proxy overstates someone's impact, which is worse than giving no value. Choose a proxy only when BOTH of these are true:
  1. Its title describes the outcome this activity itself directly produces, not one that merely shares a word or a theme with it.
  2. It is priced per the same thing the person counts. Each candidate line ends with what it is priced per: one of your unit must be one of that. A proxy priced per household, per person, per tonne, per hectare or per incident must never be applied to each small item or action (each bag, each journey, each meal). Where a line says "unit must be", use one of those units, and make friendlyQuestion and unitLabel ask about that unit.
  Example: reusing 75 carrier bags is not 75 households, 75 people or 75 tonnes of plastic, so proxyIndex is null.
- proxyFit ("strong" | "weak"): "strong" only if you are confident both conditions hold for the proxy you chose; otherwise "weak".

MILITARY TERMINOLOGY GUIDE — map these to civilian proxies:
- Patrol commander / section commander / platoon sergeant -> team leadership, supervision, community safety
- CIMIC (Civil-Military Co-operation) -> community liaison, stakeholder engagement, local development support
- QM / quartermaster / logistics NCO -> supply chain management, resource coordination
- SNCO / senior non-commissioned officer -> senior team leadership, training, mentoring
- Training wing / instruction role -> training delivery, mentoring, adult education
- Emergency first aid / combat medical technician -> first aid provision, emergency response
- Community reconstruction / stabilisation -> community development, infrastructure support
- Population liaison / cultural advisor -> cross-cultural communication, community engagement

Candidate proxies:
${candidateList || "No candidates found."}`,
        },
        {
          role: "user",
          content: `Activity: "${name.trim()}"`,
        },
      ],
      2000,
    )) ?? {};

    const matchedUnit = typeof parsed.unit === "string" ? parsed.unit : "hour";
    const unitLabel =
      typeof parsed.unitLabel === "string" && parsed.unitLabel.trim()
        ? parsed.unitLabel
        : (UNIT_LABELS[matchedUnit] ?? `${matchedUnit}s per year`);

    let proxyMatch:
      | {
          title: string;
          proxyYear: string;
          valuePerUnit: number;
          unit: string;
          fullValuePerUnit: number;
          deflationFactor: number;
          deflationNote: string | null;
          horizon: string;
        }
      | null = null;
    const confident = typeof parsed.proxyFit === "string" && parsed.proxyFit.trim().toLowerCase() === "strong";
    if (confident && typeof parsed.proxyIndex === "number" && parsed.proxyIndex >= 1) {
      const picked = candidates[parsed.proxyIndex - 1];
      // The proxy must be priced per what the person is counting. If it
      // isn't, the activity goes unvalued: swapping the unit would leave a
      // question about bags answered as a number of households.
      if (picked && unitFitsProxy(picked, matchedUnit, unitLabel)) {
        const valuation = deflateProxyValue(picked, matchedUnit);
        proxyMatch = {
          title: picked.title,
          proxyYear: picked.sourceYear,
          valuePerUnit: valuation.valuePerUnit,
          unit: matchedUnit,
          fullValuePerUnit: picked.value,
          deflationFactor: valuation.appliedFactor,
          deflationNote: valuation.note,
          horizon: picked.horizon,
        };
      }
    }

    res.json({
      friendlyQuestion:
        typeof parsed.friendlyQuestion === "string" && parsed.friendlyQuestion.trim()
          ? parsed.friendlyQuestion
          : `How many hours a year do you spend on ${name}?`,
      unit: matchedUnit,
      unitLabel,
      defaultQuantity: typeof parsed.defaultQuantity === "number" ? parsed.defaultQuantity : 20,
      // Time behind each unit, for units that aren't hours (the client
      // multiplies it by the quantity).
      hoursPerUnit: safeHoursPerUnit(parsed.hoursPerUnit),
      sdgHint: typeof parsed.sdgHint === "string" ? parsed.sdgHint : "",
      proxyMatch,
    });
  } catch (err) {
    console.error("Custom activity analyse error:", err);
    res.status(503).json({ error: "Failed to analyse activity", code: "ai_unavailable" });
  }
});

router.post("/parse-description", authenticate, customActivityRateLimit, textAiQuota, async (req, res) => {
  try {
    const { description } = req.body as { description: string };

    if (!description?.trim()) {
      res.status(400).json({ error: "description is required" });
      return;
    }

    if (description.length > MAX_DESCRIPTION_CHARS) {
      res.status(400).json({ error: `Description must be at most ${MAX_DESCRIPTION_CHARS} characters.` });
      return;
    }

    const activityList = ACTIVITIES.map(a => `- id: "${a.id}" | name: "${a.shortName}" | category: ${a.category}`).join("\n");

    const parsed = (await completeJson(
      [
        {
          role: "system",
          content: `You are a social impact assistant. A user will describe what they do in plain English. Your job is to match their description to the predefined activities listed below, and identify any activities they mention that don't match any predefined activity.

Return a JSON object with exactly two fields:
- matchedIds (string[]): an array of activity IDs from the list below that best match what the user describes. Only include IDs that are a genuine match — do not guess. Can be empty.
- unmatchedLabels (string[]): short labels (3–6 words) for distinct activities the user mentions that have NO match in the predefined list. Can be empty.

MATCHING RULES — follow these strictly:
1. Only match a predefined activity if the user has clearly and explicitly described it. Do not match on loose association, inference, or vague similarity.
2. Do not create an unmatchedLabel for any activity that semantically overlaps with an already-matched predefined ID. The same real-world behaviour must not appear in both matchedIds and unmatchedLabels.
3. "charity_books" must only be matched if the user explicitly mentions donating physical items (clothes, books, goods) to a charity shop. Mentions of donating money, fundraising, or volunteering must NOT trigger this match.
4. Monetary donations (giving money to a charity or cause, e.g. "£72 a year to a wildlife charity") must NEVER be matched to any predefined activity. Instead add an unmatchedLabel that preserves the exact amount and period, e.g. "Donating £72 a year to charity".

CAREER BREAK / PARENTING TERMINOLOGY GUIDE — map these to predefined activities:
- Stay at home parent, full-time parent, raising children, raising kids, looking after children, looking after grandchildren, caring for grandchildren, looking after my grandchild, full-time childcare, child carer, school runs, childminding, minding grandchildren → career_break_childcare
- Managing school, SEN support, special educational needs, EHCP, school liaison, children's schooling, education admin, managing schooling, handling school needs, parent-teacher coordination → career_break_school_liaison
- Managing hospital appointments, medical coordination, GP visits, specialist referrals, healthcare admin, medical appointments for dependants, managing appointments → career_break_medical_coordination
- Looking after elderly relatives, elderly parent care, caring for elderly parents or grandparents, older family member care, dementia care, eldercare coordination → career_break_eldercare

Predefined activities:
${activityList}`,
        },
        {
          role: "user",
          content: `User description: "${description.trim()}"`,
        },
      ],
      2000,
    )) ?? {};

    const matchedIds: string[] = Array.isArray(parsed.matchedIds)
      ? parsed.matchedIds.filter((id: unknown) => typeof id === "string" && ACTIVITIES.some(a => a.id === id))
      : [];

    const unmatchedLabels: string[] = Array.isArray(parsed.unmatchedLabels)
      ? parsed.unmatchedLabels.filter((l: unknown) => typeof l === "string" && l.trim().length > 0).map((l: string) => l.trim())
      : [];

    res.json({ matchedIds, unmatchedLabels });
  } catch (err) {
    console.error("Parse description error:", err);
    res.status(503).json({ error: "Failed to parse description", code: "ai_unavailable" });
  }
});

export default router;
