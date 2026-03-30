import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import proxiesData from "../lib/proxyData.json";
import { ACTIVITIES } from "../lib/impactData";

interface ProxyEntry {
  title: string;
  value: number;
  unit: string;
}

const proxies: ProxyEntry[] = proxiesData as ProxyEntry[];

const STOP_WORDS = new Set([
  "a","an","the","and","or","of","in","at","to","for","is","are","by","with",
  "my","i","do","that","this","it","on","from","up","be","as","we","not",
]);

function extractKeywords(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

function candidateProxies(activityName: string, limit = 20): ProxyEntry[] {
  const keywords = extractKeywords(activityName);
  if (keywords.length === 0) return proxies.slice(0, limit);

  const scored = proxies.map(p => {
    const titleLower = p.title.toLowerCase();
    const hits = keywords.filter(k => titleLower.includes(k)).length;
    return { proxy: p, hits };
  });

  const withHits = scored.filter(s => s.hits > 0).sort((a, b) => b.hits - a.hits);
  if (withHits.length >= 3) return withHits.slice(0, limit).map(s => s.proxy);

  // Fallback: partial stem matching (first 4 chars)
  const stems = keywords.map(k => k.slice(0, 4));
  return proxies
    .map(p => ({
      proxy: p,
      hits: stems.filter(s => p.title.toLowerCase().includes(s)).length,
    }))
    .filter(s => s.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, limit)
    .map(s => s.proxy);
}

const FUNDRAISING_RE = /fund[\s-]?rais/i;

const router = Router();

router.post("/analyse", async (req, res) => {
  try {
    const { name } = req.body as { name: string };

    if (!name?.trim()) {
      res.status(400).json({ error: "activity name is required" });
      return;
    }

    if (FUNDRAISING_RE.test(name.trim())) {
      res.json({
        friendlyQuestion: "How much do you raise for charity each year, in pounds?",
        unit: "pound",
        unitLabel: "pounds raised per year",
        defaultQuantity: 500,
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

    const candidates = candidateProxies(name.trim());
    const candidateList = candidates
      .map((p, i) => `${i + 1}. "${p.title}" | £${p.value} per ${p.unit}`)
      .join("\n");

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 400,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a social value measurement assistant. Given an activity name, return a JSON object with:

- friendlyQuestion (string): A warm, simple question asking the user about frequency or volume. Under 15 words. British English. Use plain, accessible language — avoid jargon. If the activity is military-sounding, rephrase it in civilian-friendly terms (e.g. "patrol duties" -> "team leadership and safety responsibilities").
- unit (string): one of "hour" | "session" | "person" | "item" | "household" — the most natural unit
- unitLabel (string): human-readable label, e.g. "hours per year", "sessions per year", "people helped"
- defaultQuantity (number): sensible default for a typical volunteer or community contributor
- sdgHint (string): most relevant UN SDG, e.g. "SDG 3: Good Health and Well-Being"
- proxyIndex (number | null): 1-based index of the BEST matching proxy below, or null if none are a reasonable match. Prefer specific outcome matches over generic ones.

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
    });

    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}");

    let proxyMatch: { title: string; proxyYear: string; valuePerUnit: number; unit: string } | null = null;
    if (typeof parsed.proxyIndex === "number" && parsed.proxyIndex >= 1) {
      const picked = candidates[parsed.proxyIndex - 1];
      if (picked) {
        const yearMatch = picked.title.match(/\((\d{4})\)/);
        proxyMatch = {
          title: picked.title,
          proxyYear: yearMatch ? yearMatch[1] : "",
          valuePerUnit: picked.value,
          unit: parsed.unit ?? "hour",
        };
      }
    }

    res.json({
      friendlyQuestion: parsed.friendlyQuestion ?? `How many hours a year do you spend on ${name}?`,
      unit: parsed.unit ?? "hour",
      unitLabel: parsed.unitLabel ?? "hours per year",
      defaultQuantity: typeof parsed.defaultQuantity === "number" ? parsed.defaultQuantity : 20,
      sdgHint: parsed.sdgHint ?? "",
      proxyMatch,
    });
  } catch (err) {
    console.error("Custom activity analyse error:", err);
    res.status(500).json({ error: "Failed to analyse activity" });
  }
});

router.post("/parse-description", async (req, res) => {
  try {
    const { description } = req.body as { description: string };

    if (!description?.trim()) {
      res.status(400).json({ error: "description is required" });
      return;
    }

    const activityList = ACTIVITIES.map(a => `- id: "${a.id}" | name: "${a.shortName}" | category: ${a.category}`).join("\n");

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 600,
      response_format: { type: "json_object" },
      messages: [
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
    });

    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}");

    const matchedIds: string[] = Array.isArray(parsed.matchedIds)
      ? parsed.matchedIds.filter((id: unknown) => typeof id === "string" && ACTIVITIES.some(a => a.id === id))
      : [];

    const unmatchedLabels: string[] = Array.isArray(parsed.unmatchedLabels)
      ? parsed.unmatchedLabels.filter((l: unknown) => typeof l === "string" && l.trim().length > 0).map((l: string) => l.trim())
      : [];

    res.json({ matchedIds, unmatchedLabels });
  } catch (err) {
    console.error("Parse description error:", err);
    res.status(500).json({ error: "Failed to parse description" });
  }
});

export default router;
