import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

router.post("/suggest", async (req, res) => {
  try {
    const { location, interests } = req.body as {
      location: string;
      interests: string[];
    };

    if (!location?.trim()) {
      res.status(400).json({ error: "location is required" });
      return;
    }

    const interestList = (interests ?? []).join(", ") || "general volunteering";

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 600,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a UK volunteering and charity expert. Given a UK location and a list of interest areas, suggest 3 real, active local charities or volunteer organisations in or very near that location that are genuinely relevant to those interests.

Return a JSON object with a "charities" array. Each charity has:
- name (string): the real charity name
- description (string): one sentence about what they do, 15 words max, UK English
- category (string): one of Environment, Education, Health, Community
- url (string): the real website URL if you know it with confidence, otherwise an empty string — do NOT make up URLs
- howToGet involved (string): one brief sentence on how to start, 12 words max

Important rules:
- Only suggest charities that genuinely operate in or very near the stated location
- If you are not confident a charity exists at that location, skip it
- Prioritise interests that match the user's stated areas
- If location is vague (e.g. "UK", "England"), suggest well-known national organisations instead
- Use British English throughout
- Return exactly 3 charities`,
        },
        {
          role: "user",
          content: `Location: ${location.trim()}\nInterests: ${interestList}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);
    const charities = Array.isArray(parsed.charities) ? parsed.charities : [];

    res.json({ charities, location: location.trim() });
  } catch (err) {
    console.error("Local charities error:", err);
    res.status(500).json({ error: "Failed to find local charities" });
  }
});

export default router;
