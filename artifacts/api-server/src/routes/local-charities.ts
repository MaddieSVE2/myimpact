import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

router.post("/suggest", async (req, res) => {
  try {
    const { location, activityName } = req.body as {
      location: string;
      activityName: string;
    };

    if (!location?.trim() || !activityName?.trim()) {
      res.status(400).json({ error: "location and activityName are required" });
      return;
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 500,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a UK volunteering expert. Given a location and a specific volunteering activity, suggest up to 3 real local organisations, groups, or charities where someone could do that specific activity near that location.

Return a JSON object with a "places" array. Each item has:
- name (string): the real name of the organisation or group
- description (string): one sentence, max 15 words, explaining what they do — specific to the activity
- howToJoin (string): one concrete action to get started, max 12 words

Rules:
- Only suggest groups that genuinely operate near the stated location
- Be specific — e.g. for "community garden" suggest actual named community gardens, not generic charities
- If the location is vague (e.g. "England"), suggest well-known national networks for that activity
- Skip any entry you are not reasonably confident about — quality over quantity
- Use British English
- Return 2 to 3 entries`,
        },
        {
          role: "user",
          content: `Location: ${location.trim()}\nActivity: ${activityName.trim()}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);
    const places = Array.isArray(parsed.places)
      ? parsed.places.map(({ name, description, howToJoin }: { name: string; description: string; howToJoin: string }) => ({
          name,
          description,
          howToJoin,
        }))
      : [];

    res.json({ places });
  } catch (err) {
    console.error("Local charities error:", err);
    res.status(500).json({ error: "Failed to find local organisations" });
  }
});

export default router;
