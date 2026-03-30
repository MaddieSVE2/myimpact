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
          content: `You are a UK volunteering expert. Given a location and a specific volunteering activity, suggest up to 3 real local organisations, groups, or charities where someone could do that specific activity within the user's local authority/council area.

Return a JSON object with a "places" array. Each item has:
- name (string): the real name of the organisation or group
- description (string): one sentence, max 15 words, explaining what they do — specific to the activity
- howToJoin (string): one concrete action to get started, max 12 words
- website (string | null): the organisation's own website URL (e.g. "https://example.org") — only include if you are confident it is correct; otherwise return null

Rules:
- First, identify the specific local authority or council area for the given location (e.g. Fife Council, Glasgow City Council, Leeds City Council)
- Only suggest organisations that operate specifically within that identified local authority — not neighbouring councils or regions
- Do NOT expand to neighbouring areas, even if it would produce more results — strict boundary adherence is required
- If you cannot confidently find 2 or more real organisations within that specific local authority, return only the ones you are confident about (even just 1, or an empty array)
- Be specific — e.g. for "community garden" suggest actual named community gardens, not generic charities
- If the location is vague (e.g. "England"), suggest well-known national networks for that activity
- Skip any entry you are not reasonably confident about — quality over quantity
- Only provide a website URL if you are highly confident it is the correct, real URL for that organisation — return null if unsure
- Use British English`,
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
      ? parsed.places.map(({ name, description, howToJoin, website }: { name: string; description: string; howToJoin: string; website?: string | null }) => ({
          name,
          description,
          howToJoin,
          website: typeof website === "string" && website.startsWith("http") ? website : null,
        }))
      : [];

    res.json({ places });
  } catch (err) {
    console.error("Local charities error:", err);
    res.status(500).json({ error: "Failed to find local organisations" });
  }
});

export default router;
