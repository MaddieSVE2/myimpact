process.env.DATABASE_URL ||= "postgres://test:test@localhost:5432/test";
process.env.RESEND_API_KEY ||= "re_test_key";
// The OpenAI integration refuses to load without these; nothing reachable is
// behind them, so a test that reaches the AI fails rather than calling it.
process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ||= "http://127.0.0.1:9";
process.env.AI_INTEGRATIONS_OPENAI_API_KEY ||= "test";
