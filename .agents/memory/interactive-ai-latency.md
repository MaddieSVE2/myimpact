---
name: Interactive AI latency
description: Model choice and timeout pattern for latency-sensitive UI suggestions
---
gpt-5-mini (even with reasoning_effort low) regularly takes >5s per call, which is too slow for interactive UI features like journal question suggestions. gpt-4.1-mini answers the same JSON prompt in ~1s.

**Why:** Reasoning models burn time on hidden reasoning tokens; users abandon suggestion panels after a few seconds.

**How to apply:** For any latency-sensitive AI endpoint, prefer a fast non-reasoning model, pass `{ signal: AbortSignal.timeout(~5000) }` as the second arg to openai.chat.completions.create, and return curated fallback content (flagged e.g. `fallback: true`) on timeout/error/empty rather than an empty array. Mirror a slightly longer hard cap client-side so spinners never linger.
