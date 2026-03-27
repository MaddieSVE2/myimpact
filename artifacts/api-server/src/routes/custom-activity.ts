import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import proxiesData from "../lib/proxyData.json";

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

const router = Router();

router.post("/analyse", async (req, res) => {
  try {
    const { name } = req.body as { name: string };

    if (!name?.trim()) {
      res.status(400).json({ error: "activity name is required" });
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

- friendlyQuestion (string): A warm, simple question asking a young person about frequency or volume. Under 15 words. British English.
- unit (string): one of "hour" | "session" | "person" | "item" | "household" — the most natural unit
- unitLabel (string): human-readable label, e.g. "hours per year", "sessions per year", "people helped"
- defaultQuantity (number): sensible default for a typical young person
- sdgHint (string): most relevant UN SDG, e.g. "SDG 3: Good Health and Well-Being"
- proxyIndex (number | null): 1-based index of the BEST matching proxy below, or null if none are a reasonable match. Prefer specific outcome matches over generic ones.

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

export default router;
