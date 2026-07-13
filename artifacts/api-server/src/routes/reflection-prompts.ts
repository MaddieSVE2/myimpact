import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { createRateLimiter } from "../lib/rateLimiter.js";
import { authenticate } from "../middleware/authenticate.js";
import { textAiQuota } from "../lib/textAiUsage.js";

const router = Router();

const reflectionRateLimit = createRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  message: "Too many requests. Please slow down.",
});

const MAX_TEXT_CHARS = 2000;
const MAX_CONTEXT_CHARS = 600;
const MIN_TEXT_CHARS = 12;

/**
 * Suggest 2-3 gentle clarifying questions for a free-text reflection or
 * activity description. Helps people who find it hard to articulate their
 * contribution add useful detail in their own words. Reuses the shared
 * text-AI quota and always degrades to an empty result on any failure so
 * the calling field keeps working with no error noise.
 */
router.post("/questions", authenticate, reflectionRateLimit, textAiQuota, async (req, res) => {
  try {
    const { text, context } = req.body as { text?: string; context?: string };

    const draft = typeof text === "string" ? text.trim() : "";
    const ctx = typeof context === "string" ? context.trim().slice(0, MAX_CONTEXT_CHARS) : "";

    if (draft.length < MIN_TEXT_CHARS) {
      res.json({ questions: [] });
      return;
    }

    const clipped = draft.slice(0, MAX_TEXT_CHARS);

    const completion = await openai.chat.completions.create({
      model: "gpt-5-mini",
      max_completion_tokens: 200,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You help people describe their own volunteering and community contributions. Given what someone has written so far (and optional context), suggest gentle clarifying questions that nudge them to add useful detail they may have left out — for example what they learned, who or what it helped, how much time it took, or what changed as a result.

Return a JSON object: { "questions": string[] } with AT MOST 3 questions.

Rules:
- Each question must be under 12 words, plain British English, warm and simple.
- Ask about THEIR experience in the second person ("you"), so they can answer in their own words, e.g. "Did you learn a new skill doing this?".
- Only ask questions. Never write, complete, or rewrite their answer for them.
- Don't repeat anything they've already covered. If they've already written plenty and nothing useful is missing, return fewer questions or an empty array.
- No preamble, numbering, or commentary — just the questions in the array.`,
        },
        {
          role: "user",
          content: `${ctx ? `Context: ${ctx}\n\n` : ""}What they've written so far: "${clipped}"`,
        },
      ],
    });

    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}");

    const questions: string[] = Array.isArray(parsed.questions)
      ? parsed.questions
          .filter((q: unknown): q is string => typeof q === "string" && q.trim().length > 0)
          .map((q: string) => q.trim())
          .slice(0, 3)
      : [];

    res.json({ questions });
  } catch (err) {
    console.error("Reflection questions error:", err);
    // Always degrade gracefully: the field works exactly as before with no
    // error noise when AI is unavailable or returns something unexpected.
    res.json({ questions: [] });
  }
});

export default router;
