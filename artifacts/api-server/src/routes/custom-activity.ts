import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

router.post("/analyse", async (req, res) => {
  try {
    const { name } = req.body as { name: string };

    if (!name?.trim()) {
      res.status(400).json({ error: "activity name is required" });
      return;
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 256,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a social value measurement assistant. Given an activity name, return a JSON object with these fields:

- friendlyQuestion (string): A warm, simple question to ask a young person about this activity. It should ask about frequency or volume in a way that feels natural. Examples: "How many hours a year do you spend doing this?", "About how many times a year do you do this?"
- unit (string): one of "hour" | "time" | "item" — the most natural unit for this activity
- unitLabel (string): human-readable label for the input, e.g. "hours per year", "times per year", "items per year"
- defaultQuantity (number): a sensible default for a typical person, in the chosen unit
- sdgHint (string): the single most relevant UN SDG goal number and short name, e.g. "SDG 3: Good Health and Well-Being"

Use British English. Keep the question under 15 words. Be encouraging and conversational.`,
        },
        {
          role: "user",
          content: `Activity: "${name.trim()}"`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);

    res.json({
      friendlyQuestion: parsed.friendlyQuestion ?? `How many hours a year do you spend on ${name}?`,
      unit: parsed.unit ?? "hour",
      unitLabel: parsed.unitLabel ?? "hours per year",
      defaultQuantity: typeof parsed.defaultQuantity === "number" ? parsed.defaultQuantity : 20,
      sdgHint: parsed.sdgHint ?? "",
    });
  } catch (err) {
    console.error("Custom activity analyse error:", err);
    res.status(500).json({ error: "Failed to analyse activity" });
  }
});

export default router;
