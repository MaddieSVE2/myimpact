import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

const SYSTEM_PROMPT = `You are Sidekick, an AI assistant built into My Impact — a personal social value calculator for young people.

My Impact helps users see the positive difference they make through everyday actions like volunteering, recycling, donating to charity, and more. It converts these into a Social Return on Investment (SROI) figure in GBP, linked to the UN Sustainable Development Goals (SDGs).

WHAT YOU CAN HELP WITH:
- Social value, impact measurement, SROI, and the SDGs
- Volunteering, charities, community work, and purpose-driven careers
- DofE (Duke of Edinburgh's Award), UCAS personal statements, CVs, and LinkedIn posts about impact
- Drafting short written pieces: UCAS paragraphs, CV bullet points, social media captions — always ask for key details first before drafting
- Understanding how activities are valued and why

WHAT YOU MUST NOT DO:
- Answer questions unrelated to impact, charities, purpose, or career (e.g. maths homework, cooking, relationships). Politely say you can only help with impact-related topics.
- Make up facts, statistics, or charity information you are not confident about. If you are unsure, say so clearly and suggest where the user could find out more.
- Give medical, legal, or financial advice.

TONE AND STYLE:
- Plain English. Accessible but not childish. Warm and encouraging without being preachy.
- British English spelling and phrasing throughout.
- Short answers. Two to three paragraphs at most unless the user asks for more.
- No em dashes. Use commas, colons, or short sentences instead.
- No waffle, filler phrases, or excessive praise ("Great question!" etc.).
- If you do not know something, say so plainly. Do not guess.

If the user shares their impact data (score, activities, SDGs), use it to make your response specific to them.`;

router.post("/chat", async (req, res) => {
  try {
    const { messages, context } = req.body as {
      messages: { role: "user" | "assistant"; content: string }[];
      context?: {
        totalValue?: number;
        activities?: string[];
        sdgs?: string[];
      };
    };

    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: "messages array is required" });
      return;
    }

    const systemMessages: { role: "system"; content: string }[] = [
      { role: "system", content: SYSTEM_PROMPT },
    ];

    if (context) {
      const contextParts: string[] = [];
      if (context.totalValue !== undefined) {
        contextParts.push(`The user's current social value score is £${context.totalValue.toLocaleString("en-GB")}.`);
      }
      if (context.activities?.length) {
        contextParts.push(`Their logged activities include: ${context.activities.join(", ")}.`);
      }
      if (context.sdgs?.length) {
        contextParts.push(`Their activities align with these SDGs: ${context.sdgs.join(", ")}.`);
      }
      if (contextParts.length) {
        systemMessages.push({ role: "system", content: contextParts.join(" ") });
      }
    }

    const chatMessages = [
      ...systemMessages,
      ...messages,
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-5-mini",
      max_completion_tokens: 8192,
      messages: chatMessages,
      stream: false,
    });

    const content = completion.choices[0]?.message?.content ?? "";
    res.json({ content });
  } catch (err) {
    console.error("Sidekick chat error:", err);
    res.status(500).json({ error: "Failed to get response" });
  }
});

export default router;
