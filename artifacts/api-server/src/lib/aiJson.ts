/**
 * One JSON-mode chat completion, retried once on an empty or unparseable
 * answer. Throws if the model call itself fails twice.
 */
import { openai } from "@workspace/integrations-openai-ai-server";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export async function completeJson(
  messages: ChatMessage[],
  maxCompletionTokens: number,
): Promise<Record<string, unknown> | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-5-mini",
        max_completion_tokens: maxCompletionTokens,
        reasoning_effort: "low",
        response_format: { type: "json_object" },
        messages,
      });
      const content = completion.choices[0]?.message?.content;
      if (!content?.trim()) {
        console.warn(`completeJson: empty model output (attempt ${attempt + 1})`);
        continue;
      }
      try {
        return JSON.parse(content) as Record<string, unknown>;
      } catch {
        console.warn(`completeJson: unparseable model output (attempt ${attempt + 1})`);
        continue;
      }
    } catch (err) {
      console.error(`completeJson: model call failed (attempt ${attempt + 1}):`, err);
      if (attempt === 1) throw err;
    }
  }
  return null;
}
