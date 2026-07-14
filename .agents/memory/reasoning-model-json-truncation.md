---
name: gpt-5-mini JSON truncation
description: Reasoning tokens eat max_completion_tokens, truncating JSON output and crashing JSON.parse
---

# gpt-5-mini (reasoning model) JSON truncation

- `gpt-5-mini` spends invisible reasoning tokens against `max_completion_tokens`. Small budgets (200–600) frequently leave zero or truncated visible output, so `JSON.parse` throws "Unexpected end of JSON input" and endpoints 500.
- **Why:** this caused the production "Couldn't analyse that activity" bug in the quick-log Describe flow, and the same silent failure in reflection prompts (which just degraded to empty questions).
- **How to apply:** for any gpt-5-mini JSON call, use a generous budget (>= 1000–2000), pass `reasoning_effort: "low"` for simple extraction tasks, and never `JSON.parse` model output directly — guard for empty/unparseable content and fall back to defaults (see `completeJson` in the custom-activity route). Grep other routes for small `max_completion_tokens` values when this bug class resurfaces.
