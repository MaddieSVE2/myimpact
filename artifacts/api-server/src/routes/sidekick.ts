import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

const SYSTEM_PROMPT = `You are Sidekick, a friendly AI assistant built into My Impact — a personal social value calculator aimed at young people aged 14–25.

My Impact helps users understand the positive difference they make to society through everyday activities like volunteering, recycling, cycling, donating to charity, and more. It converts these activities into a Social Return on Investment (SROI) figure in British pounds (GBP), aligned with the UN Sustainable Development Goals (SDGs).

You help users:
- Understand what their social value score means in plain, encouraging language
- Learn about the SDGs and how their activities connect to global goals
- Discover new ways they can increase their positive impact
- Understand how activities are valued (e.g. why volunteering is worth £X per hour)
- Explore ideas for DofE (Duke of Edinburgh) volunteering, UCAS personal statement activities, or employability
- Get encouragement and recognise that even small actions matter

Tone: warm, encouraging, and accessible. Speak like a knowledgeable older friend. Use British English. Never be preachy or lecture-y. Keep answers concise — 2–4 short paragraphs max unless asked for more detail. Use bullet points sparingly.

If a user shares their impact data (score, activities, SDGs), use it to personalise your response.`;

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
